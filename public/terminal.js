let termBody = null;
let termInput = null;
let termSendBtn = null;
let hasTerminal = false;
let hasTerminalBindings = false;
let isLoading = false;
let lastSubmitAt = 0;

// Keep in sync with FALLBACKS in src/app/api/terminal/route.ts
const terminalFallbacks = [
  {
    match: /(job|title|role|work at|where do you work|employer)/i,
    reply: "I'm an AI Automation Developer at Executive Education, W. P. Carey School of Business (ASU). Previously Program Coordinator Assistant on AZNext."
  },
  {
    match: /(skill|stack|tech|language)/i,
    reply: "Core stack: Python, TypeScript, Java, SQL, React, Node, Docker, AWS. Most of my time goes into AI automation, data pipelines, and production web apps."
  },
  {
    match: /(project|build|working on|made)/i,
    reply: "Current builds include Engagement OS, the Executive Education live program intelligence dashboard, QuantileLedger, WindowLens, Devtize, and chakshu.dev. Older work includes Sage and the AZNext workflow engine. Full public archive is on /projects."
  },
  {
    match: /(automate|automation|ai|agent)/i,
    reply: "I build AI automation for high-friction operations - outreach workflows, program intelligence dashboards, evaluation platforms, and human-in-the-loop review. Less busywork, better decisions."
  },
  {
    match: /(where|from|location|based|city)/i,
    reply: "Tempe, AZ right now. Grew up in Mumbai. Originally from Beawar, Rajasthan."
  },
  {
    match: /(contact|email|reach|hire|work with)/i,
    reply: "Email: chakshuvinayjain@gmail.com - or use the Book a Call link on this page."
  },
  {
    match: /(study|university|college|degree|asu|major|gpa)/i,
    reply: "BS in Computer Science + Data Science at Arizona State University. GPA 4.00. Graduating May 2027."
  },
  {
    match: /(devlabs|leadership|finance|treasurer)/i,
    reply: "I'm VP of Finance / Treasurer at DevLabs ASU, managing a ~$50k budget for a 500-member org."
  },
  {
    match: /(music|listen|song|artist|spotify)/i,
    reply: "Heavy on EDM and pop - Avicii is the GOAT, Chainsmokers, Vance Joy, Empire of the Sun. Check /music for the live feed."
  },
  {
    match: /(hike|trail|outdoor|nature)/i,
    reply: "I log hikes on this site — Navajo Loop + Peekaboo, Bell Trail, Zion Narrows, Camelback, plus more. Highlight: Navajo Loop + Peekaboo in Bryce Canyon NP. Full map + photos on /trails."
  }
];

function appendUserLine(t) {
  if (!termBody) return;
  const d = document.createElement('div');
  d.className = 'term-line';
  const prompt = document.createElement('span');
  prompt.className = 'term-prompt';
  prompt.textContent = '$';
  const user = document.createElement('span');
  user.className = 'term-user';
  user.textContent = t;
  d.appendChild(prompt);
  d.appendChild(user);
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
  return "Running in offline mode. Ask me about skills, projects, stack, or where I'm based.";
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const res = await fetch('/api/terminal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const data = await res.json().catch(() => ({}));
    const text = data?.reply || data?.text || data?.message;

    if (typer) typer.remove();

    if (res.status === 429) {
      appendAiLines(text || 'Easy — terminal cooldown. Try again in a bit.');
    } else if (res.status === 400 && text) {
      appendAiLines(text);
    } else if (!res.ok) {
      appendAiLines(localTerminalReply(query));
    } else {
      appendAiLines(text || localTerminalReply(query));
    }
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

function handleSendPress(event) {
  if (event) event.preventDefault();
  const now = Date.now();
  if (now - lastSubmitAt < 250) return;
  lastSubmitAt = now;
  submitFromInput();
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

  termSendBtn.addEventListener('pointerup', handleSendPress);
  termSendBtn.addEventListener('click', handleSendPress);
  termSendBtn.addEventListener('touchend', handleSendPress, { passive: false });
}

initTerminal();
window.addEventListener('DOMContentLoaded', initTerminal, { once: true });
window.addEventListener('load', initTerminal, { once: true });
