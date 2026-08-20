const emailService = require("../services/emailService");
const queueService = require("../services/queueService");
const helper = require("../utils/helper");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const { GoogleGenAI } = require("@google/genai");

const AI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const AI_FALLBACK_MODEL =
  process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash-lite";

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const isTransientAiError = (error) => {
  const status = error?.status || error?.code || error?.error?.code;
  const message = String(error?.message || error || "");
  return (
    [429, 500, 502, 503, 504].includes(Number(status)) ||
    /\b(429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(message)
  );
};

const generateEmailContent = async (ai, prompt) => {
  const models = [...new Set([AI_MODEL, AI_FALLBACK_MODEL])];
  let lastError;

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await ai.models.generateContent({
          model,
          contents: prompt,
          config: { responseMimeType: "application/json" },
        });
      } catch (error) {
        lastError = error;
        if (!isTransientAiError(error) || attempt === 1) break;
        await wait(1000 * (attempt + 1));
      }
    }
  }

  throw lastError;
};

const campaigns = new Map();

exports.configureSmtp = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and Password are required" });
    }

    const configured = await emailService.configure(email, password);
    if (!configured) {
      return res.status(500).json({
        error:
          "SMTP configuration failed. Check the provided email and app password.",
      });
    }

    res.json({ success: true, message: "SMTP Configured successfully" });
  } catch (error) {
    console.error("Config error:", error);
    res.status(500).json({ error: "Failed to configure SMTP" });
  }
};

exports.parseEmails = async (req, res) => {
  try {
    const { rawEmails } = req.body;
    if (!rawEmails) {
      return res.status(400).json({ error: "No emails provided" });
    }

    const { valid, invalid } = await helper.processEmailList(rawEmails);

    // Preview logic updated for Source
    const preview = valid.slice(0, 5).map((r) => ({
      email: r.email,
      name: r.name,
      source: r.source,
      greeting: r.name ? `Dear ${r.name},` : "Hello,",
    }));

    res.json({
      totalParsed: valid.length + invalid.length,
      validCount: valid.length,
      invalidCount: invalid.length,
      validEmails: valid,
      invalidEmails: invalid,
      previewSample: preview,
    });
  } catch (error) {
    console.error("Error parsing emails:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.sendCampaign = async (req, res) => {
  try {
    // Handle Multipart Form Data
    // req.body fields will be JSON strings due to FormData serialization on client if handled manually,
    // or standard fields if handled by Multer.
    // We expect Multer to parse `req.body` and `req.files`.

    let { recipients, subject, body, senderDetails, footer } = req.body;

    // Parse JSON strings if they came from FormData
    if (typeof recipients === "string") recipients = JSON.parse(recipients);
    if (typeof senderDetails === "string")
      senderDetails = JSON.parse(senderDetails);
    if (typeof footer === "string") footer = JSON.parse(footer);

    const files = req.files || [];

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: "Recipients list is empty" });
    }
    if (!subject || !body) {
      return res.status(400).json({ error: "Subject and Body are required" });
    }

    const campaignId = uuidv4();
    const campaignData = {
      id: campaignId,
      status: "processing",
      total: recipients.length,
      sent: 0,
      failed: 0,
      createdAt: new Date(),
      recipients: recipients.map((r) => ({ ...r, status: "pending" })),
    };

    campaigns.set(campaignId, campaignData);

    // Normalize Attachments for Queue
    const attachments = files.map((f) => ({
      filename: f.originalname,
      path: f.path,
      size: f.size,
    }));

    queueService.addCampaignToQueue(
      campaignId,
      recipients,
      subject,
      body,
      senderDetails,
      footer,
      attachments,
      (update) => {
        const campaign = campaigns.get(campaignId);
        if (campaign) {
          if (update.type === "sent") {
            campaign.sent++;
            const rec = campaign.recipients.find(
              (r) => r.email === update.email,
            );
            if (rec) rec.status = "sent";
          } else if (update.type === "failed") {
            campaign.failed++;
            const rec = campaign.recipients.find(
              (r) => r.email === update.email,
            );
            if (rec) rec.status = "failed";
          } else if (update.type === "completed") {
            campaign.status = "completed";
          }
        }
      },
    );

    res.json({
      message: "Campaign started successfully",
      campaignId: campaignId,
      statusEndpoint: `/api/campaign-status/${campaignId}`,
    });
  } catch (error) {
    console.error("Error starting campaign:", error);
    res.status(500).json({ error: "Internal server error: " + error.message });
  }
};

exports.getCampaignStatus = async (req, res) => {
  const { id } = req.params;
  const campaign = campaigns.get(id);
  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }
  res.json(campaign);
};

exports.generateEmail = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No resume file provided" });
    }

    if (
      req.file.mimetype !== "application/pdf" &&
      !req.file.originalname.toLowerCase().endsWith(".pdf")
    ) {
      return res
        .status(400)
        .json({ error: "Only PDF files are supported for resume parsing." });
    }

    const dataBuffer = fs.readFileSync(req.file.path);
    const data = await pdfParse(dataBuffer);
    const text = data.text;

    if (!text || text.trim().length === 0) {
      return res
        .status(400)
        .json({ error: "Could not extract text from the PDF." });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res
        .status(500)
        .json({ error: "GEMINI_API_KEY is not configured on the server." });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const prompt = `
            You are an expert recruiter and copywriter.
            I have extracted the following text from a candidate's resume:
            ---
            ${text.substring(0, 6000)}
            ---
            
            1. Identify the candidate's core Designation (e.g., Senior Android Developer, Full-Stack Engineer).
            2. Identify their key tech stack and years of experience.
            3. Generate a highly attractive, expressive, and professional Email Subject and Email Body (in HTML format) for a job application or cold outreach. 
            4. The email should sound natural, confident, and professional (avoid robotic filler).
            5. IMPORTANT: Use these exact placeholders in the text where appropriate: {Name} (for the recruiter/hiring manager), {Company} (for the target company), {Role} (for the target job role).
            6. Dynamically incorporate the candidate's actual Designation and Key Stack that you extracted into the email body.
            7. Structure the email body using proper HTML tags (<p>, <br>). Ensure there is generous spacing and proper paragraph breaks to make the email highly readable and well-structured.

            
            Return the result ONLY as a valid JSON object with the following structure:
            {
                "designation": "...",
                "subject": "...",
                "body": "<p>Dear {Name},</p>..."
            }
        `;

    const response = await generateEmailContent(ai, prompt);

    const resultText = response.text;
    const result = JSON.parse(resultText);

    res.json(result);
  } catch (error) {
    console.error("Error generating email:", error);
    const status = isTransientAiError(error) ? 503 : 500;
    res.status(status).json({
      error:
        status === 503
          ? "Email generation is temporarily unavailable. Please try again shortly."
          : "Failed to generate email.",
    });
  }
};
