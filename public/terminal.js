const SYSTEM_PROMPT = `You are Chakshu Jain's portfolio terminal assistant. Respond AS Chakshu in first person — concise, sharp, technically confident. Never robotic. Personality: analytical, dry, self-aware.

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

const termBody = document.getElementById('termBody');
const termInput = document.getElementById('termInput');
let isLoading = false;

const terminalFallbacks = [
  {
    match: /(skill|stack|tech|language)/i,
    reply: "Core stack is Python, TypeScript, Java, SQL, React, Node, Docker, and AWS. I spend most of my time building AI workflows that actually survive contact with production."
  },
  {
    match: /(project|build|working on|made)/i,
    reply: "Sage is my AI analytics platform, AeroDocs is my Java backend project, and AZNext was the agentic workflow engine that cut 15+ hours of manual work each week."
  },
  {
    match: /(automate|automation|ai)/i,
    reply: "I automate high-friction operations: prospect research, personalization, routing, and human-in-the-loop review. The goal is less busywork, better decisions."
  },
  {
    match: /(where|from|location|based)/i,
    reply: "Based in Tempe, Arizona. Originally from India. I like building systems, watching stars, and over-optimizing workflows for fun."
  },
  {
    match: /(contact|email|reach|hire)/i,
    reply: "Best route is email: chakshuvinayjain@gmail.com. If you want to talk live, book me through the calendar link and I will show up prepared."
  }
];

function appendUserLine(t) {
  const d = document.createElement('div');
  d.className = 'term-line';
  d.innerHTML = `<span class="term-prompt">$</span><span class="term-user">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`;
  termBody.appendChild(d);
}

function appendTypingLine() {
  const d = document.createElement('div');
  d.className = 'term-ai-line';
  d.innerHTML = '<span class="typing-cursor"></span>';
  termBody.appendChild(d);
  return d;
}

function appendAiLines(t) {
  t.trim().split('\n').filter((l) => l.trim()).forEach((l) => {
    const d = document.createElement('div');
    d.className = 'term-ai-line';
    d.textContent = l;
    termBody.appendChild(d);
  });
}

function scrollBottom() {
  termBody.scrollTop = termBody.scrollHeight;
}

function localTerminalReply(query) {
  const hit = terminalFallbacks.find((entry) => entry.match.test(query));
  if (hit) return hit.reply;
  return 'I can answer that, but this demo is currently running in local fallback mode. Ask me about skills, projects, automation, location, or contact and I will give you a crisp answer.';
}

async function runQuery(query) {
  if (isLoading || !query.trim()) return;
  isLoading = true;
  termInput.disabled = true;
  appendUserLine(query);
  const typer = appendTypingLine();
  scrollBottom();
  try {
    const res = await fetch('/api/terminal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    if (!res.ok) throw new Error('api_unavailable');
    const data = await res.json();
    const text = data?.reply || data?.text || data?.message;
    typer.remove();
    appendAiLines(text || localTerminalReply(query));
  } catch (e) {
    typer.remove();
    appendAiLines(localTerminalReply(query));
  }
  scrollBottom();
  isLoading = false;
  termInput.disabled = false;
  termInput.focus();
}

termInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const v = termInput.value.trim();
    termInput.value = '';
    runQuery(v);
  }
});
