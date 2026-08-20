const nodemailer = require("nodemailer");
const { htmlToText } = require("html-to-text");
const { sanitizeEmailSubject, sanitizePlainText, stripHeaderControlChars } = require("../utils/sanitizers");

let transporter = null;
let runtimeSmtpUser = null;
let runtimeSmtpPass = null;
const isProduction = process.env.NODE_ENV === "production";

const createTransporter = (user, pass) => {
  const activeUser = user ?? runtimeSmtpUser ?? process.env.SMTP_USER;
  const activePass = pass ?? runtimeSmtpPass ?? process.env.SMTP_PASS;

  if (user && pass) {
    runtimeSmtpUser = user;
    runtimeSmtpPass = pass;
  }

  if (activeUser && activePass) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: activeUser, pass: activePass },
      connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 15000),
      greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
      socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 30000),
    });
    return true;
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 15000),
      greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
      socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 30000),
    });
    return true;
  }
  return false;
};

createTransporter();

exports.configure = (user, pass) => {
  if (!user || !pass) {
    return false;
  }

  runtimeSmtpUser = user;
  runtimeSmtpPass = pass;
  return createTransporter(user, pass);
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
    if (!isProduction) {
      console.error(message);
    }
    return { success: false, error: message };
  }

  try {
    const senderAddress = transporter.options.auth?.user || fromEmail;

    const info = await transporter.sendMail({
      from: `"${sanitizePlainText(fromName || "Sender", 100)}" <${stripHeaderControlChars(senderAddress)}>`,
      to: stripHeaderControlChars(to),
      subject: sanitizeEmailSubject(subject),
      text,
      html,
      attachments: attachments || [],
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    if (!isProduction) {
      console.error(`Failed to send to ${to}:`, error);
    }
    return { success: false, error: "Email delivery failed" };
  }
};
