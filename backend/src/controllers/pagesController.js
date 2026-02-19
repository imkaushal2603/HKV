const axios = require("axios");

async function fetchPagesFromHubSpot() {
  console.log("🔄 Fetching pages from HubSpot...");
  try {
    const response = await axios.get("https://api.hubapi.com/cms/v3/pages/site-pages?state__in=PUBLISHED_OR_SCHEDULED&property=name,slug,language,htmlTitle", {
      headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}` },
    });

    let dataResponse = response.data.results || [];
    console.log(dataResponse)
    return dataResponse;
  } catch (error) {
    console.error("❌ Failed to fetch pages from HubSpot:", error.message);
  }
}

async function fetchBlogsFromHubSpot() {
  console.log("🔄 Fetching blogs from HubSpot...");
  try {
    const response = await axios.get("https://api.hubapi.com/cms/v3/blogs/posts?property=name,slug,language,htmlTitle,publishDate&limit=1000", {
      headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}` },
    });

    let dataResponse = response.data.results || [];

    return dataResponse;
  } catch (error) {
    console.error("❌ Failed to fetch pages from HubSpot:", error.message);
  }
}

module.exports = {
    fetchPagesFromHubSpot,
    fetchBlogsFromHubSpot
};