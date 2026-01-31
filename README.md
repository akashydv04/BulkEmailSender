# EmailSender Portal

A production-ready web portal for sending personalized emails to multiple recipients.

## Features
- **Smart Parsing**: Automatically extracts names from email addresses (e.g., `akash.yadav@company.com` -> "Akash Yadav").
- **Personalization**: Dynamic greetings ("Dear Akash Yadav,").
- **Queue System**: Rate-limited sending to avoid spam blocks.
- **Preview**: Live preview of the email before sending.
- **Professional Formatting**: Auto-generated headers and footers.

## Tech Stack
- **Frontend**: Next.js (App Router), Vanilla CSS (Glassmorphism design).
- **Backend**: Node.js, Express.
- **Queue**: In-memory asynchronous queue with retry logic.
- **Email**: Nodemailer (supports SMTP, defaults to Mock for dev).

## Getting Started

### Prerequisites
- Node.js installed.
- SMTP Credentials (optional, for real sending).

### Installation

1. **Clone the repository** (if specific repo exists).
2. **Setup Server**:
   ```bash
   cd server
   npm install
   # Create .env file with:
   # SMTP_HOST=smtp.example.com
   # SMTP_USER=user@example.com
   # SMTP_PASS=password
   # PORT=5001
   npm start
   ```
3. **Setup Client**:
   ```bash
   cd client
   npm install
   npm run dev
   ```
4. **Usage**:
   Open [http://localhost:3000](http://localhost:3000).

## detailed Architecture

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
