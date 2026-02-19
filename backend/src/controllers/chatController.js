// backend/chatHandler.js
const OpenAI = require("openai/index.js");
const axios = require("axios");
const xml2js = require("xml2js");
const cheerio = require("cheerio");
const { URL } = require("url");
const fs = require("fs");
const path = require("path");
const { fetchPagesFromHubSpot, fetchBlogsFromHubSpot } = require("./pagesController");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let pagesJSON = [];
let blogsJSON = [];

async function refreshCaches() {
  try {
    const pages = await fetchPagesFromHubSpot();
    pagesJSON = pages || [];

    const blogs = await fetchBlogsFromHubSpot();
    blogsJSON = blogs || [];
  } catch (err) {
    console.error("❌ Failed to refresh caches:", err.message);
  }
}

refreshCaches();
setInterval(refreshCaches, 6 * 60 * 60 * 1000);

// === Load system prompt from external file OR use fallback ===
function loadSystemPrompt(targetLanguage) {
  const promptPath = path.join(__dirname, "../prompt/chatgptPrompt.txt");

  try {
    if (fs.existsSync(promptPath)) {
      const content = fs.readFileSync(promptPath, "utf8").trim();

      if (content.length > 0) {
        console.log("🟢 System prompt loaded successfully from:", promptPath);
        return content
          .replace(/{targetLanguage}/g, targetLanguage)
          .replace("{pagesJSON}", JSON.stringify(pagesJSON))
          .replace("{blogsJSON}", JSON.stringify(blogsJSON));
      } else {
        console.warn("⚠️ chatgptPrompt.txt is EMPTY — switching to fallback prompt.");
        return `ROLE:
                You are the official **HKV AI Assistant**. Your goal is to help visitors find the right educational courses and certifications.

                INPUTS:
                - {targetLanguage}
                - pagesJSON = {pagesJSON} (Contains HKV Course Listings and Details)
                - blogsJSON = {blogsJSON} (Contains HKV News and Updates)

                ---

                OBJECTIVES:
                1. Welcome visitors warmly and reply strictly in {targetLanguage}.
                2. Focus exclusively on recommending **Courses** and **Course Details** from the provided HKV data.
                3. If a visitor asks about enrollment, specific course requirements, or custom training, ask for their **name** and **email** so the HKV team can assist.
                4. When recommending links, include them invisibly in JSON using the defined format.

                ---

                LOGIC:

                ### 🎓 COURSE & CONTENT HANDLING
                - Prioritize matches found in **{pagesJSON}** that contain "course", "listing", "detail", or specific educational subjects.
                - If the visitor's query does not match an available course:
                  - Do NOT guess.
                  - Politely state that you couldn't find an exact match and ask for their **name** and **email** so an advisor can reach out.
                  - In <JSON_OUTPUT>, set "detailsRequired": true.

                ### 📄 LANGUAGE & LINKING
                - Always return pages matching the visitor's language ({targetLanguage}).
                - If a course page is not available in that language, fallback to German ("de") or English ("en").
                - Maximum 3 course links per response.
                - If no blog matches are found, use the fallback: https://145914055.hs-sites-eu1.com/course-listing.

                ---

                OUTPUT FORMAT:
                <JSON_OUTPUT>{"detailsRequired":true,"links":[{"title":"string","url":"string","description":"string"}],"categorized":false}</JSON_OUTPUT>

                STYLE:
                - Professional, educational, and encouraging.
                - Always in {targetLanguage}.
                - Focus on HKV's tradition and future in education.`;
      }
    } else {
      console.warn("⚠️ chatgptPrompt.txt NOT FOUND — switching to fallback prompt.");
    }
  } catch (err) {
    console.error("❌ Failed to load system prompt:", err.message);
  }
}

exports.handleChatRequest = async (req, res) => {
  try {
    const { message, language, websiteUrl, chatHistory } = req.body;
    if (!message) return res.status(400).json({ error: "Missing message" });

    let targetLanguage = (language || "en").split(/[-_]/)[0].toLowerCase();
    console.log("🟢 Incoming message:", message);
    console.log("🟢 Target language:", targetLanguage);

    let siteContent = "";
    let allUrls = [];

    // Step 1️⃣ — Try fetching sitemap or scrape fallback
    if (websiteUrl) {
      try {
        const sitemapUrl = new URL("/sitemap.xml", websiteUrl).href;
        const { data } = await axios.get(sitemapUrl, { timeout: 10000 });
        const parsed = await xml2js.parseStringPromise(data);

        allUrls = parsed.urlset?.url?.map((u) => u.loc?.[0]).filter(Boolean) || [];

        if (allUrls.length > 0) {
          siteContent = `Here are some pages found from ${websiteUrl}:\n${allUrls.join("\n")}`;
        } else {
          // Fallback scrape if sitemap empty
          const { data: html } = await axios.get(websiteUrl);
          const $ = cheerio.load(html);
          const links = [];
          $("a").each((_, el) => {
            const href = $(el).attr("href");
            if (href && links.length < 10) {
              links.push(new URL(href, websiteUrl).href);
            }
          });
          allUrls = links;
          siteContent = `Some pages found:\n${links.join("\n")}`;
        }
      } catch (err) {
        console.warn("⚠️ Could not fetch sitemap or pages:", err.message);
      }
    }

    // Step 2️⃣ — Load prompt from file and inject dynamic values
    let systemPrompt = loadSystemPrompt(targetLanguage);

    systemPrompt = systemPrompt
      .replace(/{targetLanguage}/g, targetLanguage)
      .replace("{pagesJSON}", JSON.stringify(pagesJSON))
      .replace("{blogsJSON}", JSON.stringify(blogsJSON));

    // Step 3️⃣ — Prepare messages for GPT
    const cleanHistory = Array.isArray(chatHistory)
      ? chatHistory.filter((m) => m && m.role && m.content)
      : [];

    const messages = [
      { role: "system", content: systemPrompt },
      ...cleanHistory,
      {
        role: "user",
        content: `${message}\n\n${siteContent || ""}`,
      },
    ];

    // Step 4️⃣ — GPT response
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 600,
    });

    const reply = completion.choices[0]?.message?.content?.trim() || "No response";
    console.log("✅ Reply generated.", reply);

    // Step 5️⃣ — Extract JSON_OUTPUT
    let linksData = [];
    let isContactForm = "";
    const jsonMatch = reply.match(/<JSON_OUTPUT>([\s\S]*?)<\/JSON_OUTPUT>/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        isContactForm = parsed.detailsRequired;
        if (Array.isArray(parsed.links)) linksData = parsed.links;
      } catch (err) {
        console.warn("⚠️ Could not parse JSON_OUTPUT:", err.message);
      }
    }
    res.json({ reply, links: linksData, isContactForm });
  } catch (err) {
    console.error("❌ Chat error:", err);
    res.status(500).json({
      error: "Something went wrong.",
      details: err?.message || err,
    });
  }
};