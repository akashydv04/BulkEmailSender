# Free deployment guide for EmailSender

This project is ready for a zero-cost public deployment using:

- Frontend: Vercel (free)
- Backend: Render (free tier)
- Email: Gmail App Password

## 1) Push the code to GitHub

If the repo is not already pushed:

```bash
git add .
git commit -m "Prepare app for free deployment"
git push origin feature/dynamic-resume-emails
```

## 2) Deploy the backend on Render

1. Open https://render.com and sign in with GitHub.
2. Click New > Web Service.
3. Connect this repository.
4. Select the server folder as the root directory.
5. Use these settings:
   - Build command: `npm install`
   - Start command: `npm start`
6. Add environment variables:
   - `PORT=5001`
   - `FRONTEND_URL=https://your-frontend-url.vercel.app` (the backend also accepts Vercel preview URLs)
   - `GEMINI_API_KEY=your_google_api_key_if_using_resume_generation`
   - `DATABASE_URL=<your Render PostgreSQL connection string>` (recommended for campaign status persistence)
   - `DATABASE_SSL=true`
7. Click Create Web Service.
8. Copy the backend URL after deployment.

Example backend URL:

```text
https://bulk-email-sender.onrender.com
```

## 3) Deploy the frontend on Vercel

1. Open https://vercel.com and sign in with GitHub.
2. Click Add New Project.
3. Import this repository.
4. Set the project root to `client`.
5. Build settings:
   - Install command: `npm install`
   - Build command: `npm run build`
   - Output directory: `.next`
6. Add environment variable:
   - `NEXT_PUBLIC_API_URL=https://your-render-backend-url/api`
7. Deploy.

## 4) Test the app live

Open the Vercel URL and verify:

- SMTP configuration works
- email parsing works
- campaign sending starts
- campaign status polling works

## 5) Gmail configuration

Use a Gmail App Password, not your main password:

- Visit https://myaccount.google.com/apppasswords
- Generate a 16-character app password
- Use it in the app login form

## 6) Notes about free hosting

This is free for a personal/demo app, but free tiers may:

- sleep after inactivity
- have limited compute time
- not support heavy campaign volume

For large-scale sending, use a paid SMTP provider and a production server.
