import { NextRequest, NextResponse } from "next/server";
import {
  buildProfileContext,
  deterministicCourseReplyFromProfile,
  deterministicHikeReply,
  hikeFallbackSummary,
} from "../../../../lib/terminal-profile";

// ─── Types ────────────────────────────────────────────────────────────────────

type FallbackRule = {
  match: RegExp;
  reply: string;
};

type GreetingRule = {
  match: RegExp;
  reply: string;
};

type ProviderName = "anthropic" | "openai" | "groq" | "gemini";

type RateLimitResult = {
  allowed: boolean;
  retryAfterSec: number;
};

// ─── Limits / timeouts ────────────────────────────────────────────────────────

const MAX_QUERY_LENGTH = 500;
const MAX_REPLY_TOKENS = 400;
const FETCH_TIMEOUT_MS = 10_000;

const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000;
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 8;
const RATE_LIMIT_BLOCK_MS = Number(process.env.RATE_LIMIT_BLOCK_MS) || 300_000;
const RATE_LIMIT_KEY_PREFIX = process.env.RATE_LIMIT_KEY_PREFIX || "terminal_rl";

// ─── Hardcoded deflections ────────────────────────────────────────────────────
// These fire BEFORE the LLM sees the query - no hallucination possible.

const DEFLECTIONS: FallbackRule[] = [
  {
    match: /\b(girlfriend|boyfriend|dating|relationship|partner|love life|romantic)\b/i,
    reply: "My relationship status is: deeply committed to shipping. Next question.",
  },
  {
    match: /\b(address|apartment|apt\.?|unit|building|dorm|residence|residing|live at|where do (you|he) live|where does (he|she) live|location in tempe|exactly where)\b/i,
    reply: "I keep exact residence details private. City-level is fair game: Tempe, AZ.",
  },
  {
    match: /\b(birth\s?date|date of birth|dob|birthday|born on|what day .* born)\b/i,
    reply: "I keep my exact birthday private. Happy to talk projects, classes, or trails.",
  },
  {
    match: /\b(brother|sister|sibling)s?\b.*name|name.*\b(brother|sister|sibling)s?\b/i,
    reply: "I have a brother - that's public knowledge. Names though? That's a family meeting I haven't scheduled.",
  },
  {
    match: /\b(salary|money|earn|income|paid|compensation)\b/i,
    reply: "I optimize for impact over comp at this stage. Ask me about what I build instead.",
  },
  {
    match: /\b(age|how old|birthday|born)\b/i,
    reply: "Old enough to have a 4.0 GPA and ship production AI systems. Young enough to still be in undergrad.",
  },
  {
    match: /\b(religion|faith|god|pray|spiritual)\b/i,
    reply: "I keep that one offline. Happy to talk tech, hikes, or automation though.",
  },
  {
    match: /\b(politic|vote|democrat|republican|election)\b/i,
    reply: "Hard pass on politics in a portfolio terminal. Ask me about agentic AI instead - much more interesting.",
  },
];

// ─── Local fallbacks (when all LLM providers fail) ───────────────────────────

const FALLBACKS: FallbackRule[] = [
  {
    match: /(job|title|role|work at|where do you work|employer)/i,
    reply: "I'm an AI Automation Developer at Executive Education, W. P. Carey School of Business (ASU). Previously Program Coordinator Assistant on AZNext.",
  },
  {
    match: /(skill|stack|tech|language)/i,
    reply: "Core stack: Python, TypeScript, Java, SQL, React, Node, Docker, AWS. Most of my time goes into AI automation, data pipelines, and production web apps.",
  },
  {
    match: /(project|build|working on|made)/i,
    reply: "Current builds include Engagement OS, the Executive Education live program intelligence dashboard, QuantileLedger, WindowLens, Devtize, and chakshu.dev. Older work includes Sage and the AZNext workflow engine. Full public archive is on /projects.",
  },
  {
    match: /(automate|automation|ai|agent)/i,
    reply: "I build AI automation for high-friction operations - outreach workflows, program intelligence dashboards, evaluation platforms, and human-in-the-loop review. Less busywork, better decisions.",
  },
  {
    match: /(where|from|location|based|city)/i,
    reply: "Tempe, AZ right now. Grew up in Mumbai. Originally from Beawar, Rajasthan.",
  },
  {
    match: /(contact|email|reach|hire|work with)/i,
    reply: "Email: chakshuvinayjain@gmail.com - or use the Book a Call link on this page.",
  },
  {
    match: /(study|university|college|degree|asu|major|gpa)/i,
    reply: "BS in Computer Science + Data Science at Arizona State University. GPA 4.00. Graduating May 2027.",
  },
  {
    match: /(devlabs|leadership|finance|treasurer)/i,
    reply: "I'm VP of Finance / Treasurer at DevLabs ASU, managing a ~$50k budget for a 500-member org.",
  },
  {
    match: /(music|listen|song|artist|spotify)/i,
    reply: "Heavy on EDM and pop - Avicii is the GOAT, Chainsmokers, Vance Joy, Empire of the Sun. Check /music for the live feed.",
  },
  {
    match: /(hike|trail|outdoor|nature)/i,
    reply: hikeFallbackSummary(),
  },
];

// Standalone greetings only — "hey where are you from?" must continue the pipeline.
const GREETINGS: GreetingRule[] = [
  { match: /^\s*ol[áa]\s*[!.?]*\s*$/i, reply: "Ola! Tudo certo? Manda sua pergunta que eu respondo rapidinho." },
  { match: /^\s*hola\s*[!.?]*\s*$/i, reply: "Hola! Dime que quieres saber y te respondo con gusto." },
  { match: /^\s*bonjour\s*[!.?]*\s*$/i, reply: "Bonjour! Dis-moi ta question et je te reponds avec plaisir." },
  { match: /^\s*ciao\s*[!.?]*\s*$/i, reply: "Ciao! Dimmi pure cosa vuoi sapere." },
  { match: /^\s*namaste\s*[!.?]*\s*$/i, reply: "Namaste! Pucho jo bhi puchna hai, main yahin hoon." },
  { match: /^\s*(hi|hello|hey)\s*[!.?]*\s*$/i, reply: "Hey! Good to see you here. Ask me anything." },
];

// ─── Base system prompt (always injected) ────────────────────────────────────

const BASE_SYSTEM = `You are the terminal assistant on Chakshu Jain's portfolio site at chakshu.dev.
You speak AS Chakshu, in first person. You are direct, technically sharp, a little witty, and never robotic.

HARD RULES - never break these:
1. Never invent facts. If context doesn't contain an answer, say you'd rather not go into that or deflect with wit.
2. Never say "As an AI" or break character.
3. Max 3 short sentences per reply. No markdown, no bullet lists. Always finish complete sentences — never stop mid-clause or trailing "and"/"or".
4. Family names are private - acknowledge family exists but never make up names.
5. If asked about siblings: you have a brother. No names. Deflect anything deeper.
6. Never invent job titles, companies, grades, or achievements not in the context below.
7. Never reveal exact residence details (building, apartment, dorm, street, or unit).
8. Never reveal exact birthday/date of birth.
9. Personality: perfectionist, efficiency-obsessed, ships real things. From Mumbai / Beawar, now in Tempe AZ.
10. If the user asks for classes/courses, answer from the semester course log. Default to the current semester. Support this/last/next semester and named terms (e.g. Fall 2025). Only list every semester when asked for all. Omit grades unless the user asks for grades (NR means in progress).
11. For greetings/salutations, keep it playful and mirror the user's language when possible.
12. Official current job title is AI Automation Developer at Executive Education (W. P. Carey). Never invent alternate senior titles.
13. Obey every PROHIBITED CLAIMS and INELIGIBLE / DO NOT OVERCLAIM rule in the profile context.`;

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

type MemoryBucket = {
  count: number;
  windowStart: number;
  blockedUntil: number;
};

const memoryBuckets = new Map<string, MemoryBucket>();

function getClientIp(req: NextRequest): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "unknown";
}

function checkMemoryRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  const key = `${RATE_LIMIT_KEY_PREFIX}:${ip}`;
  let bucket = memoryBuckets.get(key);

  if (!bucket) {
    bucket = { count: 0, windowStart: now, blockedUntil: 0 };
    memoryBuckets.set(key, bucket);
  }

  if (bucket.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1000)),
    };
  }

  if (bucket.blockedUntil > 0 && bucket.blockedUntil <= now) {
    bucket.blockedUntil = 0;
    bucket.count = 0;
    bucket.windowStart = now;
  }

  if (now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    bucket.count = 0;
    bucket.windowStart = now;
  }

  bucket.count += 1;

  if (bucket.count > RATE_LIMIT_MAX_REQUESTS) {
    bucket.blockedUntil = now + RATE_LIMIT_BLOCK_MS;
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil(RATE_LIMIT_BLOCK_MS / 1000)),
    };
  }

  return { allowed: true, retryAfterSec: 0 };
}

async function upstashCommand(commands: unknown[][]): Promise<Array<{ result?: unknown }> | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const response = await fetchWithTimeout(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Array<{ result?: unknown }>;
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

async function checkUpstashRateLimit(ip: string): Promise<RateLimitResult | null> {
  const windowKey = `${RATE_LIMIT_KEY_PREFIX}:${ip}:win`;
  const blockKey = `${RATE_LIMIT_KEY_PREFIX}:${ip}:block`;
  const windowSec = Math.max(1, Math.ceil(RATE_LIMIT_WINDOW_MS / 1000));
  const blockSec = Math.max(1, Math.ceil(RATE_LIMIT_BLOCK_MS / 1000));

  const blocked = await upstashCommand([["GET", blockKey]]);
  if (!blocked) return null;

  const blockVal = blocked[0]?.result;
  if (typeof blockVal === "string" && blockVal) {
    const blockedUntil = Number(blockVal);
    if (Number.isFinite(blockedUntil) && blockedUntil > Date.now()) {
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000)),
      };
    }
  }

  const counted = await upstashCommand([["INCR", windowKey]]);
  if (!counted) return null;

  const count = Number(counted[0]?.result) || 0;
  if (count === 1) {
    await upstashCommand([["EXPIRE", windowKey, windowSec]]);
  }

  if (count > RATE_LIMIT_MAX_REQUESTS) {
    const blockedUntil = Date.now() + RATE_LIMIT_BLOCK_MS;
    await upstashCommand([
      ["SET", blockKey, String(blockedUntil)],
      ["EXPIRE", blockKey, blockSec],
    ]);
    return { allowed: false, retryAfterSec: blockSec };
  }

  return { allowed: true, retryAfterSec: 0 };
}

async function enforceRateLimit(req: NextRequest): Promise<RateLimitResult> {
  const ip = getClientIp(req);
  const shared = await checkUpstashRateLimit(ip);
  if (shared) return shared;
  return checkMemoryRateLimit(ip);
}

function rateLimitedResponse(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error: "rate_limited", reply: "Easy — terminal cooldown. Try again in a bit." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    }
  );
}

// ─── Provider helpers ─────────────────────────────────────────────────────────

function extractFirstText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;

  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === "object" && "text" in item) {
        const text = extractFirstText((item as { text?: unknown }).text);
        if (text) return text;
      }
    }
  }

  if (value && typeof value === "object") {
    for (const key of ["content", "parts", "message"] as const) {
      if (key in value) {
        const text = extractFirstText((value as Record<string, unknown>)[key]);
        if (text) return text;
      }
    }
  }

  return null;
}

async function tryAnthropic(systemPrompt: string, query: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
  const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_REPLY_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: query }],
    }),
  });

  if (!response.ok) return null;
  return extractFirstText(await response.json()) || null;
}

async function tryOpenAI(systemPrompt: string, query: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_REPLY_TOKENS,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
    }),
  });

  if (!response.ok) return null;
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  return extractFirstText(data.choices?.[0]?.message?.content) || null;
}

async function tryGroq(systemPrompt: string, query: string): Promise<{ reply: string | null; rateLimited: boolean }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { reply: null, rateLimited: false };

  const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
  const response = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_REPLY_TOKENS,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
    }),
  });

  if (response.status === 429) return { reply: null, rateLimited: true };
  if (!response.ok) return { reply: null, rateLimited: false };

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  return { reply: extractFirstText(data.choices?.[0]?.message?.content) || null, rateLimited: false };
}

async function tryGemini(systemPrompt: string, query: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\nUser: ${query}` }] }],
        generationConfig: { maxOutputTokens: MAX_REPLY_TOKENS },
      }),
    }
  );

  if (!response.ok) return null;
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
  };
  return extractFirstText(data.candidates?.[0]?.content?.parts) || null;
}

// ─── Provider orchestration ───────────────────────────────────────────────────

type ProviderConfig = {
  name: ProviderName;
  hasKey: () => boolean;
};

const PROVIDERS: ProviderConfig[] = [
  { name: "anthropic", hasKey: () => Boolean(process.env.ANTHROPIC_API_KEY) },
  { name: "openai", hasKey: () => Boolean(process.env.OPENAI_API_KEY) },
  { name: "groq", hasKey: () => Boolean(process.env.GROQ_API_KEY) },
  { name: "gemini", hasKey: () => Boolean(process.env.GEMINI_API_KEY) },
];

function getProviderOrder(): ProviderName[] {
  const preferred = process.env.AI_PROVIDER?.toLowerCase() as ProviderName | undefined;
  const all = PROVIDERS.map((p) => p.name);
  if (preferred && all.includes(preferred)) {
    return [preferred, ...all.filter((p) => p !== preferred)];
  }
  return all;
}

async function getModelReply(systemPrompt: string, query: string): Promise<string | null> {
  const order = getProviderOrder();
  const groqFallbackToGemini =
    process.env.GROQ_FALLBACK_TO_GEMINI === "true" || process.env.GROQ_FALLBACK_TO_GEMINI === "1";

  for (const name of order) {
    const config = PROVIDERS.find((p) => p.name === name);
    if (!config?.hasKey()) continue;

    try {
      if (name === "anthropic") {
        const reply = await tryAnthropic(systemPrompt, query);
        if (reply) return reply;
        continue;
      }

      if (name === "openai") {
        const reply = await tryOpenAI(systemPrompt, query);
        if (reply) return reply;
        continue;
      }

      if (name === "groq") {
        const { reply, rateLimited } = await tryGroq(systemPrompt, query);
        if (reply) return reply;
        if (rateLimited && groqFallbackToGemini && process.env.GEMINI_API_KEY) {
          const geminiReply = await tryGemini(systemPrompt, query);
          if (geminiReply) return geminiReply;
        }
        continue;
      }

      if (name === "gemini") {
        const reply = await tryGemini(systemPrompt, query);
        if (reply) return reply;
      }
    } catch {
      // try next provider
    }
  }
  return null;
}

/** If the model hit the token cap mid-thought, keep only complete sentences. */
function finalizeReply(text: string): string {
  let t = text.trim();
  if (!t) return t;

  // Already ends cleanly
  if (/[.!?…]"?$/.test(t)) return t;

  const lastStop = Math.max(t.lastIndexOf("."), t.lastIndexOf("!"), t.lastIndexOf("?"));
  if (lastStop > 40) {
    return t.slice(0, lastStop + 1).trim();
  }

  // No sentence boundary — drop dangling connectors
  t = t.replace(/\s+(and|or|but|with|to|for|of|the|a|an)\s*$/i, "").trim();
  if (t && !/[.!?]$/.test(t)) t = `${t}.`;
  return t;
}

// ─── Local fallback ───────────────────────────────────────────────────────────
function localFallback(query: string): string {
  return (
    FALLBACKS.find((r) => r.match.test(query))?.reply ??
    "Running in offline mode. Ask me about skills, projects, stack, or where I'm based."
  );
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req);
  if (!limited.allowed) {
    return rateLimitedResponse(limited.retryAfterSec);
  }

  const body = (await req.json().catch(() => ({}))) as { query?: string };
  const query = (body.query || "").trim();

  if (!query) {
    return NextResponse.json({ reply: localFallback("") });
  }

  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json(
      { reply: `Keep it under ${MAX_QUERY_LENGTH} characters — shorter questions get sharper answers.` },
      { status: 400 }
    );
  }

  const greeting = GREETINGS.find((g) => g.match.test(query));
  if (greeting) {
    return NextResponse.json({ reply: greeting.reply });
  }

  // 1. Check hardcoded deflections first - LLM never sees personal questions
  const deflection = DEFLECTIONS.find((d) => d.match.test(query));
  if (deflection) {
    return NextResponse.json({ reply: deflection.reply });
  }

  // 2. Ground on verified local profile (Supermemory paused)
  const profileContext = buildProfileContext(query);

  const deterministicClasses = deterministicCourseReplyFromProfile(
    query,
    profileContext.educationTexts
  );
  if (deterministicClasses) {
    return NextResponse.json({ reply: deterministicClasses });
  }

  const deterministicHikes = deterministicHikeReply(query);
  if (deterministicHikes) {
    return NextResponse.json({ reply: deterministicHikes });
  }

  // 3. Build enriched system prompt from profile facts + hike data + claim rules
  const systemPrompt = profileContext.context
    ? `${BASE_SYSTEM}\n\n--- PROFILE CONTEXT (ground all answers in this) ---\n${profileContext.context}\n--- END PROFILE CONTEXT ---`
    : BASE_SYSTEM;

  // 4. Try LLM providers in order
  const aiReply = await getModelReply(systemPrompt, query);
  if (aiReply) {
    return NextResponse.json({ reply: finalizeReply(aiReply) });
  }

  // 5. Last resort local fallback
  return NextResponse.json({ reply: localFallback(query) });
}
