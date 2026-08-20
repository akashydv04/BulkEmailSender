const express = require('express');
const router = express.Router();
const emailController = require('../controllers/emailController');
const multer = require('multer');
const path = require('path');
const rateLimit = require('express-rate-limit');

const RESUME_MAX_SIZE = 5 * 1024 * 1024;
const ATTACHMENT_MAX_SIZE = 5 * 1024 * 1024;
const allowedDocumentTypes = new Map([
    ['.pdf', 'application/pdf'],
    ['.doc', 'application/msword'],
    ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
]);

const limiterMessage = { error: 'Too many requests. Please wait and try again.' };
const resumeLimiter = rateLimit({
    windowMs: Number(process.env.RESUME_PARSE_RATE_WINDOW_MS || 15 * 60 * 1000),
    limit: Number(process.env.RESUME_PARSE_RATE_LIMIT || 5),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: limiterMessage,
});
const campaignLimiter = rateLimit({
    windowMs: Number(process.env.CAMPAIGN_RATE_WINDOW_MS || 60 * 60 * 1000),
    limit: Number(process.env.CAMPAIGN_RATE_LIMIT || 3),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: limiterMessage,
});

function documentFileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const expectedMime = allowedDocumentTypes.get(ext);
    if (!expectedMime || file.mimetype !== expectedMime) {
        const err = new Error('Only PDF, DOC, and DOCX files are allowed.');
        err.status = 400;
        return cb(err);
    }
    cb(null, true);
}

// Configure Multer for attachments
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../../uploads'));
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, uniqueSuffix + '-' + safeName);
    }
});
const uploadDocuments = multer({
    storage: storage,
    limits: { fileSize: ATTACHMENT_MAX_SIZE, files: 10 },
    fileFilter: documentFileFilter,
});
const uploadResume = multer({
    storage: storage,
    limits: { fileSize: RESUME_MAX_SIZE, files: 1 },
    fileFilter: documentFileFilter,
});

router.post('/config', emailController.configureSmtp);
router.post('/parse-emails', emailController.parseEmails);

router.post('/send-campaign', campaignLimiter, uploadDocuments.array('attachments', 10), emailController.sendCampaign);

router.get('/campaign-status/:id', emailController.getCampaignStatus);

router.post('/generate-email', resumeLimiter, uploadResume.single('resume'), emailController.generateEmail);
router.post('/emails/parse-resume', resumeLimiter, uploadResume.single('resume'), emailController.generateEmail);

module.exports = router;
