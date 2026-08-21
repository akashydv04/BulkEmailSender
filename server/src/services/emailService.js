const nodemailer = require("nodemailer");
const { htmlToText } = require("html-to-text");

let transporter = null;
let runtimeSmtpUser = null;
let runtimeSmtpPass = null;

const smtpOptions = {
  connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT || 10000),
  greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT || 5000),
  socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT || 10000),
};

const isPlaceholder = (value = "") =>
  /^(your_|your-|example|test@|password|change-me)/i.test(String(value).trim());

const getSmtpOptions = (user, pass, host = process.env.SMTP_HOST) => {
  const resolvedHost = host || "smtp.gmail.com";
  const configuredPort = Number(process.env.SMTP_PORT);
  const isValidPort =
    Number.isInteger(configuredPort) &&
    configuredPort >= 1 &&
    configuredPort <= 65535;
  const isGmail = resolvedHost.toLowerCase() === "smtp.gmail.com";
  const port = isGmail ? 465 : isValidPort ? configuredPort : 465;
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

createTransporter();

exports.configure = async (user, pass) => {
  const normalizedUser = String(user || "").trim();
  const normalizedPass = String(pass || "").replace(/\s+/g, "");

  if (!normalizedUser || !normalizedPass) {
    return false;
  }

  const previousTransporter = transporter;
  const previousUser = runtimeSmtpUser;
  const previousPass = runtimeSmtpPass;
  const candidate = nodemailer.createTransport(
    getSmtpOptions(normalizedUser, normalizedPass),
  );

  try {
    await candidate.verify();
    transporter = candidate;
    runtimeSmtpUser = normalizedUser;
    runtimeSmtpPass = normalizedPass;
    console.log(`SMTP verified for user: ${normalizedUser}`);
    return true;
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
