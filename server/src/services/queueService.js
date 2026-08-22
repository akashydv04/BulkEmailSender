const emailService = require("./emailService");
const nodemailer = require("nodemailer");
const sanitizeHtml = require("sanitize-html");

const MAX_RETRIES = 3;
const RATE_LIMIT_DELAY = 2000;
const SMTP_TIMEOUT_MS = 15000;

exports.addCampaignToQueue = async (
  campaignId,
  recipients,
  subject,
  bodyTemplate,
  senderDetails,
  footer,
  attachments,
  smtpConfig,
  statusCallback,
) => {
  processCampaign(
    recipients,
    subject,
    bodyTemplate,
    senderDetails,
    footer,
    attachments,
    smtpConfig,
    statusCallback,
  );
};

async function sendWithTimeout(transporter, mailOptions) {
  return Promise.race([
    transporter.sendMail(mailOptions),
    new Promise((_, reject) => {
      setTimeout(
        () =>
          reject(new Error(`SMTP send timed out after ${SMTP_TIMEOUT_MS}ms`)),
        SMTP_TIMEOUT_MS,
      );
    }),
  ]);
}

// --- Footer Generation Logic ---
function generateFooterHtml(footer) {
  // Strict Sanitization to match Frontend Preview
  const sanitize = (val) => (val && val.trim().length > 0 ? val.trim() : null);

  const name = sanitize(footer.name);
  // Collect optional lines
  const lines = [
    name ? `<strong>${name}</strong>` : null,
    sanitize(footer.designation),
    sanitize(footer.company),
    sanitize(footer.contact),
  ].filter(Boolean); // Discard empty/null

  // If entire footer is empty and no disclaimer, return empty string
  if (lines.length === 0 && !footer.disclaimer) {
    return "";
  }

  // Join lines with simple breaks
  const signatureBlock =
    lines.length > 0
      ? `<div style="margin-bottom: 12px;">
         <p style="margin: 0 0 4px 0;">Best regards,</p>
         ${lines.map((line) => `<div style="margin: 0;">${line}</div>`).join("")}
       </div>`
      : "";

  const disclaimerBlock = footer.disclaimer
    ? `<p style="font-style: italic; font-size: 11px; color: #999; margin-top: 12px; line-height: 1.4;">
         This email is confidential and intended solely for the recipient.
       </p>`
    : "";

  return `
    <footer style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 13px; color: #555; font-family: Arial, sans-serif;">
      ${signatureBlock}
      ${disclaimerBlock}
    </footer>
  `;
}

function replacePlaceholders(text, rowData) {
  if (!text) return text;
  return text.replace(/\{([^}]+)\}/g, (match, key) => {
    const lowerKey = key.trim().toLowerCase();

    // Find matching key in rowData ignoring case
    const actualKey = Object.keys(rowData).find(
      (k) => k.toLowerCase() === lowerKey,
    );
    if (actualKey && rowData[actualKey]) {
      return rowData[actualKey];
    }

    // Fallbacks
    if (lowerKey === "name") return "Hiring Team";
    if (lowerKey === "company") return "your company";
    if (lowerKey === "role") return "the open role";

    return ""; // Or return empty string for other custom fields
  });
}

function formatBody(rawBody) {
  if (!rawBody) return { cleanText: "", hasSignature: false };
  let clean = rawBody.trim();
  // Reduce multiple blank lines
  clean = clean.replace(/\n\s*\n\s*\n/g, "\n\n");
  const hasGreeting = /^(dear|hi|hello)\s/i.test(clean);

  let finalBody = clean;
  if (!hasGreeting) {
    finalBody = `Dear Hiring Team,\n\n${clean}`;
  }

  // Check if body has signature
  const hasSignature =
    /(best regards|sincerely|thanks|cheers)[,\s]*\n/i.test(clean) ||
    /akash yadav/i.test(clean);

  // Convert newlines to breaks
  return { cleanText: finalBody.replace(/\n/g, "<br/>"), hasSignature };
}

async function processCampaign(
  recipients,
  subject,
  bodyTemplate,
  senderDetails,
  footer,
  attachments,
  smtpConfig,
  statusCallback,
) {
  const footerHtml = generateFooterHtml(footer);
  const batchSize = 5;

  // Validate SMTP config
  if (!smtpConfig.user || !smtpConfig.pass) {
    console.error("SMTP config missing in campaign worker. Cannot proceed.");
    statusCallback({ type: "completed" });
    return;
  }

  // Create dynamic transporter for this campaign
  const transporter = nodemailer.createTransport({
    host: smtpConfig.host || "smtp.gmail.com",
    port: 465,
    secure: true,
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    auth: {
      user: smtpConfig.user.trim(),
      pass: smtpConfig.pass,
    },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });

  const authUser = smtpConfig.user.trim();

  const processRecipient = async (recipient) => {
    const isExcel = !!recipient.subject && !!recipient.body;
    const baseSubject = isExcel ? recipient.subject : subject;
    const baseBody = isExcel ? recipient.body : bodyTemplate;

    const personalizedSubjectRaw = replacePlaceholders(baseSubject, recipient);
    const personalizedSubject =
      personalizedSubjectRaw.length > 200
        ? personalizedSubjectRaw.substring(0, 197) + "..."
        : personalizedSubjectRaw;

    let personalizedBodyRaw = replacePlaceholders(baseBody, recipient);

    let finalBodyText, footerIncluded;
    if (isExcel) {
      const { cleanText, hasSignature } = formatBody(personalizedBodyRaw);
      finalBodyText = sanitizeHtml(cleanText, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat([
          "img",
          "h1",
          "h2",
          "span",
          "strong",
          "em",
          "p",
          "br",
          "div",
          "ul",
          "li",
          "ol",
        ]),
        allowedAttributes: {
          "*": ["style", "class"],
          a: ["href", "target"],
          img: ["src"],
        },
      });
      footerIncluded = !hasSignature;
    } else {
      finalBodyText = sanitizeHtml(personalizedBodyRaw, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat([
          "img",
          "h1",
          "h2",
          "span",
          "strong",
          "em",
          "p",
          "br",
          "div",
          "ul",
          "li",
          "ol",
        ]),
        allowedAttributes: {
          "*": ["style", "class"],
          a: ["href", "target"],
          img: ["src"],
        },
      });
      footerIncluded = true;
    }

    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
        <div style="max-width: 600px; margin: 0 auto;">
          <div style="margin-bottom: 20px;">
            ${finalBodyText}
          </div>

          ${footerIncluded ? footerHtml : ""}
        </div>
      </body>
      </html>
    `;

    let attempts = 0;
    while (attempts < MAX_RETRIES) {
      try {
        const result = await sendWithTimeout({
          to: recipient.email,
          subject: personalizedSubject,
          html: fullHtml,
          fromName: footer.name || senderDetails.name || "SenderPortal",
          fromEmail: authUser || senderDetails.email,
          attachments: attachments,
        });

        if (result.success) {
          statusCallback({ type: "sent", email: recipient.email });
          return;
        }

        attempts++;
        if (attempts >= MAX_RETRIES) {
          const failureDetail = `${result.error || "unknown error"}${result.code ? ` [${result.code}]` : ""}`;
          console.error(
            `SMTP failure for ${recipient.email}: ${failureDetail}`,
          );
          statusCallback({
            type: "failed",
            email: recipient.email,
            error: failureDetail,
          });
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 2000 * attempts));
      } catch (error) {
        attempts++;
        const errorCode = error?.code || "SMTP_TIMEOUT";
        const detail = error?.message || String(error);
        console.error(
          `SMTP timeout or error for ${recipient.email}: [${errorCode}] ${detail}`,
        );
        if (attempts >= MAX_RETRIES) {
          statusCallback({
            type: "failed",
            email: recipient.email,
            error: `${detail} [${errorCode}]`,
          });
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 2000 * attempts));
      }
    }
  };

  for (let index = 0; index < recipients.length; index += batchSize) {
    const batch = recipients.slice(index, index + batchSize);
    await Promise.allSettled(batch.map(processRecipient));
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY));
  }

  statusCallback({ type: "completed" });
}
