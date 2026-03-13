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

**Stack**: SvelteKit 2 (Svelte 5 runes), BetterAuth + GitHub OAuth, Drizzle ORM, Neon (Postgres), Tailwind CSS 4, shadcn-svelte, sveltekit-superforms, svelte-sonner.

### Database

- Schema: `src/lib/server/db/schema.ts` — exports `course`, `courseTA`, `assignment`, `rubricCriterion`, `submission`, `submissionGrade`, `criterionScore` tables plus re-exports BetterAuth tables (`user`, `session`, `account`, `verification`) from `auth.schema.ts`
- DB client: `src/lib/server/db/index.ts` (Drizzle + Neon HTTP)
- Auth schema (`auth.schema.ts`) is auto-generated — do not edit manually; run `bun run auth:schema` to regenerate
- PKs use `nanoid()` via `$defaultFn`; BetterAuth tables use text PKs

**Schema relationships**:
- `course` → `courseTA` (many TAs per course, composite PK) → `user`
- `course` → `assignment` → `rubricCriterion` (ordered list of point-weighted criteria)
- `assignment` → `submission` (unique on `(assignmentId, studentId)`) → `submissionGrade` (one-to-one) → `criterionScore` (one per criterion, unique on `(gradeId, criterionId)`)

**Roles**: `user.role` is `'ta'` (default) or `'admin'`. Admin emails are bootstrapped via `ADMIN_EMAILS` env var in `hooks.server.ts`.

### Auth & Access Control

- BetterAuth configured in `src/lib/server/auth.ts` with GitHub OAuth
- `src/hooks.server.ts` sets `event.locals.user` and `event.locals.session` for all requests
- Root `src/routes/+layout.server.ts` guards all routes: redirects unauthenticated → `/login`, checks user email against `ALLOWED_EMAILS` env var (comma-separated), errors 403 if not in list
- `/login` and `/api/auth` paths bypass the guard

### Route Structure

```
/                                                   — course list (home)
/login                                              — GitHub OAuth login page
/courses/new                                        — create course (admin only)
/courses/[courseId]/                                — course overview
/courses/[courseId]/settings                        — manage TAs (admin only)
/courses/[courseId]/assignments                     — list assignments with rubric summary
/courses/[courseId]/assignments/new                 — create assignment + rubric
/courses/[courseId]/assignments/[assignmentId]      — edit assignment + rubric
/grade/[assignmentId]                               — flat shareable grading form (planned)
/courses/[courseId]/export                          — CSV export (planned)
```

Layout hierarchy: root `+layout.server.ts` guards auth + loads sidebar courses. `courses/[courseId]/+layout.server.ts` checks course access and loads `course` + `assignments` for all sub-routes.

The `/grade/[assignmentId]` route is intentionally flat (not nested under `/courses/`) for short, shareable URLs that TAs can bookmark.

### Forms

All forms use **sveltekit-superforms** with **Zod v4**. Use `zod4` adapter (not `zod`) on the server and `zod4Client` (not `zodClient`) on the client:

```ts
// server
import { zod4 as zod } from 'sveltekit-superforms/adapters';
// client
import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
```

### UI Components

Pre-installed shadcn-svelte components live in `src/lib/components/ui/`. Use them directly — do not reinstall or scaffold new ones without checking there first. Sidebar navigation uses the `child` snippet pattern to render `<a>` tags:

```svelte
<Sidebar.MenuButton isActive={...}>
  {#snippet child({ props })}
    <a href={...} {...props}>...</a>
  {/snippet}
</Sidebar.MenuButton>
```

### Environment Variables

Required in `.env`:
- `DATABASE_URL` — Neon connection string
- `BETTER_AUTH_SECRET` — random secret for BetterAuth
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — GitHub OAuth app credentials
- `ORIGIN` — app base URL (e.g. `http://localhost:5173`)
- `ALLOWED_EMAILS` — comma-separated list of permitted TA emails
- `ADMIN_EMAILS` — comma-separated list of admin emails (auto-promoted to `role='admin'` on login)
