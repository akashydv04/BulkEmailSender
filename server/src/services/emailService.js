const nodemailer = require("nodemailer");
const { htmlToText } = require("html-to-text");

let transporter = null;
let runtimeSmtpUser = null;
let runtimeSmtpPass = null;

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
    console.log(`Configuring SMTP with user: ${activeUser}`);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: activeUser, pass: activePass },
      tls: { rejectUnauthorized: false },
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

  runtimeSmtpUser = user;
  runtimeSmtpPass = pass;
  process.env.SMTP_USER = user;
  process.env.SMTP_PASS = pass;
  if (!createTransporter(user, pass)) {
    return false;
  }

  try {
    await transporter.verify();
    return true;
  } catch (error) {
    transporter = null;
    console.error("SMTP verification failed:", error.message);
    throw new Error(
      "SMTP authentication failed. Use a valid Gmail App Password.",
    );
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
