const express = require('express');
const router = express.Router();
const emailController = require('../controllers/emailController');
const multer = require('multer');
const path = require('path');

// Configure Multer for attachments
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../../uploads'));
    },
    filename: function (req, file, cb) {
        // Unique name to avoid collisions
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
});

router.post('/config', emailController.configureSmtp);
router.post('/parse-emails', emailController.parseEmails);

// Use multer.array for multiple files
router.post('/send-campaign', upload.array('attachments', 10), emailController.sendCampaign);

router.get('/campaign-status/:id', emailController.getCampaignStatus);

module.exports = router;
