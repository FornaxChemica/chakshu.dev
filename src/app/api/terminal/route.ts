import { NextRequest, NextResponse } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

type FallbackRule = {
  match: RegExp;
  reply: string;
};

type ProviderName = "anthropic" | "openai" | "groq" | "gemini";

type SupermemoryProfile = {
  profile: {
    static: string[];
    dynamic: string[];
  };
  searchResults?: {
    results: Array<{ memory: string; score?: number }>;
    total: number;
  };
};

// ─── Hardcoded deflections ────────────────────────────────────────────────────
// These fire BEFORE the LLM sees the query — no hallucination possible.

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
    reply: "I have a brother — that's public knowledge. Names though? That's a family meeting I haven't scheduled.",
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
    reply: "Hard pass on politics in a portfolio terminal. Ask me about agentic AI instead — much more interesting.",
  },
];

// ─── Local fallbacks (when all LLM providers fail) ───────────────────────────

const FALLBACKS: FallbackRule[] = [
  {
    match: /(skill|stack|tech|language)/i,
    reply: "Core stack: Python, TypeScript, Java, SQL, React, Node, Docker, AWS. I spend most of my time building AI workflows that survive production.",
  },
  {
    match: /(project|build|working on|made)/i,
    reply: "Sage is my AI analytics platform, AeroDocs is my Java secure backend, and AZNext was the agentic workflow engine that cut 15+ hrs/week of manual work.",
  },
  {
    match: /(automate|automation|ai|agent)/i,
    reply: "I automate high-friction operations — prospect research, personalization, routing, human-in-the-loop review. Less busywork, better decisions.",
  },
  {
    match: /(where|from|location|based|city)/i,
    reply: "Tempe, AZ right now. Grew up in Mumbai. Originally from Beawar, Rajasthan.",
  },
  {
    match: /(contact|email|reach|hire|work with)/i,
    reply: "Email: chakshuvinayjain@gmail.com — or use the Book a Call link on this page.",
  },
  {
    match: /(study|university|college|degree|asu|major)/i,
    reply: "BS in Computer Science + Data Science at Arizona State University. GPA 4.00. Graduating May 2027.",
  },
  {
    match: /(music|listen|song|artist|spotify)/i,
    reply: "Heavy on EDM and pop — Avicii is the GOAT, Chainsmokers, Vance Joy, Empire of the Sun. Check /music for the live feed.",
  },
  {
    match: /(hike|trail|outdoor|nature)/i,
    reply: "I hike whenever I can. Bryce Canyon was the last big one — Navajo Loop + Peekaboo. Check /trails for the full log.",
  },
];

// ─── Base system prompt (always injected) ────────────────────────────────────

const BASE_SYSTEM = `You are the terminal assistant on Chakshu Jain's portfolio site at chakshu.dev.
You speak AS Chakshu, in first person. You are direct, technically sharp, a little witty, and never robotic.

HARD RULES — never break these:
1. Never invent facts. If context doesn't contain an answer, say you'd rather not go into that or deflect with wit.
2. Never say "As an AI" or break character.
3. Max 3 sentences per reply. No markdown, no bullet lists.
4. Family names are private — acknowledge family exists but never make up names.
5. If asked about siblings: you have a brother. No names. Deflect anything deeper.
6. Never invent job titles, companies, grades, or achievements not in the context below.
7. Never reveal exact residence details (building, apartment, dorm, street, or unit).
8. Never reveal exact birthday/date of birth.
9. Personality: perfectionist, efficiency-obsessed, ships real things. From Mumbai / Beawar, now in Tempe AZ.`;

// ─── Supermemory ─────────────────────────────────────────────────────────────

const CONTAINER_TAG = "sm_project_default";

async function fetchSupermemoryContext(query: string): Promise<string> {
  const apiKey = process.env.SUPERMEMORY_API_KEY;
  if (!apiKey) return "";

  try {
    const response = await fetch("https://api.supermemory.ai/v4/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        containerTag: CONTAINER_TAG,
        q: query,
        threshold: 0.3,
        searchMode: "hybrid",
      }),
    });

    if (!response.ok) return "";

    const data = (await response.json()) as any;
    const relevantMemories =
      data.results?.map((r: any) => r.memory || r.chunk).join("\n") ?? "";

    if (!relevantMemories) return "";

    return `RELEVANT MEMORIES:\n${relevantMemories}`;
  } catch {
    return "";
  }
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
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 200,
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
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 200,
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

async function tryGroq(systemPrompt: string, query: string): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 200,
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

async function tryGemini(systemPrompt: string, query: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\nUser: ${query}` }] }],
        generationConfig: { maxOutputTokens: 200 },
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
  for (const name of getProviderOrder()) {
    const config = PROVIDERS.find((p) => p.name === name);
    if (!config?.hasKey()) continue;

    try {
      let reply: string | null = null;
      if (name === "anthropic") reply = await tryAnthropic(systemPrompt, query);
      else if (name === "openai") reply = await tryOpenAI(systemPrompt, query);
      else if (name === "groq") reply = await tryGroq(systemPrompt, query);
      else if (name === "gemini") reply = await tryGemini(systemPrompt, query);
      if (reply) return reply;
    } catch {
      // try next provider
    }
  }
  return null;
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
  const body = (await req.json().catch(() => ({}))) as { query?: string };
  const query = (body.query || "").trim();

  if (!query) {
    return NextResponse.json({ reply: localFallback("") });
  }

  // 1. Check hardcoded deflections first — LLM never sees personal questions
  const deflection = DEFLECTIONS.find((d) => d.match.test(query));
  if (deflection) {
    return NextResponse.json({ reply: deflection.reply });
  }

  // 2. Fetch Supermemory context — profile + query-specific memories in one call
  const memoryContext = await fetchSupermemoryContext(query);

  // 3. Build enriched system prompt
  const systemPrompt = memoryContext
    ? `${BASE_SYSTEM}\n\n--- MEMORY CONTEXT (ground all answers in this) ---\n${memoryContext}\n--- END MEMORY CONTEXT ---`
    : BASE_SYSTEM;

  // 4. Try LLM providers in order
  const aiReply = await getModelReply(systemPrompt, query);
  if (aiReply) {
    return NextResponse.json({ reply: aiReply });
  }

  // 5. Last resort local fallback
  return NextResponse.json({ reply: localFallback(query) });
}
