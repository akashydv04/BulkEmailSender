const emailService = require("../services/emailService");
const queueService = require("../services/queueService");
const helper = require("../utils/helper");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const { GoogleGenAI } = require("@google/genai");
const campaignStore = require("../db/campaignStore");

const campaigns = new Map();
<<<<<<< HEAD
const MAX_RECIPIENTS = Number(process.env.MAX_CAMPAIGN_RECIPIENTS || 1000);
const isProduction = process.env.NODE_ENV === "production";

const logError = (message, error) => {
  if (!isProduction) {
    console.error(message, error);
  }
};

const persistCampaign = (campaign) => {
  campaignStore.save(campaign).catch((error) => {
    logError("Campaign persistence error:", error);
  });
};

const parseJsonField = (value, fallback) => {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    const err = new Error("Invalid request payload.");
    err.status = 400;
    throw err;
  }
};

const extractResumeText = async (file) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (ext === ".pdf") {
    const dataBuffer = await fsPromises.readFile(file.path);
    const data = await pdfParse(dataBuffer);
    return data.text;
  }
  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ path: file.path });
    return result.value;
  }
  const err = new Error(
    "DOC resume parsing is not supported. Please upload PDF or DOCX.",
  );
  err.status = 400;
  throw err;
};
=======
>>>>>>> parent of ec068ec (production level update)

exports.configureSmtp = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and Password are required" });
    }

    const configured = emailService.configure(email, password);
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
<<<<<<< HEAD
    if (recipients.length > MAX_RECIPIENTS) {
      return res
        .status(400)
        .json({
          error: `Campaigns are limited to ${MAX_RECIPIENTS} recipients.`,
        });
    }
=======
>>>>>>> parent of ec068ec (production level update)
    if (!subject || !body) {
      return res.status(400).json({ error: "Subject and Body are required" });
    }

<<<<<<< HEAD
    const cleanRecipients = recipients.map(sanitizeRecipient).filter(Boolean);
    if (cleanRecipients.length === 0) {
      return res
        .status(400)
        .json({ error: "No valid recipient emails found." });
    }

    const cleanSubject = sanitizeEmailSubject(subject);
    const cleanBody = sanitizeEmailHtml(body);
    const cleanSenderDetails = {
      name: sanitizePlainText(senderDetails.name || "", 100),
      company: sanitizePlainText(senderDetails.company || "", 100),
      designation: sanitizePlainText(senderDetails.designation || "", 100),
      contact: sanitizePlainText(senderDetails.contact || "", 200),
      email: stripHeaderControlChars(senderDetails.email || ""),
    };
    const cleanFooter = sanitizeFooter(footer);

=======
>>>>>>> parent of ec068ec (production level update)
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
    persistCampaign(campaignData);

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
          persistCampaign(campaign);
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
  try {
    const { id } = req.params;
    if (!/^[0-9a-f-]{36}$/i.test(id || "")) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const campaign = campaigns.get(id) || (await campaignStore.get(id));
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    campaigns.set(id, campaign);
    return res.status(200).json(campaign);
  } catch (error) {
    logError("Campaign status error:", error);
    return res.status(404).json({ error: "Campaign not found" });
  }
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

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const resultText = response.text;
    const result = JSON.parse(resultText);

    res.json(result);
  } catch (error) {
<<<<<<< HEAD
    logError("Error generating email:", error);
    res.status(error.status || 500).json({
      error:
        error.status === 400
          ? error.message
          : "Failed to generate email. Please try again later.",
    });
  } finally {
    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
    }
=======
    console.error("Error generating email:", error);
    res
      .status(500)
      .json({ error: "Failed to generate email: " + error.message });
>>>>>>> parent of ec068ec (production level update)
  }
};
