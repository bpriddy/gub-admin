#!/usr/bin/env bash
# Dev launcher for gub-admin.
# Validates env + DB, then exec's `npm run dev` on port 3001.
#
# Runnable standalone: ./scripts/dev.sh
# Also invoked by the multi-repo orchestrator at ../stack.sh.
#
# Note: gub-admin shares the gub_dev database with GUB. It expects GUB to
# be running at http://localhost:3000 for live data access.

set -u
set -o pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

PORT=3001
ENV_FILE=".env.local"

# ── Node 20 via nvm ───────────────────────────────────────────────────────
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
  nvm use 20 >/dev/null 2>&1 || { echo "Node 20 not installed. Run: nvm install 20" >&2; exit 1; }
fi

# ── Env file ──────────────────────────────────────────────────────────────
[ -f "$ENV_FILE" ] || { echo "$ENV_FILE missing in $REPO_DIR (copy from .env.local.example)" >&2; exit 1; }

# ── DB probe (Postgres.app macOS permission gotcha) ──────────────────────
DB_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"')
[ -n "$DB_URL" ] || { echo "DATABASE_URL missing from $ENV_FILE" >&2; exit 1; }

if ! out=$(psql "$DB_URL" -Atc 'SELECT 1' 2>&1); then
  echo "DB connect failed:" >&2
  echo "$out" >&2
  if printf '%s' "$out" | grep -q 'Postgres.app'; then
    echo "" >&2
    echo "Postgres.app is blocking this shell. Fix:" >&2
    echo "  Postgres.app → Preferences → Permissions → add Terminal/iTerm/zsh" >&2
    echo "Then restart Postgres.app and re-run." >&2
  fi
  exit 1
fi

# ── Port check ────────────────────────────────────────────────────────────
if lsof -iTCP:"$PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  echo "Port $PORT already in use (needed for gub-admin)" >&2
  exit 1
fi

exec npm run dev
