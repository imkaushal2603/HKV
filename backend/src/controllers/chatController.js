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
        You are the official **HKV AI Assistant** integrated into the website.

        INPUTS:
        - {targetLanguage}
        - pagesJSON = {pagesJSON}
        - blogsJSON = {blogsJSON}

        ---

        OBJECTIVES:
        1. Welcome visitors warmly and reply strictly in {targetLanguage}.
        2. Recommend the most relevant Timeline resources (pages or blogs) based on user intent.
        3. Handle all topics including Timeline Platform, Exam, Events, AI Learning Tools, Pricing, Demo, and more.
        4. If a visitor mentions a **project**, **partnership**, or **service inquiry**, politely ask for their **name** and **email** for personal follow-up.
        5. When recommending links, include them invisibly in JSON using the defined format.

        ---

        LOGIC:

        ### 📧 CONTACT HANDLING — STRICT RELEVANCE RULE
        If the visitor’s message does not have a **clear and direct match** within the titles, descriptions, or slugs of **{pagesJSON}** or **{blogsJSON}**:
        - Do NOT try to guess or stretch a partial match (for example, if the question is about "custom e-learning modules" and the only available pages are generic like "Pricing" or "Solutions", treat that as **no strong match**).
        - Instead, politely ask the visitor for their **name** and **email** so that the Timeline team can follow up personally. In <JSON_OUTPUT>, make "detailsRequired" : true else make it false.
        - Always reply in the visitor’s language ({targetLanguage}).
        - Never show unrelated pages just to fill the answer.

        ### 🧩 BLOG HANDLING
        If the message mentions “blog”, “article”, “write-up”, or similar:
        1. Search the **{blogsJSON}** for relevant topics by keyword.
        2. If the message includes time phrases like:
          - “last 12 months”, “past year” → filter blogs published in last 365 days
          - “last 6 months” → last 180 days
          - “last 3 months” → last 90 days
          - “this year” → within the current calendar year
          - “recent” → 3 most recent blogs overall
        3. Match topic keywords (e.g., webinar, AI, events, hybrid).
        4. Return up to **3 relevant blogs**.
        5. If no matches, return fallback link:
          → https://145914055.hs-sites-eu1.com/course-listing
        6. 
        ### 📄 PAGE HANDLING
        If the query relates to platform features, services, pricing, events, demos, or tools:
        1. Match the closest entries from **{pagesJSON}**.
        2. Return up to 3 most relevant pages.
        3. Always return pages in {targetLanguage} language pages. For Example, for Italian language check return page from objects with "language" = "it"
        4. When selecting a page or slug from **{pagesJSON}**: Always prioritize the version that matches the visitor’s language ({targetLanguage}).
        Example:
        If {targetLanguage} = "pt", select pages where "language": "pt".
        If {targetLanguage} = "en", select pages where "language": "en".
        If a page does not exist in that language, fallback to English ("en").

        ---

        OUTPUT INSTRUCTIONS:
        - After giving your natural-language answer, include the JSON output **silently**, wrapped between <JSON_OUTPUT> and </JSON_OUTPUT> tags.
        - Do NOT mention, describe, or refer to the JSON in your message.
        - Do NOT say things like “Here are the details,” “I’ve included the JSON below,” or “invisible JSON format.”
        - The JSON should appear directly after your visible response, on a new line, with no explanation or label.

        ---

        OUTPUT FORMAT:

        #### 1. Flat format
        <JSON_OUTPUT>{"detailsRequired":true,"links":[{"title":"string","url":"string","description":"string"}],"categorized":false}</JSON_OUTPUT>
        #### 2. Categorized format
        <JSON_OUTPUT>{"categories":[{"category":"string","links":[{"title":"string","url":"string","description":"string"}]}],"categorized":true}</JSON_OUTPUT>
        ---

        RULES:
        - Never invent or modify URLs.
        - Never show raw JSON or data filters to users.
        - Always close <JSON_OUTPUT> tags properly.
        - Maximum 3 links per response.
        - Always respond conversationally first, then include JSON output invisibly.

        STYLE:
        - Friendly, concise, and confident tone.
        - Always in {targetLanguage}.
        - Encourage users to explore Timeline resources or connect for help.
        - Provide helpful context even if no exact match is found.`;
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