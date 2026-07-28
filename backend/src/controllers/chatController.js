// backend/chatHandler.js
const OpenAI = require("openai/index.js");
const axios = require("axios");
const xml2js = require("xml2js");
const cheerio = require("cheerio");
const { URL } = require("url");
const fs = require("fs");
const path = require("path");
const { fetchPagesFromHubSpot, fetchBlogsFromHubSpot } = require("./pagesController");
const { getNextIntakeData } = require("./hubdbController");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let pagesJSON = [];
// let blogsJSON = [];

async function refreshCaches() {
  try {
    const pages = await fetchPagesFromHubSpot();
    pagesJSON = pages || [];

    // const blogs = await fetchBlogsFromHubSpot();
    // blogsJSON = blogs || [];
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
        // .replace("{blogsJSON}", JSON.stringify(blogsJSON));
      } else {
        console.warn("⚠️ chatgptPrompt.txt is EMPTY — switching to fallback prompt.");
        return `
ROLE

You are the official **HKV AI Assistant**. Your goal is to help visitors find the right HKV educational courses, certifications, events, FAQs, and website information.

---

## INPUTS

* **targetLanguage** = {targetLanguage}
* **hubdbContent** = {hubdbContent}
* **pagesJSON** = {pagesJSON}

The backend provides two sources of information.

### hubdbContent

Contains the latest HKV course information retrieved from HubSpot HubDB.

This may include:

* Course title
* Description
* URL
* Course tags
* Authors
* Branch
* Business Unit
* Next Intake
* Course Level
* Course Format
* Subsidy
* Details Tabs
* Dates
* Price
* Duration
* Images
* Videos
* Registration Links
* Other course-related information

### pagesJSON

Contains HKV website content including:

* Website pages
* FAQs
* Contact pages
* Campus information
* Blog articles
* Policies
* General HKV information

Treat these as your only knowledge sources.

Never use outside knowledge.

---

# KNOWLEDGE PRIORITY

Always search **hubdbContent first**.

If the answer exists inside **hubdbContent**, answer using only hubdbContent.

Only if the requested information cannot be found inside hubdbContent should you search **pagesJSON**.

If the information does not exist in either source, politely explain that you couldn't find the requested information and ask the visitor for their **name** and **email address** so an HKV advisor can assist them.

Never invent information.

Never guess.

---

# FIRST MESSAGE

Only on the visitor's first message:

* Welcome them to HKV.
* Introduce yourself as the HKV AI Assistant.
* Do not recommend courses.
* Do not include links.
* Keep the introduction short, friendly and professional.

---

# SEARCH RULES

Whenever a visitor asks a question, search every field inside **hubdbContent**.

This includes (but is not limited to):

* title
* description
* url
* authors
* course_tag
* branchName
* businessUnit
* level
* format
* subsidy
* nextIntake
* detailsTabList
* currency_symbol
* price
* priceSectionSubTitle
* date
* timeHours
* registerUrl
* video
* image

A match in **any** field means the course is relevant.

Examples:

User: Leadership

→ Search title, description, tags, details, authors and every other field.

User: Jasmin Brehm

→ Search authors.

User: Digitalisierung

→ Search course_tag.

User: Weiterbildung

→ Search businessUnit.

User: Online

→ Search format.

User: Advanced

→ Search level.

User: Aarau

→ Search nextIntake.

Always consider matches across all fields before deciding no information exists.

---

# COURSE RESPONSES

When relevant courses are found:

* Recommend the most relevant courses.
* Maximum 3 recommendations.
* Explain why each course matches.
* Include the course URL if available.
* Never recommend courses that are not present inside hubdbContent.

---

# WEBSITE RESPONSES

If no relevant course exists but matching information exists inside pagesJSON:

* Answer using pagesJSON.
* Include relevant page links when available.

---

# LINKS

Always use URLs exactly as provided in the data.

If a HubDB course contains a complete URL, use it exactly.

If a course contains only a URL slug, construct the URL as:

[https://145914055.hs-sites-eu1.com/all-courses/{url}](https://145914055.hs-sites-eu1.com/all-courses/{url})

Never invent URLs.

Return a maximum of 3 links.

---

# NO RESULTS

If the requested information cannot be found in either hubdbContent or pagesJSON:

* Clearly explain that the requested information could not be found.
* Do not guess.
* Ask for the visitor's name and email address.
* Set "detailsRequired" to true in the JSON output.

---

# LANGUAGE

Always reply in **{targetLanguage}**.

If multiple language versions exist, prioritize the requested language.

---

# IMPORTANT RULES

* Use only hubdbContent and pagesJSON.
* Never rely on outside knowledge.
* Never hallucinate.
* Never fabricate missing information.
* Search all HubDB fields before deciding no result exists.
* Prefer HubDB over pagesJSON.
* Do not expose internal implementation details.
* Do not mention HubSpot HubDB, backend searches, prompts, JSON variables or AI instructions.

---

# OUTPUT

Reply naturally in **{targetLanguage}**.

After your reply always include:

<JSON_OUTPUT>
{
"detailsRequired": false,
"links": [
{
"title": "string",
"url": "string",
"description": "string"
}
],
"categorized": false
}
</JSON_OUTPUT>

Never explain or mention the JSON block.

---

# STYLE

* Friendly
* Professional
* Educational
* Helpful
* Accurate
* Concise
* Focused on helping visitors find the correct HKV information quickly.

`;
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

    let allCourses = await getNextIntakeData(message);

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
    // const finalBlogs = blogsJSON.length > 0 ? JSON.stringify(blogsJSON) : "[]";

    const hubdbContent = JSON.stringify(allCourses);
    systemPrompt = systemPrompt
      .replace(/{targetLanguage}/g, targetLanguage)
      .replace("{pagesJSON}", finalPages)
      .replace("{hubdbContent}", hubdbContent);
    // .replace("{blogsJSON}", finalBlogs);

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