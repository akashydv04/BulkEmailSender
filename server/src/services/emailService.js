const nodemailer = require('nodemailer');
const { htmlToText } = require('html-to-text');

let transporter = null;

const createTransporter = (user, pass) => {
    if (user && pass) {
        console.log(`Configuring SMTP with user: ${user}`);
        transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: { user, pass },
            tls: { rejectUnauthorized: false }
        });
        return true;
    } else if (process.env.SMTP_HOST && process.env.SMTP_USER) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT || 587,
            secure: process.env.SMTP_SECURE === 'true',
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

exports.configure = (user, pass) => {
    return createTransporter(user, pass);
};

exports.sendEmail = async ({ to, subject, html, fromName, fromEmail, attachments }) => {
    const text = htmlToText(html);

    if (transporter) {
        try {
            const senderAddress = transporter.transporter.auth.user || fromEmail;

            const info = await transporter.sendMail({
                from: `"${fromName}" <${senderAddress}>`,
                to,
                subject,
                text,
                html,
                attachments: attachments || []
            });
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error(`Failed to send to ${to}:`, error);
            return { success: false, error: error.message };
        }
    } else {
        // Mock Send
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log(`[MOCK EMAIL] To: ${to} | Subject: ${subject}`);
        if (attachments && attachments.length > 0) {
            console.log(`[MOCK FILES]: ${attachments.map(a => a.filename).join(', ')}`);
        }
        return { success: true, messageId: `mock-${Date.now()}` };
    }
};
