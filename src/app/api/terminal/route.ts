import { NextRequest, NextResponse } from "next/server";

type FallbackRule = {
  match: RegExp;
  reply: string;
};

type ProviderName = "anthropic" | "openai" | "groq" | "gemini";

const SYSTEM_PROMPT = `You are Chakshu Jain's portfolio terminal assistant.
Keep responses concise, practical, and in first person as Chakshu.
Focus on experience, projects, stack, automation work, and contact.
Do not invent achievements.`;

const FALLBACKS: FallbackRule[] = [
  {
    match: /(skill|stack|tech|language)/i,
    reply:
      "Core stack is Python, TypeScript, Java, SQL, React, Node, Docker, and AWS. I spend most of my time building AI workflows that survive production constraints.",
  },
  {
    match: /(project|build|working on|made)/i,
    reply:
      "Sage is my AI analytics platform, AeroDocs is my Java backend project, and AZNext was the agentic workflow engine that cut 15+ hours of manual work each week.",
  },
  {
    match: /(automate|automation|ai)/i,
    reply:
      "I automate high-friction operations: prospect research, personalization, routing, and human-in-the-loop review. The goal is less busywork with better decisions.",
  },
  {
    match: /(where|from|location|based)/i,
    reply:
      "Based in Tempe, Arizona. Originally from India. I like building systems, watching stars, and over-optimizing workflows for fun.",
  },
  {
    match: /(contact|email|reach|hire)/i,
    reply:
      "Best route is email: chakshuvinayjain@gmail.com. You can also use the booking link on the site to schedule a call.",
  },
];

const AI_PROVIDER = process.env.AI_PROVIDER?.toLowerCase() as ProviderName | undefined;

function hasProviderKey(provider: ProviderName): boolean {
  switch (provider) {
    case "anthropic":
      return Boolean(process.env.ANTHROPIC_API_KEY);
    case "openai":
      return Boolean(process.env.OPENAI_API_KEY);
    case "groq":
      return Boolean(process.env.GROQ_API_KEY);
    case "gemini":
      return Boolean(process.env.GEMINI_API_KEY);
  }
}

function getProviderOrder(): ProviderName[] {
  const configured = AI_PROVIDER && ["anthropic", "openai", "groq", "gemini"].includes(AI_PROVIDER)
    ? [AI_PROVIDER]
    : [];

  const fallbackOrder: ProviderName[] = ["anthropic", "openai", "groq", "gemini"];
  return [...configured, ...fallbackOrder.filter((provider) => provider !== configured[0])];
}

function localFallback(query: string): string {
  return (
    FALLBACKS.find((entry) => entry.match.test(query))?.reply ||
    "I'm running in local fallback mode right now. Ask me about skills, projects, automation, location, or contact."
  );
}

function extractFirstText(value: unknown): string | null {
  if (typeof value === "string") {
    const text = value.trim();
    return text || null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === "object" && "text" in item) {
        const text = extractFirstText((item as { text?: unknown }).text);
        if (text) {
          return text;
        }
      }
    }
  }

  if (value && typeof value === "object") {
    if ("content" in value) {
      const text = extractFirstText((value as { content?: unknown }).content);
      if (text) return text;
    }
    if ("parts" in value) {
      const text = extractFirstText((value as { parts?: unknown }).parts);
      if (text) return text;
    }
    if ("message" in value) {
      const text = extractFirstText((value as { message?: unknown }).message);
      if (text) return text;
    }
  }

  return null;
}

async function tryAnthropic(query: string): Promise<string | null> {
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
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: query }],
    }),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as unknown;
  return extractFirstText(data) || null;
}

async function tryOpenAI(query: string): Promise<string | null> {
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
        { role: "system", content: SYSTEM_PROMPT },
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

async function tryGroq(query: string): Promise<string | null> {
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
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: query },
      ],
    }),
  });

  if (response.status === 429 && process.env.GROQ_FALLBACK_TO_GEMINI === "true") {
    const geminiReply = await tryGemini(query);
    if (geminiReply) return geminiReply;
  }

  if (!response.ok) return null;

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };

  return extractFirstText(data.choices?.[0]?.message?.content) || null;
}

async function tryGemini(query: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\nUser: ${query}` }] }],
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

async function getModelReply(query: string): Promise<string | null> {
  const providers = getProviderOrder();

  for (const provider of providers) {
    if (!hasProviderKey(provider)) {
      continue;
    }

    try {
      if (provider === "anthropic") {
        const reply = await tryAnthropic(query);
        if (reply) return reply;
      }

      if (provider === "openai") {
        const reply = await tryOpenAI(query);
        if (reply) return reply;
      }

      if (provider === "groq") {
        const reply = await tryGroq(query);
        if (reply) return reply;
      }

      if (provider === "gemini") {
        const reply = await tryGemini(query);
        if (reply) return reply;
      }
    } catch {
      // Try the next configured provider.
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { query?: string };
  const query = (body.query || "").trim();

  if (!query) {
    return NextResponse.json({ reply: localFallback("") });
  }

  const aiReply = await getModelReply(query);
  if (aiReply) {
    return NextResponse.json({ reply: aiReply });
  }

  return NextResponse.json({ reply: localFallback(query) });
}
