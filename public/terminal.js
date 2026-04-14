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

let termBody = null;
let termInput = null;
let termSendBtn = null;
let hasTerminal = false;
let hasTerminalBindings = false;
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
  if (!termBody) return;
  const d = document.createElement('div');
  d.className = 'term-line';
  d.innerHTML = `<span class="term-prompt">$</span><span class="term-user">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`;
  termBody.appendChild(d);
}

function appendTypingLine() {
  if (!termBody) return null;
  const d = document.createElement('div');
  d.className = 'term-ai-line';
  d.innerHTML = '<span class="typing-cursor"></span>';
  termBody.appendChild(d);
  return d;
}

function appendAiLines(t) {
  if (!termBody) return;
  t.trim().split('\n').filter((l) => l.trim()).forEach((l) => {
    const d = document.createElement('div');
    d.className = 'term-ai-line';
    d.textContent = l;
    termBody.appendChild(d);
  });
}

function scrollBottom() {
  if (!termBody) return;
  termBody.scrollTop = termBody.scrollHeight;
}

function localTerminalReply(query) {
  const hit = terminalFallbacks.find((entry) => entry.match.test(query));
  if (hit) return hit.reply;
  return 'I can answer that, but this demo is currently running in local fallback mode. Ask me about skills, projects, automation, location, or contact and I will give you a crisp answer.';
}

function setInputControlsDisabled(disabled) {
  if (!termInput || !termSendBtn) return;
  termInput.disabled = disabled;
  termSendBtn.disabled = disabled;
  termSendBtn.classList.toggle('is-loading', disabled);
  termSendBtn.setAttribute('aria-busy', disabled ? 'true' : 'false');
}

function updateSendButtonState() {
  if (!termInput || !termSendBtn) return;
  const hasValue = termInput.value.trim().length > 0;
  termSendBtn.disabled = isLoading || !hasValue;
}

async function runQuery(query) {
  if (!hasTerminal || !termInput || !termSendBtn || isLoading || !query.trim()) return;
  isLoading = true;
  setInputControlsDisabled(true);
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
    if (typer) typer.remove();
    appendAiLines(text || localTerminalReply(query));
  } catch (e) {
    if (typer) typer.remove();
    appendAiLines(localTerminalReply(query));
  }
  scrollBottom();
  isLoading = false;
  setInputControlsDisabled(false);
  updateSendButtonState();
  termInput.focus();
}

function submitFromInput() {
  if (!termInput) return;
  const v = termInput.value.trim();
  termInput.value = '';
  updateSendButtonState();
  runQuery(v);
}

function initTerminal() {
  if (hasTerminalBindings) return;
  termBody = document.getElementById('termBody');
  termInput = document.getElementById('termInput');
  termSendBtn = document.getElementById('termSendBtn');
  hasTerminal = Boolean(termBody && termInput && termSendBtn);
  if (!hasTerminal || !termInput || !termSendBtn) return;

  hasTerminalBindings = true;
  updateSendButtonState();
  termInput.addEventListener('input', updateSendButtonState);
  termInput.addEventListener('change', updateSendButtonState);
  termInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      submitFromInput();
    }
  });

  termSendBtn.addEventListener('pointerup', (event) => {
    event.preventDefault();
    submitFromInput();
  });
}

initTerminal();
window.addEventListener('DOMContentLoaded', initTerminal, { once: true });
window.addEventListener('load', initTerminal, { once: true });
