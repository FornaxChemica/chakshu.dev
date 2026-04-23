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

## D1 + R2 Trails Data (Cloudflare)

The app now supports a dual-source trails loader:

- Primary: Cloudflare D1 table data (`HIKES_DB` binding)
- Fallback: local `data/hikes.json` + `data/gpx-data.json`

So local/dev still works even before D1 is fully configured.

### 1. Create D1 database

```bash
npx wrangler d1 create chakshu-hikes
```

Copy the returned `database_id`, then uncomment/update `d1_databases` in `wrangler.jsonc` with:

- `binding`: `HIKES_DB`
- `database_name`: `chakshu-hikes`
- `database_id`: your real ID

### 2. Apply schema

```bash
npx wrangler d1 execute chakshu-hikes --file=db/migrations/0001_create_hikes_tables.sql
```

### 3. Generate seed SQL from current JSON

```bash
npm run d1:seed:generate
```

This writes `db/seed.sql`.

### 4. Seed D1

```bash
npx wrangler d1 execute chakshu-hikes --file=db/seed.sql
```

### 5. R2 asset base URL (optional but recommended)

When your R2 custom domain is ready (for example `https://assets.chakshu.dev`), set:

- `PUBLIC_ASSETS_BASE_URL` in `wrangler.jsonc` (non-secret)

or set env-specific vars in Cloudflare dashboard.

This lets D1 store relative object paths while the app serves full asset URLs.

### 6. Enable D1 reads in app runtime

Set:

- `USE_D1_HIKES=1`

Keep it `0` until D1 binding + seed are complete.

## Admin Upload Flow (`/admin`)

The repo includes a private admin uploader that lets you publish hikes without editing JSON files in git:

- Route: `/admin`
- API: `POST /api/admin/hikes`
- Uploads GPX + photos to R2
- Writes hike + snapshot records to D1
- Computes GPX geometry/elevation/profile and trail stats
- Placement priority:
  1. manual `at`
  2. manual `lat/lon`
  3. embedded GPS metadata (JPEG EXIF + QuickTime ISO6709 videos)
  4. timestamp interpolation
  5. neighbor interpolation
  6. even distribution fallback
- Spreads media with identical placement so stacked files at one spot remain clickable

### Required Cloudflare bindings

In `wrangler.jsonc`, set:

- D1 binding: `HIKES_DB` -> `chakshu-core-prod`
- R2 binding: `HIKES_ASSETS` -> `chakshu-assets`
- Optional var: `PUBLIC_ASSETS_BASE_URL=https://assets.chakshu.dev`

### Admin auth (Cloudflare Access + Google)

Protect both paths with Cloudflare Access:

- `chakshu.dev/admin*`
- `chakshu.dev/api/admin/*`

Policy recommendation:

- Login method: Google
- Include rule: your Google email only

Also set allowlist env:

- `ADMIN_EMAIL_ALLOWLIST=chakshuvinayjain@gmail.com`
