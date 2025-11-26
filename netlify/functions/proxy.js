const allowedBase = {
  "users": "https://users.roblox.com",
  "games": "https://games.roblox.com",
  "catalog": "https://catalog.roblox.com",
  "thumbnails": "https://thumbnails.roblox.com",
  "economy": "https://economy.roblox.com"
};

export async function handler(event, context) {
  let targetUrl = null;

  // 1. If ?url= exists → use it (old style)
  if (event.queryStringParameters.url) {
    targetUrl = event.queryStringParameters.url;
  }

  // 2. If redirect used :splat → build URL manually
  if (!targetUrl && event.path) {
    const cleanPath = event.path.replace("/.netlify/functions/proxy", "");
    const parts = cleanPath.split("/").filter(Boolean);

    // Example: /users/v1/users/1
    // parts[0] -> "users"
    // parts.slice(1).join('/') -> "v1/users/1"
    const root = parts[0];

    if (allowedBase[root]) {
      targetUrl = `${allowedBase[root]}/${parts.slice(1).join("/")}`;
    }
  }

  // 3. If still nothing → error
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
  } catch (e) {
    return {
      statusCode: 500,
      body: "Proxy Error: " + e.toString()
    };
  }
}
