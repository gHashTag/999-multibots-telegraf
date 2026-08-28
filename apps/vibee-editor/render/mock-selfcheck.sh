#!/usr/bin/env bash
# Самодостаточная проверка ВСЕХ функций через mock: поднять → 84 проверки → убить.
#
# Лучшая практика: тест не зависит от внешнего состояния — сам поднимает mock на
# отдельном порту, гоняет mock-test.py и гасит сервер (trap на EXIT). Падает
# ГРОМКО (код возврата python пробрасывается), без `|| true`. Быстро (~5с),
# ничего не тратит. Ставится в lefthook pre-push.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PORT="${MOCK_SELFCHECK_PORT:-3399}"

kill "$(lsof -ti:"$PORT" 2>/dev/null)" 2>/dev/null || true
( cd "$HERE" && MOCK_PORT="$PORT" npx tsx mock-server.ts >/tmp/mock-selfcheck.log 2>&1 ) &
# Гасим ПО ПОРТУ, а не по PID подоболочки: tsx порождает node-ребёнка, и kill
# PID обёртки оставил бы сервер висеть на порту (проверено).
trap 'kill "$(lsof -ti:"$PORT" 2>/dev/null)" 2>/dev/null || true' EXIT

up=""
for _ in $(seq 1 40); do
  if curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1; then up=1; break; fi
  sleep 0.4
done
if [ -z "$up" ]; then
  echo "mock-selfcheck: сервер не поднялся на :$PORT"; tail -5 /tmp/mock-selfcheck.log; exit 1
fi

MOCK_BASE="http://localhost:$PORT" python3 "$HERE/mock-test.py"
