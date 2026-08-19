# EmailSender Portal

A production-ready web portal for sending personalized emails to multiple recipients.

## Features
- **Smart Parsing**: Automatically extracts names from email addresses.
- **Excel & CSV Uploads**: Upload recipient lists and use dynamic placeholders like `{Name}`, `{Company}`, `{Role}` in your emails.
- **Personalization**: Dynamic greetings and auto-replaced variables per recipient.
- **Queue System**: Rate-limited background sending to avoid spam blocks.
- **File Attachments**: Support for sending PDFs, DOCXs, and other files with your campaign.
- **Secure Authentication**: End-to-end encrypted session using your Gmail App Passwords without global state leaks.
- **Preview**: Live preview of the email rendering for the first recipient before sending.
- **Professional Formatting**: Auto-generated headers and footers with a disclaimer.

## Tech Stack
- **Frontend**: Next.js (App Router), Vanilla CSS (Glassmorphism design).
- **Backend**: Node.js, Express.
- **Queue**: In-memory asynchronous queue with retry logic.
- **Email**: Nodemailer (supports SMTP, defaults to Mock for dev).

## Getting Started

### Prerequisites
- Node.js installed.
- A Gmail account with an **App Password** generated (Since Google disabled "Less Secure Apps", you must enable 2FA and generate a 16-character App Password in your Google Account security settings).

### 🚀 How to Run the Project

You will need two terminal windows to run both the frontend and the backend simultaneously.

**Terminal 1: Start the Backend Server**
```bash
cd server
npm install
npm start
```
*(The server will run on http://localhost:5001)*

**Terminal 2: Start the Frontend Client**
```bash
cd client
npm install
npm run dev
```
*(The React client will run on http://localhost:3000)*

**Usage**:
1. Open [http://localhost:3000](http://localhost:3000) in your web browser.
2. Log in securely using your Gmail address and your 16-character App Password.
3. Upload an Excel/CSV file with your recipients or paste them manually!

### ⚠️ Troubleshooting

**Issue: `npm error Missing script: "start"`**
If you tried to run `npm start` and got this error, it means the `start` script was missing from `server/package.json`. This issue has now been fixed! You can use `npm start` safely. 

If you prefer to run it manually without npm, you can also run:
```bash
cd server
node src/app.js
```

## Detailed Architecture

### Backend
- `controllers/emailController`: Handles parsing and campaign initiation.
- `services/queueService`: Manages the sending queue, rate limiting, and retries.
- `services/emailService`: Wrapper around Nodemailer.
- `utils/helper`: Logic for name inference.

### Frontend
- `components/EmailParser`: Input validation and API interaction.
- `components/EmailComposer`: Rich editor (textarea) with live preview.
- `components/StatusDashboard`: Real-time polling of campaign status.

## Deployment
- **Frontend**: Deploy to Vercel/Netlify.
- **Backend**: Deploy to Railway/Render/AWS/Heroku.
- ensure `NEXT_PUBLIC_API_URL` (if configured) or hardcoded URLs match production backend.

## Security & Best Practices
- **Rate Limiting**: Implemented in queue processing.
- **Validation**: Server-side and Client-side validation.
- **Sanitization**: Inputs are handled safely (basic).
# BulkEmailSender
