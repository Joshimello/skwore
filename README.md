# Skwore

A grading tool for TAs. Create rubrics, submit student repos for AI grading, and record scores.

## Stack

- **SvelteKit 2** (Svelte 5 runes) + Tailwind CSS 4 + shadcn-svelte
- **BetterAuth** + Google OAuth
- **Drizzle ORM** + [Neon](https://neon.tech) (Postgres)
- **repo-mngr** — Go microservice that clones student repos and runs the AI grader in Docker

---

## Prerequisites

- [Bun](https://bun.sh) — JavaScript runtime/package manager
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- A [Neon](https://neon.tech) Postgres database (free tier works)
- A Google OAuth app ([console.cloud.google.com](https://console.cloud.google.com))
- A Claude Code OAuth token (`claude setup-token`)

---

## Setup

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `ORIGIN` | App base URL, e.g. `http://localhost:5173` |
| `BETTER_AUTH_SECRET` | Random 32-char secret — `openssl rand -hex 16` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth app credentials |
| `ALLOWED_EMAILS` | Comma-separated list of TA emails permitted to sign in |
| `ADMIN_EMAILS` | Comma-separated list of admin emails (auto-promoted on first login) |
| `REPO_MANAGER_URL` | URL of the repo-mngr service, e.g. `http://localhost:8080` |
| `REPO_MANAGER_WEBHOOK_SECRET` | Shared secret for webhook HMAC verification |
| `WEBHOOK_BASE_URL` | URL repo-mngr uses to call back into Skwore — use `http://host.docker.internal:5173` on macOS/Windows |

**Google OAuth setup:**
1. Create a project at [console.cloud.google.com](https://console.cloud.google.com)
2. Enable the Google+ API (or People API)
3. Create OAuth credentials → Web application
4. Add `http://localhost:5173/api/auth/callback/google` as an authorized redirect URI

### 3. Push the database schema

```bash
bun run db:push
```

Select "create table" for each new table, then "Yes" to confirm.

### 4. Set up repo-mngr

```bash
cd repo-mngr
cp .env.example .env
```

Fill in `repo-mngr/.env`:

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Claude Code OAuth token — run `claude setup-token` to generate |
| `DOCKER_IMAGE` | Grader image name, default `grader-image:latest` |
| `WEBHOOK_SECRET` | Same value as `REPO_MANAGER_WEBHOOK_SECRET` in the main `.env` |
| `DATA_DIR` | Absolute path for job working dirs, e.g. `/absolute/path/to/repo-mngr/data/jobs` |

### 5. Build the grader image

```bash
docker build -t grader-image:latest ./repo-mngr/grader
```

### 6. Start repo-mngr

```bash
docker build -t repo-mngr:latest ./repo-mngr
docker compose -f repo-mngr/docker-compose.yml up -d
```

### 7. Start the dev server

```bash
bun dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## How it works

1. **Admin** creates courses and assigns TAs
2. **TAs** create assignments with rubric criteria (manually or via AI extraction from a PDF/text)
3. TAs submit a student's GitLab repo URL on the grading page
4. **repo-mngr** clones the repo and runs the grader Docker container, which uses Claude Code to evaluate the code against the rubric
5. Results are saved and TAs can adjust scores before finalising

---

## Development commands

```bash
bun dev              # start dev server
bun run build        # production build
bun run check        # svelte-check type checking
bun run db:push      # push schema changes to Neon
bun run db:studio    # open Drizzle Studio to inspect the DB
bun run auth:schema  # regenerate auth.schema.ts from BetterAuth config
```
