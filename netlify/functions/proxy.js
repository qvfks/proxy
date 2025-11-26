const fetch = require("node-fetch");

// ===== CONFIG =====
const CACHE_TTL = 15000; // 15 seconds cache
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second
const BACKOFF_ON_429 = 2000; // wait 2s then retry

// Allowable Roblox API base URLs
const allowedBase = {
    users: "https://users.roblox.com",
    games: "https://games.roblox.com",
    catalog: "https://catalog.roblox.com",
    thumbnails: "https://thumbnails.roblox.com",
    economy: "https://economy.roblox.com",
    avatar: "https://avatar.roblox.com"
};

// Simple in-memory cache
// key: url → { time, data, status }
const cache = {};

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildRobloxURL(path) {
    const segments = path.split("/").filter(Boolean);
    const baseKey = segments[0];

    const base = allowedBase[baseKey];
    if (!base) return null;

    const tail = segments.slice(1).join("/");
    return `${base}/${tail}`;
}

async function fetchWithRetries(url) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = await fetch(url, {
                headers: {
                    "User-Agent": "Roblox-Proxy/1.0",
                    "Cache-Control": "no-cache"
                }
            });

            // Roblox rate-limit (429)
            if (res.status === 429) {
                console.log(`[proxy] Roblox returned 429, backoff... attempt ${attempt}`);
                await sleep(BACKOFF_ON_429);
                continue;
            }

            const text = await res.text();

            return {
                status: res.status,
                body: text
            };

        } catch (err) {
            console.log(`[proxy] fetch error on attempt ${attempt}:`, err);
            await sleep(RETRY_DELAY);
        }
    }

    return null;
}

exports.handler = async function(event, context) {
    const path = event.path.replace("/.netlify/functions/proxy", "");
    const url = buildRobloxURL(path);

    if (!url) {
        return {
            statusCode: 400,
            body: "Invalid Roblox API base."
        };
    }

    console.log("[proxy] Request →", url);

    // ----- CACHE CHECK -----
    const cached = cache[url];
    if (cached && Date.now() - cached.time < CACHE_TTL) {
        console.log("[proxy] Cache hit:", url);
        return {
            statusCode: cached.status,
            body: cached.data,
            headers: { "Content-Type": "application/json" }
        };
    }

    // ----- FETCH WITH RETRIES -----
    const result = await fetchWithRetries(url);
    if (!result) {
        return {
            statusCode: 500,
            body: "Roblox API request failed after retries."
        };
    }

    // Save to cache
    cache[url] = {
        time: Date.now(),
        data: result.body,
        status: result.status
    };

    console.log("[proxy] Response:", result.status);

    return {
        statusCode: result.status,
        body: result.body,
        headers: { "Content-Type": "application/json" }
    };
};
