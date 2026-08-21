const nodemailer = require("nodemailer");
const { htmlToText } = require("html-to-text");
const axios = require("axios");
const fs = require("fs/promises");

let transporter = null;
let runtimeSmtpUser = null;
let runtimeSmtpPass = null;
let runtimeProvider = process.env.EMAIL_PROVIDER || "smtp";

const smtpOptions = {
  connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT || 10000),
  greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT || 5000),
  socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT || 10000),
};

const isPlaceholder = (value = "") =>
  /^(your_|your-|example|test@|password|change-me)/i.test(String(value).trim());

const getProvider = () =>
  String(process.env.EMAIL_PROVIDER || runtimeProvider || "smtp")
    .trim()
    .toLowerCase();

const verifyWithTimeout = (candidate) => {
  let timeout;
  const timedOut = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      const error = new Error("SMTP verification timed out");
      error.code = "ETIMEDOUT";
      reject(error);
    }, 10000);
  });

  return Promise.race([candidate.verify(), timedOut]).finally(() =>
    clearTimeout(timeout),
  );
};

const getSmtpOptions = (
  user,
  pass,
  host = process.env.SMTP_HOST,
  requestedPort = process.env.SMTP_PORT,
) => {
  const resolvedHost = host || "smtp.gmail.com";
  const configuredPort = Number(requestedPort);
  const isValidPort =
    Number.isInteger(configuredPort) &&
    configuredPort >= 1 &&
    configuredPort <= 65535;
  const isGmail = resolvedHost.toLowerCase() === "smtp.gmail.com";
  const isRender =
    Boolean(process.env.RENDER) || process.env.NODE_ENV === "production";
  const port = isRender || isGmail ? 465 : isValidPort ? configuredPort : 465;
  const usesImplicitTls = port === 465;
  const usesStartTls = port === 587 || port === 2525;

  return {
    host: resolvedHost,
    port,
    secure: usesImplicitTls,
    requireTLS: usesStartTls,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    ...smtpOptions,
  };
};

const createTransporter = (user, pass) => {
  const activeUser = user ?? runtimeSmtpUser ?? process.env.SMTP_USER;
  const activePass = pass ?? runtimeSmtpPass ?? process.env.SMTP_PASS;

  if (user && pass) {
    runtimeSmtpUser = user;
    runtimeSmtpPass = pass;
    process.env.SMTP_USER = user;
    process.env.SMTP_PASS = pass;
  }

  if (
    activeUser &&
    activePass &&
    !isPlaceholder(activeUser) &&
    !isPlaceholder(activePass)
  ) {
    console.log(`Configuring SMTP with user: ${activeUser}`);
    transporter = nodemailer.createTransport(
      getSmtpOptions(activeUser, activePass),
    );
    return true;
  }

  if (
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    !isPlaceholder(process.env.SMTP_USER) &&
    !isPlaceholder(process.env.SMTP_PASS)
  ) {
    transporter = nodemailer.createTransport(
      getSmtpOptions(process.env.SMTP_USER, process.env.SMTP_PASS),
    );
    return true;
  }
  return false;
};

if (
  process.env.SMTP_USER?.toLowerCase().endsWith("@gmail.com") &&
  process.env.SMTP_PASS &&
  process.env.SMTP_PASS.replace(/\s+/g, "").length !== 16
) {
  console.warn(
    "SMTP warning: Gmail SMTP_PASS should be a 16-character App Password.",
  );
}

createTransporter();

exports.configure = async (config = {}, legacyPass) => {
  const options =
    typeof config === "string"
      ? { email: config, password: legacyPass }
      : config || {};
  const provider = String(
    options.provider || process.env.EMAIL_PROVIDER || "smtp",
  )
    .trim()
    .toLowerCase();

  if (provider === "resend") {
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
      const error = new Error(
        "Resend requires RESEND_API_KEY and RESEND_FROM_EMAIL.",
      );
      error.code = "INVALID_PROVIDER_CONFIG";
      throw error;
    }
    runtimeProvider = "resend";
    console.log("Email provider configured: resend (HTTP API)");
    return { provider: "resend" };
  }

  if (provider !== "smtp") {
    const error = new Error(`Unsupported email provider: ${provider}`);
    error.code = "INVALID_PROVIDER";
    throw error;
  }
  const host = options.host || options.SMTP_HOST || process.env.SMTP_HOST;
  const normalizedUser = String(
    options.user ||
      options.email ||
      options.SMTP_USER ||
      process.env.SMTP_USER ||
      "",
  ).trim();
  const normalizedPass = String(
    options.pass ||
      options.password ||
      options.SMTP_PASS ||
      process.env.SMTP_PASS ||
      "",
  ).replace(/\s+/g, "");

  if (!normalizedUser || !normalizedPass) {
    throw new Error("Email and Password are required");
  }
  if (
    normalizedUser.toLowerCase().endsWith("@gmail.com") &&
    normalizedPass.length !== 16
  ) {
    const error = new Error(
      "Gmail requires a 16-character App Password without spaces.",
    );
    error.code = "INVALID_APP_PASSWORD";
    throw error;
  }

  const previousTransporter = transporter;
  const previousUser = runtimeSmtpUser;
  const previousPass = runtimeSmtpPass;
  const candidate = nodemailer.createTransport(
    getSmtpOptions(
      normalizedUser,
      normalizedPass,
      host,
      options.port || options.SMTP_PORT,
    ),
  );

  try {
    console.log(
      `SMTP verification using ${candidate.options.host}:${candidate.options.port} secure=${candidate.options.secure}`,
    );
    await verifyWithTimeout(candidate);
    transporter = candidate;
    runtimeSmtpUser = normalizedUser;
    runtimeSmtpPass = normalizedPass;
    runtimeProvider = "smtp";
    console.log(
      `SMTP verified for user: ${normalizedUser} on port ${candidate.options.port}`,
    );
    return candidate;
  } catch (error) {
    transporter = previousTransporter;
    runtimeSmtpUser = previousUser;
    runtimeSmtpPass = previousPass;
    if (process.env.NODE_ENV === "production") {
      console.error("SMTP verification failed:", {
        code: error.code,
        command: error.command,
        message: error.message,
      });
    } else {
      console.error("SMTP verification failed:", error.message);
    }
    const verificationError = new Error(
      `SMTP verification failed: ${error.message}`,
    );
    verificationError.code = error.code;
    verificationError.command = error.command;
    throw verificationError;
  }
};

exports.sendEmail = async ({
  to,
  subject,
  html,
  fromName,
  fromEmail,
  attachments,
}) => {
  const text = htmlToText(html);

  if (getProvider() === "resend") {
    try {
      const resendAttachments = await Promise.all(
        (attachments || []).map(async (attachment) => ({
          filename: attachment.filename,
          content: (await fs.readFile(attachment.path)).toString("base64"),
        })),
      );
      const response = await axios.post(
        "https://api.resend.com/emails",
        {
          from: `${fromName || "Email Sender"} <${process.env.RESEND_FROM_EMAIL}>`,
          to: [to],
          subject,
          text,
          html,
          attachments: resendAttachments,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        },
      );
      return { success: true, messageId: response.data?.id };
    } catch (error) {
      console.error(
        "Resend API send failed:",
        error.response?.data || error.message,
      );
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  if (!transporter) {
    const missingConfig = !process.env.SMTP_USER || !process.env.SMTP_PASS;
    const message = missingConfig
      ? "SMTP is not configured on the server. Set SMTP_USER and SMTP_PASS in Render/production environment."
      : "SMTP transport could not be initialized.";
    console.error(message);
    return { success: false, error: message };
  }

  try {
    const senderAddress = transporter.options.auth?.user || fromEmail;

    const info = await transporter.sendMail({
      from: `"${fromName}" <${senderAddress}>`,
      to,
      subject,
      text,
      html,
      attachments: attachments || [],
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`Failed to send to ${to}:`, error);
    return { success: false, error: error.message };
  }
};
