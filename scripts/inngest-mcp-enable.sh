#!/usr/bin/env bash
# Resolve INNGEST_SIGNING_KEY without printing it and wire the inngest-prod MCP
# proxy (src/inngest_app/mcp-rest-proxy.ts) into the current agent session.
#
#   source scripts/inngest-mcp-enable.sh            # export the key into this shell
#   scripts/inngest-mcp-enable.sh --claude          # also register the stdio server in Claude Code
#   scripts/inngest-mcp-enable.sh --check           # only report where the key was found
#
# Lookup order: process env -> ./.env (restored by the owner from Infisical).
# No CLI or API is called to fetch the key: Railway is the owner's surface only.
# The value is never echoed; only its source, length and sha256 prefix are.

_inngest_mcp_resolve() {
  local src=""
  if [ -n "${INNGEST_SIGNING_KEY:-}" ]; then
    src="env"
  elif [ -f .env ] && grep -q '^INNGEST_SIGNING_KEY=' .env; then
    INNGEST_SIGNING_KEY="$(grep '^INNGEST_SIGNING_KEY=' .env | tail -n1 | cut -d= -f2- | tr -d "\"'")"
    src=".env"
  fi
  if [ -z "${INNGEST_SIGNING_KEY:-}" ]; then
    echo "inngest-mcp-enable: INNGEST_SIGNING_KEY not found (env, .env)." >&2
    echo "  Ask the owner to export it (Railway -> service inngest/inngest -> Variables) or to restore .env; do not fetch it yourself." >&2
    return 1
  fi
  export INNGEST_SIGNING_KEY
  export INNGEST_BASE_URL="${INNGEST_BASE_URL:-https://inngestinngest-production-c468.up.railway.app}"
  local fp
  fp="$(printf '%s' "$INNGEST_SIGNING_KEY" | shasum -a 256 2>/dev/null | cut -c1-8)"
  echo "inngest-mcp-enable: key from ${src}, len=${#INNGEST_SIGNING_KEY}, sha256[0:8]=${fp}, base=${INNGEST_BASE_URL}"
}

_inngest_mcp_resolve || { [ "${BASH_SOURCE[0]}" != "$0" ] && return 1 || exit 1; }

case "${1:-}" in
  --check) ;;
  --claude)
    if command -v claude >/dev/null 2>&1; then
      claude mcp remove inngest-prod >/dev/null 2>&1 || true
      claude mcp add inngest-prod -e INNGEST_SIGNING_KEY="$INNGEST_SIGNING_KEY" -e INNGEST_BASE_URL="$INNGEST_BASE_URL" \
        -- npx tsx src/inngest_app/mcp-rest-proxy.ts
      echo "inngest-mcp-enable: registered MCP server inngest-prod (stdio)."
    else
      echo "inngest-mcp-enable: claude CLI not found; .mcp.json in the repo root already declares inngest-prod." >&2
    fi
    ;;
  *) ;;
esac
