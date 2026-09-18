#!/usr/bin/env bash
# Boots the production build on a free port, runs the smoke suite, cleans up.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -f .next/standalone/server.js ]; then
  echo "No production build found. Run: npm run build" >&2
  exit 1
fi

PORT="${PORT:-$(node -e 'const n=require("net");const s=n.createServer();s.listen(0,()=>{console.log(s.address().port);s.close()})')}"
BASE="http://127.0.0.1:${PORT}"

# The standalone output does not copy static assets; the real deployment does
# this in the Dockerfile.
cp -r public .next/standalone/ 2>/dev/null || true
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/ 2>/dev/null || true

( cd .next/standalone && PORT="$PORT" HOSTNAME=127.0.0.1 NEXTAUTH_URL="$BASE" node server.js > /tmp/smoke-server.log 2>&1 & echo $! > /tmp/smoke-server.pid )
SERVER_PID="$(cat /tmp/smoke-server.pid)"
cleanup() { kill "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT

for _ in $(seq 1 45); do
  sleep 1
  if curl -sf -o /dev/null "$BASE/robots.txt"; then break; fi
done

if ! curl -sf -o /dev/null "$BASE/robots.txt"; then
  echo "Server failed to start on $PORT:" >&2
  tail -20 /tmp/smoke-server.log >&2
  exit 1
fi

BASE_URL="$BASE" node scripts/smoke.mjs
