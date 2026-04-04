"use client";

import { useState } from "react";

type TerminalState = {
  query: string;
  response: string;
  loading: boolean;
  error: string;
};

const LOCAL_FALLBACK: Record<string, string> = {
  experience:
    "I currently build AI automation systems at EECPLL, and previously led AZNext's agentic workflow project.",
  projects:
    "Top builds: Sage (LLM analytics), AeroDocs (Java backend), and AZNext workflow engine.",
  stack:
    "Python, TypeScript, Java, React, Node.js, SQL, AWS, Docker, and LLM APIs.",
  contact: "Reach me at chakshuvinayjain@gmail.com"
};

function localReply(input: string): string {
  const lower = input.toLowerCase();
  if (lower.includes("experience")) return LOCAL_FALLBACK.experience;
  if (lower.includes("project")) return LOCAL_FALLBACK.projects;
  if (lower.includes("stack") || lower.includes("tech")) return LOCAL_FALLBACK.stack;
  if (lower.includes("contact") || lower.includes("email")) return LOCAL_FALLBACK.contact;
  return "Ask me about experience, projects, stack, or contact.";
}

export default function TerminalWidget() {
  const [state, setState] = useState<TerminalState>({
    query: "",
    response: "Type a question and press Enter.",
    loading: false,
    error: ""
  });

  async function submitQuery(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const query = state.query.trim();
    if (!query || state.loading) return;

    setState((prev) => ({ ...prev, loading: true, error: "" }));

    try {
      const res = await fetch("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });

      const data = (await res.json().catch(() => ({}))) as {
        reply?: string;
        error?: string;
      };

      if (!res.ok || !data.reply) {
        throw new Error(data.error || `request_failed_${res.status}`);
      }

      setState((prev) => ({
        ...prev,
        query: "",
        loading: false,
        response: data.reply || ""
      }));
    } catch {
      setState((prev) => ({
        ...prev,
        query: "",
        loading: false,
        error: "API unavailable. Using local fallback.",
        response: localReply(query)
      }));
    }
  }

  return (
    <section className="terminal-card">
      <p className="eyebrow">terminal</p>
      <h2>Ask Me Directly</h2>
      <form onSubmit={submitQuery} className="terminal-form">
        <input
          value={state.query}
          onChange={(e) => setState((prev) => ({ ...prev, query: e.target.value }))}
          placeholder="ask about projects, stack, or work"
          maxLength={500}
          aria-label="Ask terminal question"
        />
        <button type="submit" disabled={state.loading}>
          {state.loading ? "thinking..." : "run"}
        </button>
      </form>
      <pre className="terminal-output">{state.response}</pre>
      {state.error ? <p className="terminal-error">{state.error}</p> : null}
    </section>
  );
}
