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

const getDefaultProvider = (config = {}) => {
  const explicitProvider = String(
    config.provider || process.env.EMAIL_PROVIDER || "",
  )
    .trim()
    .toLowerCase();

  if (explicitProvider) {
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

exports.configure = (config = {}, legacyPass) => {
  const options =
    typeof config === "string"
      ? { email: config, password: legacyPass }
      : config || {};

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

exports.sendEmail = async ({
  to,
  subject,
  html,
  fromName,
  fromEmail,
  attachments,
}) => {
  const text = htmlToText(html);

  // Explicit fallback to process.env for production worker
  const smtpUser = process.env.SMTP_USER || runtimeSmtpUser;
  const smtpPass = process.env.SMTP_PASS || runtimeSmtpPass;
  const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
  const smtpPort = Number(process.env.SMTP_PORT || 465);

  if (!smtpUser || !smtpPass) {
    const message = `SMTP credentials missing in worker. User: ${Boolean(smtpUser)}, Pass: ${Boolean(smtpPass)}. Set SMTP_USER and SMTP_PASS in environment.`;
    console.error(message);
    return {
      success: false,
      error: message,
      code: "SMTP_CONFIG_MISSING",
    };
  }

  // Ensure transporter exists or create one if not
  if (!transporter) {
    console.log(
      `Transporter not initialized. Creating one with env credentials.`,
    );
    const appPassword = String(smtpPass).replace(/\s+/g, "");
    transporter = require("nodemailer").createTransport({
      host: smtpHost,
      port: 465,
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
  }

  try {
    const senderAddress = smtpUser.trim();
    const from = `"${fromName || "SenderPortal"}" <${senderAddress}>`;

    console.log(`Sending email to ${to} from ${from}`);
    const info = await transporter.sendMail({
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
    console.error(
      `Failed to send to ${to}: [${errorCode}] ${errorMessage}`,
    );
    return {
      success: false,
      error: errorMessage,
      code: errorCode,
    };
  }
};
