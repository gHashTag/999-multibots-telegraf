#!/bin/zsh
# РЕГРЕСС-ЧЕК КОНВЕЙЕРА — полный аудит одной командой для витков цикла.
#
# Проверяет всё, что имеет право молча сломаться за ночь: живость стека,
# реестр инструментов, дешёвые живые вызовы MCP, прокси блога, очередь тем
# и целостность state. Платных вызовов НЕ делает (никаких generate).
#
# Запуск из любого места: zsh loop/regression-check.sh
# Ключ агента берётся из Railway CLI и в вывод не печатается.

cd /Users/playom/999-multibots-telegraf || exit 1
KEY=$(railway variables list -s vibee-render -e production --kv 2>/dev/null | grep ^AGENT_KEYS= | cut -d= -f2- | cut -d: -f1)
[ -n "$KEY" ] || { echo "FAIL: нет ключа агента (railway link?)"; exit 1 }

fail=0
say() { printf '%s\n' "$*"; }
check() { # имя, ожидание, факт
  if [ "$2" = "$3" ]; then say "  ✅ $1"; else say "  ❌ $1 (ожидалось: $2, факт: $3)"; fail=1; fi
}

say "— Стек —"
for p in "3333/health" "5173" "2999/health"; do
  code=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://localhost:$p")
  check "порт :${p%%/*}" 200 "$code"
done

say "— Реестр инструментов —"
printf '%s' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' > /tmp/rc-req.json
n=$(curl -s -m 10 http://127.0.0.1:3333/mcp -H "X-Agent-Key: $KEY" -H 'Content-Type: application/json' --data @/tmp/rc-req.json | python3 -c "import json,sys; print(len(json.load(sys.stdin)['result']['tools']))" 2>/dev/null)
check "инструментов в реестре" 15 "$n"

say "— Дешёвые живые вызовы —"
for tool in whoami feed_stats templates_list feed_analytics my_assets soul_get; do
  printf '%s' "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$tool\",\"arguments\":{}}}" > /tmp/rc-req.json
  err=$(curl -s -m 20 http://127.0.0.1:3333/mcp -H "X-Agent-Key: $KEY" -H 'Content-Type: application/json' --data @/tmp/rc-req.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error',{}).get('code',''))" 2>/dev/null)
  check "$tool" "" "$err"
done

say "— Честность описаний (trust) —"
desc=$(curl -s -m 10 http://127.0.0.1:3333/mcp -H "X-Agent-Key: $KEY" -H 'Content-Type: application/json' --data @/tmp/rc-req.json > /dev/null; printf '%s' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' > /tmp/rc-req.json; curl -s -m 10 http://127.0.0.1:3333/mcp -H "X-Agent-Key: $KEY" -H 'Content-Type: application/json' --data @/tmp/rc-req.json)
echo "$desc" | grep -q 'seedance-1-lite' && say "  ✅ video_generate говорит правду о провайдере" || { say "  ❌ video_generate не упоминает seedance"; fail=1; }
echo "$desc" | grep -q 'ТОЛЬКО при валидном ключе' && say "  ✅ audio_generate честен про ключ" || { say "  ❌ audio_generate потерял честную оговорку"; fail=1; }
echo "$desc" | grep -q 'flux-schnell' && say "  ✅ image_generate называет реальную модель" || { say "  ❌ image_generate не упоминает flux-schnell"; fail=1; }

say "— Прокси блога —"
items=$(curl -s -m 15 http://127.0.0.1:3333/api/blog | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('items',[])))" 2>/dev/null)
[ "$items" -gt 0 ] 2>/dev/null && say "  ✅ /api/blog ($items постов)" || { say "  ❌ /api/blog пуст"; fail=1; }

say "— Очередь и состояние —"
python3 - <<'PYEOF'
import json, sys
try:
    t = json.load(open('loop/topics.json'))
    s = json.load(open('loop/state.json'))
    left = len(t) - s.get('nextTopic', 0)
    req = ['title','subtitle','lesson','tags','plates']
    bad = [x for x in t if any(k not in x or not x[k] for k in req)]
    ok = True
    if bad:
        print(f'  ❌ битых тем: {len(bad)}'); ok = False
    if left < 3 and s.get('postsToday', 0) < 4:
        print(f'  ⚠️ тем в запасе {left} (<3) и лимит не исчерпан — витку пополнить'); ok = True
    if ok:
        print(f'  ✅ тем {len(t)}, в запасе {left}, постов сегодня {s.get("postsToday")}/{4}, lastPostAt={bool(s.get("lastPostAt"))}')
except Exception as e:
    print(f'  ❌ state/topics не читаются: {e}'); sys.exit(1)
PYEOF
[ $? -ne 0 ] && fail=1

say ""
if [ $fail -eq 0 ]; then say "РЕГРЕСС: ЧИСТО"; else say "РЕГРЕСС: ЕСТЬ ПРОВАЛЫ (см. ❌ выше)"; exit 1; fi
