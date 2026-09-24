#!/bin/bash
# tri reach PATH [METHOD] -- does the shared auth guard let an unsigned call
# through to this render route? (render auth.ts isPublic)
#
# Why it exists: a handler tested directly never meets the guard. Twice a
# route was written, tested and deployed, and answered 401 before its handler
# ran -- pair/start, /api/navigation, and on 2026-09-24 the acceptance
# verdicts and the traffic counter. Ask this before shipping any route a page
# calls with a bare fetch.
#
#   tri reach /api/traffic/arrival POST     # public
#   tri reach /api/agents/acceptance        # GET by default
#   tri reach /api/agents/acceptance POST   # guarded
set -u
ROOT="${1:?repo root required}"
shift
P="${1:-}"
M="${2:-GET}"
case "$P" in /*) ;; *) echo "usage: tri reach /path [GET|POST|PUT|DELETE]"; exit 2 ;; esac
M=$(printf '%s' "$M" | tr '[:lower:]' '[:upper:]')
case "$M" in GET|POST|PUT|DELETE|PATCH) ;; *) echo "method must be GET, POST, PUT, PATCH or DELETE"; exit 2 ;; esac

cd "$ROOT/apps/vibee-editor/render" || exit 2
REACH_PATH="$P" REACH_METHOD="$M" npx --no-install tsx -e '
const { isPublic } = require("./auth")
const p = process.env.REACH_PATH, m = process.env.REACH_METHOD
const open = isPublic({ url: p, method: m })
console.log(open
  ? `${m} ${p}: PUBLIC -- the guard lets it through; the handler decides who`
  : `${m} ${p}: GUARDED -- needs X-Api-Key, X-Agent-Key or Telegram initData; a bare fetch gets 401`)
' 2>&1 | grep -v ExperimentalWarning
