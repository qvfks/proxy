const fetch = require("node-fetch");

// ===== CONFIG (Tuned for 2025 Roblox blocks) =====
const CACHE_TTL = 60000; // 60 seconds cache (syncs with your Lua)
const MAX_RETRIES = 5;   // More attempts
const RETRY_DELAY = 2000; // 2s base delay
const BACKOFF_ON_429 = 5000; // 5s backoff for rate limits

// Allowable Roblox API base URLs (unchanged)
const allowedBase = {
    users: "https://users.roblox.com",
    games: "https://games.roblox.com",
    catalog: "https://catalog.roblox.com",
    thumbnails: "https://thumbnails.roblox.com",
    economy: "https://economy.roblox.com",
    avatar: "https://avatar.roblox.com"
};

// In-memory cache: key: full_url → { time, data, status }
const cache = {};

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// FIXED: Better Roblox URL builder (handles /avatar/v2/* correctly)
function buildRobloxURL(path) {
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 0) return null;

    let baseKey = segments[0];
    let tail = segments.slice(1).join("/");

    // Special handling for avatar v2: strip 'v2' from tail if present
    if (baseKey === "avatar" && segments[1] === "v2") {
        tail = segments.slice(2).join("/");
    }

    const base = allowedBase[baseKey];
    if (!base) {
        console.log(`[proxy] Invalid base: ${baseKey}`);
        return null;
    }

    const fullUrl = `${base}/${tail}`;
    console.log(`[proxy] Built URL: ${fullUrl} from path: ${path}`);
    return fullUrl;
}

async function fetchWithRetries(url) {
    let backoff = RETRY_DELAY;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = await fetch(url, {
                headers: {
                    "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) RobloxProxy/2.0`, // Better UA to evade blocks
                    "Cache-Control": "no-cache",
                    "Accept": "application/json"
                }
            });

            console.log(`[proxy] Fetch attempt ${attempt}: Status ${res.status} for ${url}`);

            if (res.status === 429) {
                console.log(`[proxy] 429 detected, backing off ${BACKOFF_ON_429}ms (attempt ${attempt})`);
                await sleep(BACKOFF_ON_429);
                backoff *= 1.5; // Exponential backoff
                continue;
            }

            if (!res.ok) {
                console.log(`[proxy] Non-OK status: ${res.status}`);
                if (attempt < MAX_RETRIES) await sleep(backoff);
                continue;
            }

            const text = await res.text();
            return { status: res.status, body: text };

        } catch (err) {
            console.log(`[proxy] Fetch error attempt ${attempt}:`, err.message);
            if (attempt < MAX_RETRIES) await sleep(backoff);
            backoff *= 1.5;
        }
    }
    return null;
}

exports.handler = async function(event, context) {
    const path = event.path.replace("/.netlify/functions/proxy", "");
    const url = buildRobloxURL(path);

    if (!url) {
        console.log("[proxy] Invalid path:", path);
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Invalid Roblox API path" }),
            headers: { "Content-Type": "application/json" }
        };
    }

    console.log(`[proxy] Incoming request: ${path} → ${url}`);

    // ----- CACHE CHECK -----
    const cacheKey = url; // Use full built URL as key
    const cached = cache[cacheKey];
    if (cached && Date.now() - cached.time < CACHE_TTL) {
        console.log("[proxy] Cache HIT for:", url);
        return {
            statusCode: cached.status,
            body: cached.data,
            headers: { "Content-Type": "application/json" }
        };
    }

    // ----- FETCH WITH RETRIES -----
    const result = await fetchWithRetries(url);
    if (!result) {
        console.error("[proxy] All retries failed for:", url);
        return {
            statusCode: 503,
            body: JSON.stringify({ error: "Roblox API unavailable after retries" }),
            headers: { "Content-Type": "application/json" }
        };
    }

    // Save to cache
    cache[cacheKey] = {
        time: Date.now(),
        data: result.body,
        status: result.status
    };

    console.log(`[proxy] SUCCESS: ${result.status} for ${url} (cached)`);

    return {
        statusCode: result.status,
        body: result.body,
        headers: { "Content-Type": "application/json" }
    };
};
