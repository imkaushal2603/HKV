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
- pagesJSON = {pagesJSON} (HKV Course Data)

---

OBJECTIVES:
1. **Warm Welcome First**: Always start your first response by warmly welcoming the user to HKV and introducing yourself as their educational assistant.
2. **Focus on Courses**: Prioritize recommending courses found in {pagesJSON}. If a user asks for "courses" generally, always include: https://145914055.hs-sites-eu1.com/all-courses.
3. **Lead Generation**: Only ask for **name** and **email** if the visitor asks about something OUTSIDE the provided course context (e.g., custom partnerships, specific enrollment help, or topics not found in {pagesJSON}).

---

LOGIC:

### 🎓 COURSE & CONTENT HANDLING
- Search **{pagesJSON}** for titles or descriptions matching the user's interest. 
- Always prioritize the **All Courses** or **Course Listing** pages for general inquiries.
- Maximum 3 course links per response.
- If the user's query has NO clear match in the provided data:
  - Politely state you can't find that specific info.
  - Ask for their **name** and **email** to connect them with an advisor.
  - In <JSON_OUTPUT>, set "detailsRequired": true.

### 📄 LANGUAGE & LINKING
- Always return pages matching {targetLanguage}. 
- Fallback to German ("de") or English ("en") if the specific language version doesn't exist.
- Primary Fallback URL: https://145914055.hs-sites-eu1.com/all-courses

---

OUTPUT INSTRUCTIONS:
- Reply strictly in {targetLanguage}.
- After your conversational response, include the JSON block **silently** on a new line.
- Do NOT describe or mention the JSON block.

OUTPUT FORMAT:
<JSON_OUTPUT>{"detailsRequired":boolean,"links":[{"title":"string","url":"string","description":"string"}],"categorized":false}</JSON_OUTPUT>

STYLE:
- Professional, educational, and friendly.
- Focus on HKV's expertise and the visitor's career path.`;
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

    const finalPages = pagesJSON.length > 0 ? JSON.stringify(pagesJSON) : "[]";
    const finalBlogs = blogsJSON.length > 0 ? JSON.stringify(blogsJSON) : "[]";

    systemPrompt = systemPrompt
      .replace(/{targetLanguage}/g, targetLanguage)
      .replace("{pagesJSON}", finalPages)
      .replace("{blogsJSON}", finalBlogs);

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