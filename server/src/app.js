require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const apiRoutes = require("./routes/api");

const app = express();
const PORT = process.env.PORT || 5001;
const frontendUrl =
  process.env.FRONTEND_URL || "https://bulk-email-sender-psi.vercel.app";
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://bulk-email-sender-psi.vercel.app",
  frontendUrl,
].filter(Boolean);

const isAllowedOrigin = (origin) => {
  if (!origin) return true;

  try {
    const hostname = new URL(origin).hostname;
    return (
      allowedOrigins.includes(origin) ||
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".vercel.app")
    );
  } catch {
    return false;
  }
};

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl) or from allowedOrigins
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    // Explicitly fail for disallowed origins
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
  ],
  optionsSuccessStatus: 204, // some legacy browsers (IE11) choke on 204
};

// Apply CORS to all routes
app.use(cors(corsOptions));
// Explicitly handle OPTIONS preflight across all routes so the Access-Control-* headers are always sent
// Avoid using app.options('*', ...) because some path-to-regexp versions reject '*' as a route pattern on certain platforms.
// Use a middleware to respond to OPTIONS preflight requests instead.
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    return cors(corsOptions)(req, res, () => res.sendStatus(204));
  }
  next();
});
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Disable Express ETag generation to avoid conditional 304 responses
app.set("etag", false);

// Global anti-caching headers for all /api routes to prevent browser caching
app.use("/api", (req, res, next) => {
  res.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

app.use("/api", apiRoutes);

app.get("/", (req, res) => {
  res.send("Email Sender API is running");
});

app.use((err, req, res, next) => {
  console.error("Express Global Error:", err);
  res.status(500).json({ error: "Server crashed: " + err.message });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
