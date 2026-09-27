#!/bin/bash
# tri pod -- здоров ли удалённый браузер И С КАКИХ ПОР.
#
# Три дня в сентябре под отвечал на /json/version безупречно, а Runtime.evaluate
# в нём таймаутился, — и после починки никто не мог сказать, когда это началось:
# каждая проверка печатала строку и забывала её. Рендер теперь ведёт одну запись
# (src/browser/watch.ts), эта команда её читает. Она НИЧЕГО не перезапускает:
# перезапуск живёт в раунде, и два будильника на один под воевали бы.
#
#   tri pod          # строкой: жив, с каких пор, сколько подряд не отвечал
#   tri pod --json   # как есть, чтобы сравнивать в цикле
set -u
ROOT="${1:?repo root required}"
shift
cd "$ROOT" || exit 1

KEY="${AGENT_KEY:-}"
if [ -z "$KEY" ]; then
  KEY=$( (railway variables --service vibee-render --kv 2>/dev/null) \
         | grep -E '^AGENT_KEYS=' | cut -d= -f2- | cut -d, -f1 | cut -d: -f1 )
fi
[ -n "$KEY" ] || { echo "нет ключа агента: export AGENT_KEY или railway login"; exit 2; }
BASE="${RENDER_BASE:-https://vibee-render-production.up.railway.app}"

RESP=$(curl -s --max-time 45 "$BASE/api/browser/watch" -H "X-Agent-Key: $KEY")

# Пустой ответ — это не «браузер мёртв», это «мы не знаем». Так и говорим.
[ -n "$RESP" ] || { echo "сервис не ответил — вердикта нет"; exit 2; }

RESP="$RESP" JSON="${1:-}" python3 - <<'PYBODY'
import json, os, sys, time

raw = os.environ['RESP']
if os.environ.get('JSON') == '--json':
    print(raw)
    sys.exit(0)

try:
    msg = json.loads(raw)
except Exception:
    print('ответ не разобран:', raw[:200])
    sys.exit(2)

if not msg.get('ok'):
    print('отказано:', str(msg.get('error'))[:200])
    sys.exit(2)

w = msg.get('watch')
if not w or not w.get('at'):
    # Ни одной проверки ещё не было: свежий деплой, или часы не идут.
    print('👁  ни одной проверки ещё не было (свежий деплой или часы не идут)')
    sys.exit(3)

now = time.time() * 1000
mins = lambda ms: int(max(0, now - ms) // 60000) if ms else None
held = mins(w['since'])

if w['ok']:
    print(f"✅ браузер отвечает, уже {held} мин подряд")
else:
    last = mins(w.get('lastOkAt'))
    tail = f"последний живой ответ {last} мин назад" if last is not None else "ни разу не отвечал"
    print(f"🛑 браузер НЕ отвечает уже {held} мин — {w['fails']} проверок подряд, {tail}")

boots = w.get('boots') or 0
if boots:
    print(f"   перезапусков за время наблюдения: {boots}")
if w.get('bootId'):
    print(f"   личность запуска: {w['bootId'][:12]}…")
print(f"   последняя проверка {mins(w['at'])} мин назад")

# Код возврата — чтобы это звали из цикла, а не читали глазами.
sys.exit(0 if w['ok'] else 1)
PYBODY
