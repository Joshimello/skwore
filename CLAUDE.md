# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun dev              # start dev server
bun run build        # production build
bun run check        # svelte-check type checking (run after edits to catch TS/Svelte errors)
bun run db:push      # push schema changes to Neon (interactive — select "create table" for new tables, "Yes" to confirm)
bun run db:studio    # open Drizzle Studio to inspect DB
bun run auth:schema  # regenerate src/lib/server/db/auth.schema.ts from BetterAuth config
```

Always use `bun` (not npm/pnpm/yarn).

## Architecture

**Stack**: SvelteKit 2 (Svelte 5 runes), BetterAuth + Google OAuth, Drizzle ORM, Neon (Postgres), Tailwind CSS 4, shadcn-svelte, sveltekit-superforms, svelte-sonner.

### Two-service architecture

Skwore consists of two services:

1. **Skwore** (`/`) — the SvelteKit app. Handles auth, course/assignment management, grading UI, and proxies grading jobs to repo-mngr.
2. **repo-mngr** (`/repo-mngr/`) — a Go HTTP microservice that clones student repos, runs the AI grader in Docker, and calls back via webhook. Also handles the AI rubric extraction endpoint (`POST /extract-criteria`).

### Database

- Schema: `src/lib/server/db/schema.ts` — exports `course`, `courseTA`, `assignment`, `rubricCriterion`, `submission`, `submissionGrade`, `criterionScore` tables plus re-exports BetterAuth tables from `auth.schema.ts`
- DB client: `src/lib/server/db/index.ts` (Drizzle + Neon HTTP)
- `auth.schema.ts` is auto-generated — do not edit manually; run `bun run auth:schema` to regenerate
- PKs use `nanoid()` via `$defaultFn`; BetterAuth tables use text PKs

**Schema relationships**:
- `course` → `courseTA` (many TAs per course, composite PK) → `user`
- `course` → `assignment` → `rubricCriterion` (ordered, point-weighted)
- `assignment` → `submission` (unique on `assignmentId, studentId`) → `submissionGrade` (one-to-one) → `criterionScore` (one per criterion)

**Roles**: `user.role` is `'ta'` (default) or `'admin'`. Admins are bootstrapped via `ADMIN_EMAILS` env var in `hooks.server.ts`.

### Auth & Access Control

- BetterAuth in `src/lib/server/auth.ts` with Google OAuth
- `src/hooks.server.ts` sets `locals.user` / `locals.session` and bootstraps admin role
- Root `src/routes/+layout.server.ts` guards all routes: redirects unauthenticated → `/login`, checks email against `ALLOWED_EMAILS`, errors 403 if not in list
- `/login` and `/api/auth` bypass the guard
- Per-course access is checked in `src/routes/courses/[courseId]/+layout.server.ts` via `src/lib/server/access.ts`

### Route Structure

```
/                                               — course list
/login                                          — Google OAuth login
/courses/new                                    — create course (admin only)
/courses/[courseId]/                            — course overview + submission entry
/courses/[courseId]/settings                    — manage TAs (admin only)
/courses/[courseId]/assignments                 — list assignments
/courses/[courseId]/assignments/new             — create assignment + rubric
/courses/[courseId]/assignments/[assignmentId]  — edit assignment + rubric
/courses/[courseId]/assignments/[assignmentId]/submissions — submission list
/grade/[assignmentId]                           — flat shareable grading form (short URL for TAs)
/api/extract-criteria                           — auth-guarded proxy → repo-mngr /extract-criteria
/api/grade-data, /api/job-log, /api/repo-manager — other repo-mngr proxies
```

The `/grade/[assignmentId]` route is intentionally flat (not nested under `/courses/`) for shareable bookmarkable URLs.

### Forms

All forms use **sveltekit-superforms** with **Zod v4**. Always use the `zod4` / `zod4Client` adapters — not the plain `zod` / `zodClient` ones:

```ts
// server
import { zod4 as zod } from 'sveltekit-superforms/adapters';
// client
import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
```

### UI Components

Pre-installed shadcn-svelte components live in `src/lib/components/ui/`. Check there before installing new ones. Sidebar nav uses the `child` snippet pattern for `<a>` tags:

```svelte
<Sidebar.MenuButton isActive={...}>
  {#snippet child({ props })}
    <a href={...} {...props}>...</a>
  {/snippet}
</Sidebar.MenuButton>
```

### AI Rubric Extraction

`POST /api/extract-criteria` (Skwore) proxies to `POST /extract-criteria` (repo-mngr). repo-mngr spawns the grader Docker container and runs `claude --dangerously-skip-permissions --print --max-turns 20 "<prompt>"` to extract criteria from the uploaded PDF or pasted text. The response is `{ criteria: [{name, description, points}] }`.

The grader Docker image (`repo-mngr/grader/`) must be built separately:
```bash
docker build -t grader-image:latest ./repo-mngr/grader
```

repo-mngr also runs in Docker (`docker compose -f repo-mngr/docker-compose.yml up -d`). Its `DATA_DIR` must be the same absolute path on the host and inside the container (it spawns sibling Docker containers that need to mount that path).

### Environment Variables

Skwore `.env`:
- `DATABASE_URL` — Neon connection string
- `BETTER_AUTH_SECRET` — random secret
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth credentials
- `ORIGIN` — app base URL
- `ALLOWED_EMAILS` / `ADMIN_EMAILS` — comma-separated
- `REPO_MANAGER_URL` — e.g. `http://localhost:8080`
- `REPO_MANAGER_WEBHOOK_SECRET` / `WEBHOOK_BASE_URL` — for webhook callbacks from repo-mngr

repo-mngr `.env`:
- `ANTHROPIC_API_KEY` — Claude Code OAuth token (`claude setup-token`)
- `DOCKER_IMAGE` — grader image name, default `grader-image:latest`
- `WEBHOOK_SECRET` — must match `REPO_MANAGER_WEBHOOK_SECRET`
- `DATA_DIR` — absolute path, same on host and in container
