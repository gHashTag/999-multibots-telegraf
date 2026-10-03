#!/usr/bin/env bash
# Самодостаточная проверка ВСЕХ функций через mock: поднять → 84 проверки → убить.
#
# Лучшая практика: тест не зависит от внешнего состояния — сам поднимает mock на
# отдельном порту, гоняет mock-test.py и гасит сервер (trap на EXIT). Падает
# ГРОМКО (код возврата python пробрасывается), без `|| true`. Быстро (~5с),
# ничего не тратит. Ставится в lefthook pre-push.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# A free port of its own unless one is asked for. A fixed 3399 meant every run
# killed whatever held it first, so two pushes from two worktrees killed each
# other's server and both failed "did not come up" (2026-10-03).
if [ -n "${MOCK_SELFCHECK_PORT:-}" ]; then
  PORT="$MOCK_SELFCHECK_PORT"
  kill "$(lsof -ti:"$PORT" 2>/dev/null)" 2>/dev/null || true
else
  PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')"
fi
LOG="/tmp/mock-selfcheck.$PORT.log"
# Seconds to wait for the server. A deadline, not a count: a healthy start
# still returns in ~2 s, but 16 s was too short for tsx on a loaded Mac.
WAIT_S="${MOCK_SELFCHECK_WAIT_S:-120}"
( cd "$HERE" && MOCK_PORT="$PORT" npx tsx mock-server.ts >"$LOG" 2>&1 ) &
# Гасим ПО ПОРТУ, а не по PID подоболочки: tsx порождает node-ребёнка, и kill
# PID обёртки оставил бы сервер висеть на порту (проверено).
trap 'kill "$(lsof -ti:"$PORT" 2>/dev/null)" 2>/dev/null || true' EXIT

up=""
deadline=$(( $(date +%s) + WAIT_S ))
while [ "$(date +%s)" -lt "$deadline" ]; do
  if curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1; then up=1; break; fi
  sleep 0.4
done
if [ -z "$up" ]; then
  echo "mock-selfcheck: сервер не поднялся на :$PORT за ${WAIT_S} с"; tail -5 "$LOG"; exit 1
fi

MOCK_BASE="http://localhost:$PORT" python3 "$HERE/mock-test.py"
