const fs = require("fs");
const axios = require("axios");
const nodemailer = require("nodemailer");
const { htmlToText } = require("html-to-text");

let transporter = null;
let runtimeSmtpUser = null;
let runtimeSmtpPass = null;

const isRenderEnvironment = () =>
  Boolean(process.env.RENDER) || process.env.NODE_ENV === "production";

const isPlaceholder = (value = "") =>
  /^(your_|your-|example|test@|password|change-me)/i.test(String(value).trim());

const resolveSmtpConfig = (config = {}, env = process.env) => {
  const host =
    config.host || config.SMTP_HOST || env.SMTP_HOST || "smtp.gmail.com";
  const user =
    config.user || config.email || config.SMTP_USER || env.SMTP_USER || "";
  const pass =
    config.pass || config.password || config.SMTP_PASS || env.SMTP_PASS || "";

  return {
    host: String(host || "smtp.gmail.com").trim() || "smtp.gmail.com",
    user: String(user || "").trim(),
    pass: String(pass || "").replace(/\s+/g, ""),
    port: config.port ?? config.SMTP_PORT ?? env.SMTP_PORT ?? 465,
  };
};

const buildSmtpTransportOptions = (config = {}, env = process.env) => {
  const smtpConfig = resolveSmtpConfig(config, env);
  const isProductionLike = Boolean(env.RENDER || env.NODE_ENV === "production");
  const port = isProductionLike
    ? 465
    : Number(smtpConfig.port) > 0 && Number.isFinite(Number(smtpConfig.port))
      ? Number(smtpConfig.port)
      : 465;
  const secure = port === 465;

  return {
    host: smtpConfig.host,
    port,
    secure,
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    auth: {
      user: smtpConfig.user.trim(),
      pass: smtpConfig.pass.replace(/\s+/g, ""),
    },
    tls: { rejectUnauthorized: false },
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT || 10000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT || 5000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT || 10000),
  };
};

// ---------------------------------------------------------------------------
// Provider selection
//
// Render (and most PaaS free/starter tiers) block outbound SMTP sockets
// (ports 25/465/587) at the network layer. No amount of SMTP config-tuning
// fixes this — the fix is to send mail over plain HTTPS instead, via a
// transactional email API. EMAIL_PROVIDER controls which path is used:
//   "resend"   -> HTTPS API call to Resend (recommended on Render)
//   "sendgrid" -> HTTPS API call to SendGrid
//   "smtp"     -> raw SMTP via nodemailer (fine on VPS/local, blocked on Render)
// ---------------------------------------------------------------------------
const getDefaultProvider = (config = {}) => {
  const explicitProvider = String(
    config.provider || process.env.EMAIL_PROVIDER || "",
  )
    .trim()
    .toLowerCase();

  if (
    explicitProvider === "resend" ||
    explicitProvider === "sendgrid" ||
    explicitProvider === "smtp"
  ) {
    return explicitProvider;
  }

  const hasSmtpCredentials = Boolean(
    config.user ||
    config.email ||
    config.password ||
    config.pass ||
    config.SMTP_USER ||
    config.SMTP_PASS ||
    process.env.SMTP_USER ||
    process.env.SMTP_PASS,
  );

  if (hasSmtpCredentials) {
    return "smtp";
  }

  return "smtp";
};

module.exports.resolveSmtpConfig = resolveSmtpConfig;
module.exports.buildSmtpTransportOptions = buildSmtpTransportOptions;
module.exports.getDefaultProvider = getDefaultProvider;

// ---------------------------------------------------------------------------
// Resend (HTTPS API) — works on Render because it's a normal HTTPS POST,
// not a raw SMTP socket.
// ---------------------------------------------------------------------------
const buildResendAttachments = (attachments = []) =>
  attachments
    .filter(Boolean)
    .map((a) => {
      try {
        const content = a.path
          ? fs.readFileSync(a.path).toString("base64")
          : a.content;
        return { filename: a.filename, content };
      } catch (err) {
        console.error(`Failed to read attachment ${a.filename}:`, err.message);
        return null;
      }
    })
    .filter(Boolean);

async function sendViaResend({
  to,
  subject,
  html,
  text,
  fromName,
  fromEmail,
  attachments,
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || isPlaceholder(apiKey)) {
    const message =
      "RESEND_API_KEY is not configured on the server. Set it in Render's Environment settings.";
    console.error(message);
    return { success: false, error: message, code: "RESEND_CONFIG_MISSING" };
  }

  // Resend requires the "from" address to be on a domain you've verified
  // with Resend. It will NOT let you send from an arbitrary Gmail address.
  const verifiedFrom = process.env.RESEND_FROM_EMAIL || fromEmail;
  if (!verifiedFrom || isPlaceholder(verifiedFrom)) {
    const message =
      "No verified sender configured. Set RESEND_FROM_EMAIL to an email on a domain verified in your Resend account.";
    console.error(message);
    return { success: false, error: message, code: "RESEND_FROM_MISSING" };
  }

  const payload = {
    from: `${fromName || "SenderPortal"} <${verifiedFrom}>`,
    to: [to],
    subject,
    html,
    text,
  };

  const preparedAttachments = buildResendAttachments(attachments);
  if (preparedAttachments.length > 0) {
    payload.attachments = preparedAttachments;
  }

  try {
    const response = await axios.post(
      "https://api.resend.com/emails",
      payload,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      },
    );
    return { success: true, messageId: response.data?.id };
  } catch (error) {
    const errorMessage =
      error?.response?.data?.message || error.message || String(error);
    const errorCode = error?.response?.status || "RESEND_SEND_ERROR";
    console.error(
      `Resend send failed for ${to}: [${errorCode}] ${errorMessage}`,
    );
    return { success: false, error: errorMessage, code: String(errorCode) };
  }
}

// ---------------------------------------------------------------------------
// SendGrid (HTTPS API) — optional alternate provider, same rationale as Resend.
// ---------------------------------------------------------------------------
async function sendViaSendgrid({
  to,
  subject,
  html,
  text,
  fromName,
  fromEmail,
  attachments,
}) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey || isPlaceholder(apiKey)) {
    const message =
      "SENDGRID_API_KEY is not configured on the server. Set it in Render's Environment settings.";
    console.error(message);
    return { success: false, error: message, code: "SENDGRID_CONFIG_MISSING" };
  }

  const verifiedFrom = process.env.SENDGRID_FROM_EMAIL || fromEmail;
  if (!verifiedFrom || isPlaceholder(verifiedFrom)) {
    const message =
      "No verified sender configured. Set SENDGRID_FROM_EMAIL to a sender verified in your SendGrid account.";
    console.error(message);
    return { success: false, error: message, code: "SENDGRID_FROM_MISSING" };
  }

  const payload = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: verifiedFrom, name: fromName || "SenderPortal" },
    subject,
    content: [
      { type: "text/plain", value: text || "" },
      { type: "text/html", value: html || "" },
    ],
  };

  const preparedAttachments = buildResendAttachments(attachments); // same shape works: filename + base64 content
  if (preparedAttachments.length > 0) {
    payload.attachments = preparedAttachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      type: "application/octet-stream",
      disposition: "attachment",
    }));
  }

  try {
    const response = await axios.post(
      "https://api.sendgrid.com/v3/mail/send",
      payload,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      },
    );
    return {
      success: true,
      messageId: response.headers?.["x-message-id"] || "sent",
    };
  } catch (error) {
    const errorMessage =
      error?.response?.data?.errors?.[0]?.message ||
      error.message ||
      String(error);
    const errorCode = error?.response?.status || "SENDGRID_SEND_ERROR";
    console.error(
      `SendGrid send failed for ${to}: [${errorCode}] ${errorMessage}`,
    );
    return { success: false, error: errorMessage, code: String(errorCode) };
  }
}

// ---------------------------------------------------------------------------
// SMTP (nodemailer) — unchanged transport-building logic, kept for local/VPS
// deployments where outbound SMTP ports aren't blocked.
// ---------------------------------------------------------------------------
const createTransporter = (user, pass) => {
  const activeUser = user ?? runtimeSmtpUser ?? process.env.SMTP_USER;
  const activePass = pass ?? runtimeSmtpPass ?? process.env.SMTP_PASS;

  if (user && pass) {
    runtimeSmtpUser = user;
    runtimeSmtpPass = pass;
    process.env.SMTP_USER = user;
    process.env.SMTP_PASS = pass;
  }

  if (activeUser && activePass) {
    const appPassword = String(activePass).replace(/\s+/g, "");
    const isProduction = isRenderEnvironment();
    const host = process.env.SMTP_HOST || "smtp.gmail.com";
    const port = isProduction ? 465 : Number(process.env.SMTP_PORT || 465);
    const secure = true;
    const authUser = String(activeUser).trim();

    console.log(`Configuring SMTP with user: ${authUser}`);
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      auth: { user: authUser, pass: appPassword },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    });
    return true;
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const appPassword = String(process.env.SMTP_PASS).replace(/\s+/g, "");
    const isProduction = isRenderEnvironment();
    const host = process.env.SMTP_HOST;
    const port = isProduction ? 465 : Number(process.env.SMTP_PORT || 465);
    const secure = true;

    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      auth: {
        user: process.env.SMTP_USER,
        pass: appPassword,
      },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    });
    return true;
  }
  return false;
};

createTransporter();

// ---------------------------------------------------------------------------
// Public: configure()
// Called by /api/config. For HTTP providers there's no socket to verify, so
// this returns immediately once the relevant API key is confirmed present.
// ---------------------------------------------------------------------------
exports.configure = (config = {}, legacyPass) => {
  const options =
    typeof config === "string"
      ? { email: config, password: legacyPass }
      : config || {};

  const provider = getDefaultProvider(options);

  if (provider === "resend" || provider === "sendgrid") {
    const apiKey =
      provider === "resend"
        ? process.env.RESEND_API_KEY
        : process.env.SENDGRID_API_KEY;

    if (!apiKey || isPlaceholder(apiKey)) {
      throw new Error(
        `${provider === "resend" ? "RESEND_API_KEY" : "SENDGRID_API_KEY"} is not set in the environment. Add it in Render's Environment settings.`,
      );
    }

    // Remember a display sender if the user supplied one via the form; not
    // required (RESEND_FROM_EMAIL / SENDGRID_FROM_EMAIL take precedence and
    // must be on a verified domain).
    const user = options.user || options.email || options.SMTP_USER || "";
    if (user) {
      runtimeSmtpUser = String(user).trim();
    }
    return true;
  }

  // ---- SMTP path (unchanged) ----
  const user =
    options.user ||
    options.email ||
    options.SMTP_USER ||
    process.env.SMTP_USER ||
    "";
  const rawPass =
    options.pass ||
    options.password ||
    options.SMTP_PASS ||
    process.env.SMTP_PASS ||
    "";

  if (!user || !rawPass) {
    return false;
  }

  const normalizedUser = String(user).trim();
  const normalizedPass = String(rawPass).replace(/\s+/g, "");

  if (
    normalizedUser.toLowerCase().endsWith("@gmail.com") &&
    normalizedPass.length !== 16
  ) {
    throw new Error(
      "Gmail requires a 16-character App Password without spaces.",
    );
  }

  runtimeSmtpUser = normalizedUser;
  runtimeSmtpPass = normalizedPass;
  process.env.SMTP_USER = normalizedUser;
  process.env.SMTP_PASS = normalizedPass;

  if (options.host || options.SMTP_HOST) {
    process.env.SMTP_HOST = options.host || options.SMTP_HOST;
  }

  return createTransporter(normalizedUser, normalizedPass);
};

// ---------------------------------------------------------------------------
// Public: sendEmail()
// Branches on EMAIL_PROVIDER. smtpConfig (optional) lets callers (e.g. the
// campaign queue) pass per-request SMTP credentials when provider === "smtp".
// ---------------------------------------------------------------------------
exports.sendEmail = async ({
  to,
  subject,
  html,
  fromName,
  fromEmail,
  attachments,
  smtpConfig,
}) => {
  const text = htmlToText(html);
  const provider = getDefaultProvider(smtpConfig || {});

  if (provider === "resend") {
    return sendViaResend({
      to,
      subject,
      html,
      text,
      fromName,
      fromEmail: fromEmail || smtpConfig?.user,
      attachments,
    });
  }

  if (provider === "sendgrid") {
    return sendViaSendgrid({
      to,
      subject,
      html,
      text,
      fromName,
      fromEmail: fromEmail || smtpConfig?.user,
      attachments,
    });
  }

  // ---- SMTP path ----
  const smtpUser = smtpConfig?.user || process.env.SMTP_USER || runtimeSmtpUser;
  const smtpPass = smtpConfig?.pass || process.env.SMTP_PASS || runtimeSmtpPass;
  const smtpHost =
    smtpConfig?.host || process.env.SMTP_HOST || "smtp.gmail.com";

  if (!smtpUser || !smtpPass) {
    const message = `SMTP credentials missing in worker. User: ${Boolean(smtpUser)}, Pass: ${Boolean(smtpPass)}. Set SMTP_USER and SMTP_PASS in environment, or switch EMAIL_PROVIDER to "resend".`;
    console.error(message);
    return {
      success: false,
      error: message,
      code: "SMTP_CONFIG_MISSING",
    };
  }

  const isProduction = isRenderEnvironment();
  const port = isProduction ? 465 : Number(process.env.SMTP_PORT || 465);
  const appPassword = String(smtpPass).replace(/\s+/g, "");

  // Build a transporter for this send. When explicit per-call credentials are
  // supplied (campaign sending), use a fresh transporter with those; otherwise
  // reuse/create the shared one built from global/env credentials.
  let activeTransporter = transporter;
  if (smtpConfig?.user && smtpConfig?.pass) {
    activeTransporter = nodemailer.createTransport({
      host: smtpHost,
      port,
      secure: true,
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      auth: { user: smtpUser.trim(), pass: appPassword },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    });
  } else if (!activeTransporter) {
    console.log(
      `Transporter not initialized. Creating one with env credentials.`,
    );
    activeTransporter = nodemailer.createTransport({
      host: smtpHost,
      port,
      secure: true,
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      auth: { user: smtpUser.trim(), pass: appPassword },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    });
    transporter = activeTransporter;
  }

  try {
    const senderAddress = smtpUser.trim();
    const from = `"${fromName || "SenderPortal"}" <${senderAddress}>`;

    console.log(`Sending email to ${to} from ${from}`);
    const info = await activeTransporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
      attachments: attachments || [],
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    const errorCode = error?.code || "SMTP_SEND_ERROR";
    const errorMessage = error?.message || String(error);
    console.error(`Failed to send to ${to}: [${errorCode}] ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
      code: errorCode,
    };
  }
};
