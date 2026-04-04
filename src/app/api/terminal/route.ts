import { NextRequest, NextResponse } from "next/server";

type FallbackRule = {
  match: RegExp;
  reply: string;
};

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

function localFallback(query: string): string {
  return (
    FALLBACKS.find((entry) => entry.match.test(query))?.reply ||
    "Ask me about skills, projects, automation, location, or contact."
  );
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { query?: string };
  const query = (body.query || "").trim();

  if (!query) {
    return NextResponse.json({ reply: localFallback("") });
  }

  if (process.env.GROQ_API_KEY) {
    try {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama3-8b-8192",
          max_tokens: 200,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: query },
          ],
        }),
      });

      if (groqRes.ok) {
        const data = (await groqRes.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const reply = data.choices?.[0]?.message?.content?.trim();
        if (reply) {
          return NextResponse.json({ reply });
        }
      }
    } catch {
      // Fall through to secondary provider and local fallback.
    }
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\nUser: ${query}` }] }],
            generationConfig: { maxOutputTokens: 200 },
          }),
        }
      );

      if (geminiRes.ok) {
        const data = (await geminiRes.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (reply) {
          return NextResponse.json({ reply });
        }
      }
    } catch {
      // Fall through to local fallback.
    }
  }

  return NextResponse.json({ reply: localFallback(query) });
}
