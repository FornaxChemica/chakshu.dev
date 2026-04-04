const SYSTEM_PROMPT = `You are Chakshu Jain's portfolio terminal assistant. Respond AS Chakshu in first person - concise, sharp, technically confident. Never robotic. Personality: analytical, dry, self-aware.

Key facts:
- CS + Data Science double major at ASU, GPA 4.00, graduating May 2027
- AI Automation Developer at EECPLL (W. P. Carey): building AI outreach system with human-in-the-loop review, prompt engineering, multi-step automation
- Former Technical Lead at AZNext (W. P. Carey): Python agentic AI state-machine, saved 15+ hrs/week. Grant ended.
- VP of Finance at DevLabs ASU: $50k budget, 500 members
- Projects: Sage (AI analytics, React/Node/LLM), AeroDocs (Java secure backend), AZNext workflow engine
- Stack: Python, Java, TypeScript, React, Node.js, SQL, AWS, Docker, OpenAI/Claude APIs
- Location: Tempe AZ. Originally from India. Hobbies: astronomy, outdoors, competitive programming
- Email: chakshuvinayjain@gmail.com

Rules: 2-4 lines max. No markdown. No bullet lists. Be a little witty on personal questions. Never say "As an AI".`;

const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 8);
const RATE_LIMIT_BLOCK_MS = Number(process.env.RATE_LIMIT_BLOCK_MS || 300000);
const RATE_LIMIT_KEY_PREFIX = process.env.RATE_LIMIT_KEY_PREFIX || "terminal_rl";
const GROQ_FALLBACK_TO_GEMINI = String(process.env.GROQ_FALLBACK_TO_GEMINI || "true").toLowerCase() === "true";

const globalRateStore = globalThis.__terminalRateStore || new Map();
globalThis.__terminalRateStore = globalRateStore;

const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function sendJson(res, statusCode, payload) {
  res.status(statusCode).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function readQueryFromBody(req) {
  if (!req.body) return "";
  if (typeof req.body === "string") {
    try {
      const parsed = JSON.parse(req.body);
      return String(parsed.query || "").trim();
    } catch {
      return "";
    }
  }
  if (typeof req.body === "object") {
    return String(req.body.query || "").trim();
  }
  return "";
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) {
    return realIp.trim();
  }

  const remote = req.socket?.remoteAddress || "unknown";
  return String(remote);
}

function hasSharedRateStore() {
  return !!(UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN);
}

async function upstashCommand(command) {
  const response = await fetch(UPSTASH_REDIS_REST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`
    },
    body: JSON.stringify({ command })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    const details = data?.error || `upstash_http_${response.status}`;
    throw new Error(String(details));
  }

  return data?.result;
}

function applyRateLimit(req) {
  const now = Date.now();
  const ip = getClientIp(req);
  const key = `ip:${ip}`;

  const existing = globalRateStore.get(key);

  if (existing && existing.blockedUntil && now < existing.blockedUntil) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((existing.blockedUntil - now) / 1000)
    };
  }

  let entry = existing;
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    entry = {
      count: 0,
      windowStart: now,
      blockedUntil: 0
    };
  }

  entry.count += 1;

  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    entry.blockedUntil = now + RATE_LIMIT_BLOCK_MS;
    globalRateStore.set(key, entry);
    return {
      allowed: false,
      retryAfterSec: Math.ceil(RATE_LIMIT_BLOCK_MS / 1000)
    };
  }

  globalRateStore.set(key, entry);

  if (globalRateStore.size > 5000) {
    for (const [storeKey, value] of globalRateStore) {
      if (!value || now - value.windowStart > RATE_LIMIT_WINDOW_MS + RATE_LIMIT_BLOCK_MS) {
        globalRateStore.delete(storeKey);
      }
    }
  }

  return {
    allowed: true,
    remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - entry.count)
  };
}

async function applySharedRateLimit(req) {
  const ip = getClientIp(req);
  const now = Date.now();
  const windowId = Math.floor(now / RATE_LIMIT_WINDOW_MS);
  const blockedKey = `${RATE_LIMIT_KEY_PREFIX}:blocked:${ip}`;
  const countKey = `${RATE_LIMIT_KEY_PREFIX}:count:${ip}:${windowId}`;

  const blocked = await upstashCommand(["GET", blockedKey]);
  if (blocked) {
    const pttl = Number(await upstashCommand(["PTTL", blockedKey]));
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil(Math.max(0, pttl) / 1000))
    };
  }

  const count = Number(await upstashCommand(["INCR", countKey]));
  if (count === 1) {
    await upstashCommand(["PEXPIRE", countKey, String(RATE_LIMIT_WINDOW_MS)]);
  }

  if (count > RATE_LIMIT_MAX_REQUESTS) {
    await upstashCommand(["SET", blockedKey, "1", "PX", String(RATE_LIMIT_BLOCK_MS)]);
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil(RATE_LIMIT_BLOCK_MS / 1000))
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - count)
  };
}

async function applyRateLimitSafe(req) {
  if (hasSharedRateStore()) {
    try {
      return await applySharedRateLimit(req);
    } catch {
      return applyRateLimit(req);
    }
  }

  return applyRateLimit(req);
}

async function callAnthropic(query) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("missing_anthropic_key");

  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 220,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: query }]
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = data?.error?.message || `anthropic_http_${response.status}`;
    throw new Error(details);
  }

  const text = data?.content?.[0]?.text;
  if (!text) throw new Error("anthropic_empty_reply");
  return text;
}

function providerHttpError(provider, status, details) {
  const error = new Error(details || `${provider}_http_${status}`);
  error.provider = provider;
  error.status = status;
  return error;
}

async function callGroq(query) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("missing_groq_key");

  const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      max_tokens: 220,
      temperature: 0.5,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: query }
      ]
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = data?.error?.message || `groq_http_${response.status}`;
    throw providerHttpError("groq", response.status, details);
  }

  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("groq_empty_reply");
  return text;
}

async function callGemini(query) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("missing_gemini_key");

  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: `${SYSTEM_PROMPT}\n\nUser: ${query}` }]
        }
      ],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 220
      }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = data?.error?.message || `gemini_http_${response.status}`;
    throw providerHttpError("gemini", response.status, details);
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("gemini_empty_reply");
  return text;
}

async function callOpenAI(query) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("missing_openai_key");

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.5,
      max_tokens: 220,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: query }
      ]
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = data?.error?.message || `openai_http_${response.status}`;
    throw new Error(details);
  }

  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("openai_empty_reply");
  return text;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "method_not_allowed" });
  }

  const query = readQueryFromBody(req);
  if (!query) {
    return sendJson(res, 400, { error: "missing_query" });
  }

  if (query.length > 500) {
    return sendJson(res, 400, { error: "query_too_long" });
  }

  const limit = await applyRateLimitSafe(req);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec || 60));
    return sendJson(res, 429, {
      error: "rate_limited",
      details: "Too many requests. Please try again later."
    });
  }

  const provider = (process.env.AI_PROVIDER || "anthropic").toLowerCase();

  try {
    let reply;
    if (provider === "groq") {
      try {
        reply = await callGroq(query);
      } catch (error) {
        const isRateLimited = typeof error === "object" && error && error.status === 429;
        if (!isRateLimited || !GROQ_FALLBACK_TO_GEMINI) {
          throw error;
        }
        reply = await callGemini(query);
      }
    } else if (provider === "gemini") {
      reply = await callGemini(query);
    } else if (provider === "openai") {
      reply = await callOpenAI(query);
    } else {
      reply = await callAnthropic(query);
    }

    return sendJson(res, 200, { reply: String(reply).trim() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return sendJson(res, 502, { error: "upstream_failed", details: message });
  }
}
