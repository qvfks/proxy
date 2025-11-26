// Allowed Roblox API roots
const allowedBase = {
  "users": "https://users.roblox.com",
  "games": "https://games.roblox.com",
  "catalog": "https://catalog.roblox.com",
  "thumbnails": "https://thumbnails.roblox.com",
  "economy": "https://economy.roblox.com",
  "avatar": "https://avatar.roblox.com" // Added for saved outfits
};

export async function handler(event, context) {
  let targetUrl = null;

  // 1. Support old ?url= style
  if (event.queryStringParameters.url) {
    targetUrl = event.queryStringParameters.url;
  }

  // 2. Pretty URL routing (RoProxy style)
  if (!targetUrl && event.path) {
    // Remove Netlify function prefix
    const cleanPath = event.path.replace("/.netlify/functions/proxy", "");
    const parts = cleanPath.split("/").filter(Boolean);

    // Example: /avatar/v1/users/1/outfits
    // parts[0] = "avatar"
    // parts[1...] = remaining path
    const root = parts[0];

    if (allowedBase[root]) {
      targetUrl = `${allowedBase[root]}/${parts.slice(1).join("/")}`;
    }
  }

  // 3. Final validation
  if (!targetUrl || !targetUrl.startsWith("http")) {
    return {
      statusCode: 400,
      body: "Error: Missing or invalid Roblox API URL."
    };
  }

  try {
    const response = await fetch(targetUrl);
    const body = await response.text();

    return {
      statusCode: response.status,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": response.headers.get("content-type") || "text/plain"
      },
      body: body
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: "Proxy Error: " + error.toString()
    };
  }
}
