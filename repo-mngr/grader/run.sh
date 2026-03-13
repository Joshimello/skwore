#!/usr/bin/env bash
set -euo pipefail

export CRITERIA_B64="${1:?Usage: run.sh <criteria_base64>}"
mkdir -p /out

python3 << 'EOF'
import os, base64, json, re, subprocess, shutil

criteria_b64 = os.environ["CRITERIA_B64"]
criteria_json = base64.b64decode(criteria_b64).decode("utf-8")

with open("/prompt.txt") as f:
    prompt = f.read().replace("{{criteria_json}}", criteria_json)

proc = subprocess.run(
    ["claude", "--dangerously-skip-permissions", "--print", "--max-turns", "20", prompt],
    capture_output=True,
    text=True,
)
output = (proc.stdout or "") + (proc.stderr or "")

with open("/out/claude.log", "w") as f:
    f.write(output)

# Find the last well-formed criteria JSON block in Claude's output
matches = re.findall(r'\{"criteria"\s*:\s*\[.*?\]\}', output, re.DOTALL)
criteria = []
for m in reversed(matches):
    try:
        criteria = json.loads(m).get("criteria", [])
        break
    except json.JSONDecodeError:
        continue

with open("/out/result.json", "w") as f:
    json.dump({"criteria": criteria, "log": output}, f)

# Copy build artifact to /out/dist if present
for dirname in ["dist", "build", "public", "output"]:
    src = f"/repo/{dirname}"
    if os.path.isdir(src) and os.listdir(src):
        shutil.copytree(src, "/out/dist", dirs_exist_ok=True)
        break
EOF
