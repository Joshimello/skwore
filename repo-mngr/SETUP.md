# Repo Manager — Setup Guide

## Prerequisites

- Docker (with the daemon running)
- A Cloudflare account (free) with a domain managed by Cloudflare
- Either a Claude.ai subscription (Pro/Max) or an Anthropic API key

---

## Step 1 — Cloudflare tunnel

Install `cloudflared` if you don't have it:

```bash
# macOS
brew install cloudflared

# Linux
curl -fsSL -o /usr/local/bin/cloudflared \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x /usr/local/bin/cloudflared
```

Log in and create a named tunnel:

```bash
cloudflared tunnel login                          # opens browser, stores cert
cloudflared tunnel create repo-manager-previews   # note the tunnel UUID it prints
```

The credentials file is saved at `~/.cloudflared/<UUID>.json`. Copy it into this directory so it can be baked into the Docker image:

```bash
cp ~/.cloudflared/<UUID>.json ./cloudflared-credentials.json
```

Add a wildcard DNS record in the Cloudflare dashboard (or via CLI):

```bash
cloudflared tunnel route dns repo-manager-previews '*.preview.yourdomain.com'
```

This routes all `*.preview.yourdomain.com` subdomains through the tunnel — you only do this once.

---

## Step 2 — Claude auth

Get your token and set `ANTHROPIC_API_KEY` in `.env` (Step 3).

**API key** — from https://console.anthropic.com

**Claude.ai subscription** (Pro/Max) — run `claude setup-token` on any machine that has Claude Code installed and copy the printed token. No host installation required on the server.

---

## Step 3 — Configure .env

```bash
cp .env.example .env
```

Edit `.env`:

| Variable                 | What to set                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`      | API key (`sk-ant-api03-...`) or subscription token from `claude setup-token`           |
| `CLOUDFLARE_TUNNEL_NAME` | `repo-manager-previews` (or whatever you named it)                                     |
| `PREVIEW_DOMAIN`         | `preview.yourdomain.com`                                                               |
| `WEBHOOK_SECRET`         | Any random secret string — must match `REPO_MANAGER_WEBHOOK_SECRET` in Skwore's `.env` |
| `DATA_DIR`               | `/data/jobs` (or any path that exists on the host)                                     |

---

## Step 4 — Create the data directory

Keep job data inside this folder so nothing spills onto your system:

```bash
mkdir -p data/jobs
```

Then set `DATA_DIR` in your `.env` to the **absolute path** of that folder:

```bash
echo "DATA_DIR=$(pwd)/data/jobs" >> .env
```

> **Why absolute?** Grading containers are spawned as siblings on the host via the Docker socket — their volume paths resolve against the host filesystem, not the repo-mngr container. The path must be identical in both places, so relative paths don't work.

---

## Step 5 — Build the Docker images

```bash
# Grading container (runs Claude Code against student repos)
docker build -t grader-image:latest ./grader

# Repo manager service
docker build -t repo-mngr:latest .
```

The first build takes a few minutes — the grader image downloads Node, Python, and Claude Code CLI.

---

## Step 6 — Run the service

```bash
docker compose up -d
```

`docker-compose.yml` reads `.env` automatically, so `DATA_DIR` and all other config is picked up with no extra flags.

To stop: `docker compose down`

Check it's running:

```bash
docker logs repo-mngr
# should print: repo-mngr listening on :8080
```

---

## Step 7 — Connect to Skwore

In the Skwore project's `.env`, add:

```
REPO_MANAGER_URL=http://localhost:8080
REPO_MANAGER_WEBHOOK_SECRET=<same value as WEBHOOK_SECRET above>
```

If the repo manager is on a different machine, replace `localhost:8080` with its address.

---

## Verify it works

Submit a test job:

```bash
curl -s -X POST http://localhost:8080/jobs \
  -H 'Content-Type: application/json' \
  -d '{
    "submissionId": "test-001",
    "repoUrl": "https://github.com/octocat/Hello-World",
    "criteria": [{"id":"c1","name":"Has README","description":"Repo contains a README file","maxPoints":10}]
  }' | jq .
# → { "jobId": "...", "status": "queued" }
```

Poll until done:

```bash
curl -s http://localhost:8080/jobs/<jobId> | jq '.status, .result.criteria'
```

Start a preview (requires `hasDist: true`):

```bash
curl -s -X POST http://localhost:8080/jobs/<jobId>/preview | jq .
# → { "previewUrl": "https://preview-<jobId>.preview.yourdomain.com" }
```

---

## Rebuilding after changes

```bash
docker compose down
docker build -t repo-mngr:latest .
docker compose up -d
```

If you change the grading prompt or `run.sh`:

```bash
docker build -t grader-image:latest ./grader
```
