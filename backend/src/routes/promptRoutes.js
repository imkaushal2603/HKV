// src/routes/promptRoutes.js
const express = require("express");
const router = express.Router();
const { getPromptContent, updatePromptContent } = require("../controllers/promptController");

// GET → fetch the current prompt
router.get("/", getPromptContent);

// POST → update the prompt content
router.post("/", updatePromptContent);

module.exports = router;