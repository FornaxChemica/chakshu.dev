# chakshu.dev
My personal portfolio. Live at https://chakshu.dev

Stack: **Next.js 15** (App Router) → **OpenNext** → **Cloudflare Workers**, with D1, R2, Upstash Redis, and Better Auth.

### Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

---

## Architecture

High-level map of how the site is built, deployed, and how each major feature talks to storage and external APIs.

### System overview

```mermaid
flowchart TB
  subgraph Clients
    Browser["Browser"]
    AdminUser["Admin browser<br/>Google OAuth"]
  end

  subgraph GitHub["GitHub"]
    Repo["main branch"]
    GHA["Actions: deploy-cloudflare.yml"]
  end

  subgraph CF["Cloudflare"]
    Worker["Worker: chakshu-next<br/>OpenNext + Next.js 15"]
    Assets["Assets binding<br/>static JS/CSS/images"]
    D1[("D1: chakshu-core-prod<br/>HIKES_DB")]
    R2[("R2: chakshu-assets<br/>HIKES_ASSETS")]
    R2CDN["assets.chakshu.dev"]
  end

  subgraph DataFallbacks["Local / repo fallbacks"]
    HikesJSON["data/hikes.json<br/>data/gpx-data.json"]
    ProjectsJSON["data/projects.json"]
  end

  subgraph External["External services"]
    Upstash[("Upstash Redis<br/>terminal rate limits")]
    Supermemory["Supermemory<br/>profile / course memory"]
    LLMs["LLM providers<br/>Anthropic · OpenAI · Groq · Gemini"]
    Google["Google OAuth"]
    GitHubAPI["GitHub API<br/>public repos"]
    Mapbox["Mapbox GL"]
    LastFM["Last.fm API"]
  end

  Browser --> Worker
  AdminUser --> Worker
  Repo --> GHA --> Worker
  Worker --> Assets
  Worker --> D1
  Worker --> R2
  R2 --> R2CDN
  Worker -.->|dev / missing binding| HikesJSON
  Worker -.->|dev / missing binding| ProjectsJSON
  Worker --> Upstash
  Worker --> Supermemory
  Worker --> LLMs
  Worker --> Google
  Worker --> GitHubAPI
  Browser --> Mapbox
  Browser --> LastFM
  Browser --> R2CDN
```

### Public surfaces → APIs

```mermaid
flowchart LR
  subgraph Pages["App routes"]
    Home["/  homepage<br/>terminal · music teaser · featured projects"]
    Trails["/trails<br/>Mapbox + hike gallery"]
    Projects["/projects<br/>GitHub archive + featured"]
    Admin["/admin<br/>hikes + featured projects CMS"]
    Login["/admin/login"]
  end

  subgraph APIs["Route handlers"]
    TermAPI["POST /api/terminal"]
    AuthAPI["/api/auth/[...all]<br/>Better Auth"]
    AdminHikes["/api/admin/hikes"]
    AdminHikeId["/api/admin/hikes/[id]"]
    AdminProjects["/api/admin/projects"]
  end

  Home --> TermAPI
  Home --> LastFM["Last.fm client-side"]
  Trails --> Mapbox["Mapbox client-side"]
  Trails --> D1orJSON["D1 hikes · else JSON"]
  Projects --> GitHubAPI["GitHub repos"]
  Projects --> Featured["D1 featured_projects · else JSON"]
  Login --> AuthAPI
  Admin --> AuthAPI
  Admin --> AdminHikes
  Admin --> AdminHikeId
  Admin --> AdminProjects
```

### Terminal pipeline

`public/terminal.js` posts to `POST /api/terminal`. Server path is rate-limit → privacy gates → memory → model waterfall → fallbacks.

```mermaid
flowchart TD
  UI["Browser terminal.js"] -->|POST query ≤500 chars| API["/api/terminal"]

  API --> RL{"Rate limit<br/>Upstash → else in-memory"}
  RL -->|429| Cool["reply: cooldown + Retry-After"]
  RL -->|ok| Len{"Length / empty checks"}
  Len -->|too long| Bad["400 short-question reply"]
  Len --> Greet{"Standalone greeting only?<br/>hi / hola / …"}
  Greet -->|yes| GreetReply["Greeting reply"]
  Greet -->|no| Deflect{"Privacy deflection?<br/>address · DOB · salary · …"}
  Deflect -->|yes| DeflectReply["Hardcoded witty reply"]
  Deflect -->|no| SM["Supermemory hybrid search<br/>chunks + memories"]

  SM --> Courses{"Course / class query<br/>+ parseable chunks?"}
  Courses -->|yes| CourseReply["Deterministic class list"]
  Courses -->|no| Prompt["BASE_SYSTEM + memory context"]

  Prompt --> Providers["Provider order<br/>AI_PROVIDER first, then others"]
  Providers --> A["Anthropic"]
  Providers --> O["OpenAI"]
  Providers --> G["Groq"]
  Providers --> Ge["Gemini"]
  G -.->|429 + GROQ_FALLBACK_TO_GEMINI| Ge

  A --> Out["Model reply"]
  O --> Out
  G --> Out
  Ge --> Out
  Out -->|miss| ChunkFB["Chunk / local FALLBACKS"]
  ChunkFB --> UI
  Out --> UI
  CourseReply --> UI
  DeflectReply --> UI
  GreetReply --> UI
  Cool --> UI
  Bad --> UI
```

**Guarantees worth knowing:**
- Queries capped at 500 chars; provider / Supermemory / Upstash fetches time out at ~10s.
- Rate limits: default **8 req / 60s / IP**, then **5 min** block (`RATE_LIMIT_*`). Shared via Upstash when configured.
- Privacy deflections never reach an LLM.
- Client keeps a synced offline fallback copy if the API is down.

### Trails + admin data path

```mermaid
flowchart TB
  subgraph ReadPath["Public read"]
    TrailsPage["/trails"]
    TrailsPage --> Loader["lib/hikes-data"]
    Loader -->|USE_D1_HIKES=1 + binding| D1[(D1 hikes + snapshots)]
    Loader -->|else| JSON["data/hikes.json<br/>data/gpx-data.json"]
    D1 --> Media["Media URLs via<br/>PUBLIC_ASSETS_BASE_URL → R2"]
    JSON --> Media
    TrailsPage --> Map["Mapbox GL map + markers"]
  end

  subgraph WritePath["Admin write"]
    AdminUI["/admin"] --> Auth["Better Auth + Google<br/>ADMIN_EMAIL_ALLOWLIST"]
    Auth --> Post["POST /api/admin/hikes"]
    Post --> GPX["Parse GPX · elevation · stats"]
    Post --> Place["Snapshot placement:<br/>manual → EXIF/ISO6709 → time → neighbors → even"]
    Post --> R2[("R2 HIKES_ASSETS<br/>GPX + photos/video")]
    Post --> D1w[("D1 HIKES_DB")]
  end
```

### Deploy pipeline

```mermaid
flowchart LR
  Push["git push main"] --> GHA["GitHub Actions"]
  GHA --> Build["npm ci<br/>opennextjs-cloudflare build"]
  Build --> Deploy["wrangler deploy<br/>Worker chakshu-next"]
  Secrets["Cloudflare Worker secrets<br/>AI keys · Upstash · OAuth · …"] -.-> Deploy
  BuildSecrets["GHA secrets<br/>CF token · account · NEXT_PUBLIC_MAPBOX_TOKEN"] -.-> GHA
```

Runtime secrets (LLM keys, Upstash, Google OAuth, etc.) live on the **Worker**, not in GitHub Actions — except `NEXT_PUBLIC_MAPBOX_TOKEN`, which is baked in at build time.

---

## Terminal API Setup

The portfolio terminal calls `POST /api/terminal` (`src/app/api/terminal/route.ts`).

### 1. Configure environment variables

Local: `.env.local`. Production: Cloudflare Worker secrets / vars.

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
- Optional: `SUPERMEMORY_API_KEY` for grounded answers (classes, profile facts)

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

To enforce limits across all Worker isolates, connect Upstash Redis:

- `UPSTASH_REDIS_REST_URL` — HTTPS REST URL (not the redis-cli string)
- `UPSTASH_REDIS_REST_TOKEN`

Behavior:

- If Upstash vars are set, the API uses Redis-backed shared rate limiting.
- If Upstash is unavailable at runtime, the API falls back to in-memory limiting so protection still remains.

### 2. Run locally

```bash
npm run dev
```

### 3. Deploy

Deploy via GitHub Actions on `main`, or locally:

```bash
npm run deploy
```

Set the same runtime secrets on the Cloudflare Worker (`npx wrangler secret put …`). The terminal UI calls `/api/terminal` on the deployed Worker automatically.

## Featured Projects + `/projects`

Homepage featured cards are curated in D1 (`featured_projects`) via `/admin` → **projects**.

- Public archive: `/projects` (all public GitHub repos for `FornaxChemica`, searchable/filterable)
- Featured source: D1 when `USE_D1_HIKES=1` + binding available, else `data/projects.json`
- Admin API: `GET`/`PUT` `/api/admin/projects`

### 1. Migrate + seed D1

```bash
npx wrangler d1 execute chakshu-core-prod --remote --file=db/migrations/0002_create_featured_projects.sql
npx wrangler d1 execute chakshu-core-prod --remote --file=db/seed-featured-projects.sql
```

Use the same files with `--local` if you develop against local D1.

### 2. Optional GitHub token

Unauthenticated GitHub API works, but rate limits are low. For production:

```bash
npx wrangler secret put GITHUB_TOKEN
```

Also set `GITHUB_TOKEN` in `.env.local` for local `/projects` fetches.

Match `repo_name` in admin/D1 to the exact GitHub repository name so featured badges join correctly.

Optional `logo_url` overrides the card mark. Otherwise live `homepage`/`homepage_url` uses the site favicon; GitHub-only repos use the GitHub logo.

If `0002` already ran without `logo_url`:

```bash
npx wrangler d1 execute chakshu-core-prod --remote --file=db/migrations/0003_add_featured_project_logo_url.sql
```

## D1 + R2 Trails Data (Cloudflare)

The app supports a dual-source trails loader:

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

### Admin auth (BetterAuth + Google OAuth)

Admin now uses BetterAuth Google sign-in:

- Login page: `/admin/login`
- BetterAuth handler: `/api/auth/[...all]`
- Protected pages/API: `/admin`, `/api/admin/*`

Required env vars:

- `BETTER_AUTH_URL=https://chakshu.dev`
- `BETTER_AUTH_SECRET=<long-random-secret>`
- `GOOGLE_CLIENT_ID=<google-oauth-client-id>`
- `GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>`
- `ADMIN_EMAIL_ALLOWLIST=chakshuvinayjain@gmail.com`

Google OAuth redirect URIs:

- `https://chakshu.dev/api/auth/callback/google`
- `https://www.chakshu.dev/api/auth/callback/google`
- `http://localhost:3000/api/auth/callback/google`
