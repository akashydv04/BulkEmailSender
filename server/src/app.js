require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const apiRoutes = require("./routes/api");

const app = express();
const PORT = process.env.PORT || 5001;
const frontendUrl =
  process.env.FRONTEND_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://bulk-email-sender-psi.vercel.app"
    : undefined);
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  frontendUrl,
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
};

app.use(cors(corsOptions));
// Ensure OPTIONS preflight requests are responded to with CORS headers
app.options("*", cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

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
