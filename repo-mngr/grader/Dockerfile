FROM node:22-bookworm

# Install system deps: git, python3, build tools
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    python3-pip \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install bun system-wide (student projects may use it)
RUN curl -fsSL https://bun.sh/install | bash && \
    ln -s /root/.bun/bin/bun /usr/local/bin/bun

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user — required so --dangerously-skip-permissions is accepted
RUN useradd -m -s /bin/bash developer

# Bake in the grading prompt
COPY prompt.txt /prompt.txt

# Grading entrypoint
COPY run.sh /run.sh
RUN chmod +x /run.sh

USER developer
WORKDIR /home/developer

# Bake in Claude Code settings (bypassPermissions so --dangerously-skip-permissions works)
RUN mkdir -p /home/developer/.claude
COPY --chown=developer:developer settings.json /home/developer/.claude/settings.json
