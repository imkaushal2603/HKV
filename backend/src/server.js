const functions = require("firebase-functions");
const cors = require("cors");
const express = require("express");
require("dotenv").config();

const chatRoutes = require("./routes/chatRoutes");
const promptRoutes = require("./routes/promptRoutes");

const app = express();
const PORT = process.env.PORT || 10000; // ✅ fallback port for local/dev

// middleware
app.use(cors());
app.use(express.json());

// routes
app.use("/api/chat", chatRoutes);
app.use("/api/prompt", promptRoutes);

// test route (optional, but useful)
app.get("/", (req, res) => {
  res.send("✅ Backend is running successfully!");
});

// start server
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port: ${PORT}`);
});

// exports.api = functions.https.onRequest(app);
