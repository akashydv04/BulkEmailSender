const nodemailer = require("nodemailer");
const { htmlToText } = require("html-to-text");

let transporter = null;
let runtimeSmtpUser = null;
let runtimeSmtpPass = null;

const smtpOptions = {
  connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT || 10000),
  greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT || 10000),
  socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT || 15000),
};

const isPlaceholder = (value = "") =>
  /^(your_|your-|example|test@|password|change-me)/i.test(String(value).trim());

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
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: activeUser, pass: activePass },
      tls: { rejectUnauthorized: false },
      ...smtpOptions,
    });
    return true;
  }

  if (
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    !isPlaceholder(process.env.SMTP_USER) &&
    !isPlaceholder(process.env.SMTP_PASS)
  ) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      ...smtpOptions,
    });
    return true;
  }
  return false;
};

createTransporter();

exports.configure = async (user, pass) => {
  if (!user || !pass) {
    return false;
  }

  const previousTransporter = transporter;
  const previousUser = runtimeSmtpUser;
  const previousPass = runtimeSmtpPass;
  const candidate = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    ...smtpOptions,
  });

  try {
    await candidate.verify();
    transporter = candidate;
    runtimeSmtpUser = user;
    runtimeSmtpPass = pass;
    console.log(`SMTP verified for user: ${user}`);
    return true;
  } catch (error) {
    transporter = previousTransporter;
    runtimeSmtpUser = previousUser;
    runtimeSmtpPass = previousPass;
    console.error("SMTP verification failed:", error.message);
    throw new Error(`SMTP verification failed: ${error.message}`);
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
