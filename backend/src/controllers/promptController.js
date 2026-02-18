// backend/controllers/promptController.js
const fs = require("fs");
const path = require("path");

exports.getPromptContent = async (req, res) => {
    try {
        const promptPath = path.join(__dirname, "../prompt/chatgptPrompt.txt");
        console.log("🟡 Looking for prompt at:", promptPath);

        // Check if file exists
        if (!fs.existsSync(promptPath)) {
            return res.status(404).json({ success: false, message: "Prompt file not found" });
        }

        // Read file content
        const content = fs.readFileSync(promptPath, "utf8");

        res.json({
            success: true,
            prompt: content
        });
    } catch (error) {
        console.error("❌ Error reading prompt file:", error);
        res.status(500).json({
            success: false,
            message: "Error reading prompt file",
            error: error.message
        });
    }
};

exports.updatePromptContent = async (req, res) => {
    try {
        const { newPrompt } = req.body;

        if (!newPrompt) {
            return res.status(400).json({
                success: false,
                message: "Request body must include 'newPrompt'",
            });
        }

        const promptPath = path.join(__dirname, "../prompt/chatgptPrompt.txt");
        fs.writeFileSync(promptPath, newPrompt, "utf8");

        console.log("✅ Prompt file updated successfully!");

        res.json({
            success: true,
            message: "Prompt file updated successfully",
            newPrompt,
        });
    } catch (error) {
        console.error("❌ Error updating prompt file:", error);
        res.status(500).json({
            success: false,
            message: "Error updating prompt file",
            error: error.message,
        });
    }
};