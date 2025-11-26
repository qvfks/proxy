const allowedDomains = [
  "https://users.roblox.com",
  "https://thumbnails.roblox.com",
  "https://games.roblox.com",
  "https://catalog.roblox.com",
  "https://economy.roblox.com"
];

export async function handler(event, context) {
  const url = event.queryStringParameters.url;
  if (!url) {
    return { statusCode: 400, body: "Missing ?url=" };
  }

  if (!allowedDomains.some(domain => url.startsWith(domain))) {
    return { statusCode: 403, body: "Domain not allowed" };
  }

  try {
    const response = await fetch(url);
    const text = await response.text();

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": response.headers.get("content-type") || "text/plain",
        "Cache-Control": "public, max-age=60"
      },
      body: text
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: "Error: " + error.toString()
    };
  }
}
