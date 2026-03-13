FROM golang:1.22-bookworm AS builder
WORKDIR /app
COPY . .
RUN go build -o repo-mngr .

FROM debian:bookworm-slim

# Install runtime deps
RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    ca-certificates \
    docker.io \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Install serve for static file previews
RUN bun install -g serve

# Install cloudflared
RUN curl -fsSL -o /usr/local/bin/cloudflared \
    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
    && chmod +x /usr/local/bin/cloudflared

# Cloudflare tunnel credentials (copy from ~/.cloudflared/<UUID>.json before building)
# See SETUP.md Step 1
COPY cloudflared-credentials.json /etc/cloudflared/tunnel.json

COPY --from=builder /app/repo-mngr /usr/local/bin/repo-mngr

EXPOSE 8080
CMD ["repo-mngr"]
