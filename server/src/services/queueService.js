const emailService = require('./emailService');
const sanitizeHtml = require('sanitize-html');

const MAX_RETRIES = 3;
const RATE_LIMIT_DELAY = 2000;

exports.addCampaignToQueue = async (campaignId, recipients, subject, bodyTemplate, senderDetails, footer, attachments, statusCallback) => {
    processCampaign(recipients, subject, bodyTemplate, senderDetails, footer, attachments, statusCallback);
};


// --- Footer Generation Logic ---
function generateFooterHtml(footer) {
    // Strict Sanitization to match Frontend Preview
    const sanitize = (val) => val && val.trim().length > 0 ? val.trim() : null;

    const name = sanitize(footer.name);
    // Collect optional lines
    const lines = [
        name ? `<strong>${name}</strong>` : null,
        sanitize(footer.designation),
        sanitize(footer.company),
        sanitize(footer.contact)
    ].filter(Boolean); // Discard empty/null

    // If entire footer is empty and no disclaimer, return empty string
    if (lines.length === 0 && !footer.disclaimer) {
        return '';
    }

    // Join lines with simple breaks
    const signatureBlock = lines.length > 0
        ? `<div style="margin-bottom: 12px;">
         <p style="margin: 0 0 4px 0;">Best regards,</p>
         ${lines.map(line => `<div style="margin: 0;">${line}</div>`).join('')}
       </div>`
        : '';

    const disclaimerBlock = footer.disclaimer
        ? `<p style="font-style: italic; font-size: 11px; color: #999; margin-top: 12px; line-height: 1.4;">
         This email is confidential and intended solely for the recipient.
       </p>`
        : '';

    return `
    <footer style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 13px; color: #555; font-family: Arial, sans-serif;">
      ${signatureBlock}
      ${disclaimerBlock}
    </footer>
  `;
}

async function processCampaign(recipients, subject, bodyTemplate, senderDetails, footer, attachments, statusCallback) {
    // Pre-generate sanitized body (once per campaign usually, but if personalized vars added later, move inside loop)
    // Sanitize to prevent malicious script injection if users paste weird stuff
    const cleanBody = sanitizeHtml(bodyTemplate, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'span']),
        allowedAttributes: {
            '*': ['style', 'class'],
            'a': ['href', 'target'],
            'img': ['src']
        }
    });

    const footerHtml = generateFooterHtml(footer);

    for (const recipient of recipients) {
        const greeting = recipient.name
            ? `Dear ${recipient.name},`
            : 'Hello,';

        // Composition
        const fullHtml = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
        <div style="max-width: 600px; margin: 0 auto;">
          <p style="margin-bottom: 20px;">${greeting}</p>
          
          <div style="margin-bottom: 20px;">
            ${cleanBody}
          </div>

          ${footerHtml}
        </div>
      </body>
      </html>
    `;

        let attempts = 0;
        let sent = false;

        while (attempts < MAX_RETRIES && !sent) {
            const result = await emailService.sendEmail({
                to: recipient.email,
                subject: subject,
                html: fullHtml,
                fromName: footer.name || senderDetails.name,
                fromEmail: senderDetails.email, // Backend auth email
                attachments: attachments
            });

            if (result.success) {
                sent = true;
                statusCallback({ type: 'sent', email: recipient.email });
            } else {
                attempts++;
                if (attempts >= MAX_RETRIES) {
                    statusCallback({ type: 'failed', email: recipient.email });
                } else {
                    await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
                }
            }
        }

        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
    }

    statusCallback({ type: 'completed' });
}
