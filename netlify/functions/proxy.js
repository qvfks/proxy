const fetch = require("node-fetch");

// ===== CONFIG =====
const CACHE_TTL = 60000; // 60 seconds (matches Lua)
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const BACKOFF_ON_429 = 5000; // Longer for 2025 blocks

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
const cache = {};

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// FIXED: Handle /avatar/v2/* paths (strips v2)
function buildRobloxURL(path) {
    const segments = path.split("/").filter(Boolean);
    const baseKey = segments[0];

    // Handle avatar v2: strip 'v2' from segments[1]
    let tail = segments.slice(1).join("/");
    if (baseKey === "avatar" && segments[1] === "v2") {
        tail = segments.slice(2).join("/");
    }

    const base = allowedBase[baseKey];
    if (!base) return null;

    return `${base}/${tail}`;
}

async function fetchWithRetries(url) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = await fetch(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 RobloxProxy/2.0", // Better for blocks
                    "Cache-Control": "no-cache"
                }
            });

            if (res.status === 429) {
                console.log(`[proxy] 429, backoff... attempt ${attempt}`);
                await sleep(BACKOFF_ON_429);
                continue;
            }

            const text = await res.text();

            return {
                status: res.status,
                body: text
            };

        } catch (err) {
            console.log(`[proxy] fetch error attempt ${attempt}:`, err);
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

    // Cache check
    const cached = cache[url];
    if (cached && Date.now() - cached.time < CACHE_TTL) {
        console.log("[proxy] Cache hit:", url);
        return {
            statusCode: cached.status,
            body: cached.data,
            headers: { "Content-Type": "application/json" }
        };
    }

    // Fetch
    const result = await fetchWithRetries(url);
    if (!result) {
        return {
            statusCode: 500,
            body: "Roblox API request failed after retries."
        };
    }

    // Cache it
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
