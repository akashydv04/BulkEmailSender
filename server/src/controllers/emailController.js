const emailService = require('../services/emailService');
const queueService = require('../services/queueService');
const helper = require('../utils/helper');
const { v4: uuidv4 } = require('uuid');

const campaigns = new Map();

exports.configureSmtp = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and Password are required' });
        }
        emailService.configure(email, password);
        res.json({ success: true, message: 'SMTP Configured successfully' });
    } catch (error) {
        console.error('Config error:', error);
        res.status(500).json({ error: 'Failed to configure SMTP' });
    }
};

exports.parseEmails = async (req, res) => {
    try {
        const { rawEmails } = req.body;
        if (!rawEmails) {
            return res.status(400).json({ error: 'No emails provided' });
        }

        const { valid, invalid } = await helper.processEmailList(rawEmails);

        // Preview logic updated for Source
        const preview = valid.slice(0, 5).map(r => ({
            email: r.email,
            name: r.name,
            source: r.source,
            greeting: r.name ? `Dear ${r.name},` : 'Hello,'
        }));

        res.json({
            totalParsed: valid.length + invalid.length,
            validCount: valid.length,
            invalidCount: invalid.length,
            validEmails: valid,
            invalidEmails: invalid,
            previewSample: preview
        });
    } catch (error) {
        console.error('Error parsing emails:', error);
        res.status(500).json({ error: 'Internal server error' });
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
        if (typeof recipients === 'string') recipients = JSON.parse(recipients);
        if (typeof senderDetails === 'string') senderDetails = JSON.parse(senderDetails);
        if (typeof footer === 'string') footer = JSON.parse(footer);

        const files = req.files || [];

        if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
            return res.status(400).json({ error: 'Recipients list is empty' });
        }
        if (!subject || !body) {
            return res.status(400).json({ error: 'Subject and Body are required' });
        }

        const campaignId = uuidv4();
        const campaignData = {
            id: campaignId,
            status: 'processing',
            total: recipients.length,
            sent: 0,
            failed: 0,
            createdAt: new Date(),
            recipients: recipients.map(r => ({ ...r, status: 'pending' }))
        };

        campaigns.set(campaignId, campaignData);

        // Normalize Attachments for Queue
        const attachments = files.map(f => ({
            filename: f.originalname,
            path: f.path,
            size: f.size
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
                    if (update.type === 'sent') {
                        campaign.sent++;
                        const rec = campaign.recipients.find(r => r.email === update.email);
                        if (rec) rec.status = 'sent';
                    } else if (update.type === 'failed') {
                        campaign.failed++;
                        const rec = campaign.recipients.find(r => r.email === update.email);
                        if (rec) rec.status = 'failed';
                    } else if (update.type === 'completed') {
                        campaign.status = 'completed';
                    }
                }
            }
        );

        res.json({
            message: 'Campaign started successfully',
            campaignId: campaignId,
            statusEndpoint: `/api/campaign-status/${campaignId}`
        });

    } catch (error) {
        console.error('Error starting campaign:', error);
        res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
};

exports.getCampaignStatus = async (req, res) => {
    const { id } = req.params;
    const campaign = campaigns.get(id);
    if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
    }
    res.json(campaign);
};
