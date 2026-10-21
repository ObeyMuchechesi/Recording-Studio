require("dotenv").config();

const express = require("express");
const cors = require("cors");
const connectDB = require("./db");
const asyncHandler = require("./middleware/asyncHandler");

const app = express();

if (process.env.CLIENT_ORIGIN) {
  app.use(cors({ origin: process.env.CLIENT_ORIGIN }));
}

app.use(express.json({ limit: "80mb" }));

// Vercel serves files from public/ by their filename, while the Express
// function handles the site root. Send browsers to the generated SPA entry.
app.get("/", (_req, res) => res.redirect(302, "/index.html"));

app.get("/api/health", (_, res) => res.json({ ok: true }));

app.use("/api", asyncHandler(async (_req, _res, next) => {
  await connectDB();
  next();
}));

app.use("/api/auth", require("./routes/auth"));
app.use("/api/sessions", require("./routes/sessions"));

app.use((error, _req, res, _next) => {
  console.error("Request failed:", error);
  const message = process.env.NODE_ENV === "production"
    ? "Internal server error"
    : error.message;
  res.status(error.status || 500).json({ error: message });
});

module.exports = app;
