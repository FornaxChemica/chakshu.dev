# chakshu.dev
My personal portfolio. Live at https://chakshu.dev

## Next.js Migration Status

This repository is now running on Next.js 14 App Router with TypeScript and Tailwind.

- New app routes: `/` and `/music`
- New terminal API route: `app/api/terminal/route.ts`
- Legacy static snapshots are still present (`index.html`, `music/index.html`) during migration

### Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Terminal API Setup

The portfolio terminal calls `POST /api/terminal`.

The primary implementation is now the Next.js Route Handler in `app/api/terminal/route.ts`.

### 1. Configure environment variables

Configure `.env` and fill keys:

- `AI_PROVIDER=anthropic`, `openai`, `groq`, or `gemini`
- If using Anthropic:
	- `ANTHROPIC_API_KEY`
	- Optional: `ANTHROPIC_MODEL` (default: `claude-sonnet-4-20250514`)
- If using OpenAI:
	- `OPENAI_API_KEY`
	- Optional: `OPENAI_MODEL` (default: `gpt-4o-mini`)
- If using Groq:
	- `GROQ_API_KEY`
	- Optional: `GROQ_MODEL` (default: `llama-3.1-8b-instant`)
	- Optional: `GROQ_FALLBACK_TO_GEMINI=true`
- If using Gemini:
	- `GEMINI_API_KEY`
	- Optional: `GEMINI_MODEL` (default: `gemini-1.5-flash`)

Groq fallback behavior:

- When `AI_PROVIDER=groq`, the API tries Groq first.
- If Groq responds with HTTP 429 and `GROQ_FALLBACK_TO_GEMINI=true`, it automatically retries with Gemini.
- On the next request, it tries Groq first again.

### Rate limiting

The endpoint enforces IP-based limits before calling the model provider.

- `RATE_LIMIT_WINDOW_MS` (default: `60000`)
- `RATE_LIMIT_MAX_REQUESTS` (default: `8`)
- `RATE_LIMIT_BLOCK_MS` (default: `300000`)
- `RATE_LIMIT_KEY_PREFIX` (default: `terminal_rl`)

If a client exceeds the limit, the API returns `429 rate_limited` with a `Retry-After` header.

### Shared global limits (recommended)

To enforce limits across all serverless instances/regions, connect Upstash Redis:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Behavior:

- If Upstash vars are set, the API uses Redis-backed shared rate limiting.
- If Upstash is unavailable at runtime, the API falls back to in-memory limiting so protection still remains.

### 2. Run locally

```bash
npm run dev
```

### 3. Deploy

Deploy on Vercel and set the same environment variables in Project Settings.

The terminal UI will automatically call your deployed `/api/terminal` route.
