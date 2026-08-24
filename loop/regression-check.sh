#!/bin/zsh
# РЕГРЕСС-ЧЕК КОНВЕЙЕРА — полный аудит одной командой для витков цикла.
#
# Проверяет всё, что имеет право молча сломаться за ночь: живость стека,
# реестр инструментов, дешёвые живые вызовы MCP, прокси блога, очередь тем
# и целостность state. Платных вызовов НЕ делает (никаких generate).
#
# Запуск из любого места: zsh loop/regression-check.sh
# Ключ агента берётся из Railway CLI и в вывод не печатается.

# Витки иногда зовут этот файл bash'ем — системный bash 3.2 не парсит
# zsh-скрипт (syntax error на EOF). Перехожу на zsh сам, зовут как угодно.
if [ -z "${ZSH_VERSION:-}" ]; then exec zsh "$0" "$@"; fi

cd "$HOME/999-multibots-telegraf" || exit 1
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
# 23 = производство + my_balance + skills CRUD (4) + skills market (3).
# Добавляешь инструмент — подними ожидание здесь ОДНОЙ правкой.
check "инструментов в реестре" 23 "$n"

say "— Дешёвые живые вызовы —"
for tool in whoami feed_stats templates_list feed_analytics my_assets soul_get skills_list; do
  printf '%s' "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$tool\",\"arguments\":{}}}" > /tmp/rc-req.json
  err=$(curl -s -m 20 http://127.0.0.1:3333/mcp -H "X-Agent-Key: $KEY" -H 'Content-Type: application/json' --data @/tmp/rc-req.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error',{}).get('code',''))" 2>/dev/null)
  check "$tool" "" "$err"
done

say "— Честность описаний (trust) —"
desc=$(curl -s -m 10 http://127.0.0.1:3333/mcp -H "X-Agent-Key: $KEY" -H 'Content-Type: application/json' --data @/tmp/rc-req.json > /dev/null; printf '%s' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' > /tmp/rc-req.json; curl -s -m 10 http://127.0.0.1:3333/mcp -H "X-Agent-Key: $KEY" -H 'Content-Type: application/json' --data @/tmp/rc-req.json)
echo "$desc" | grep -q 'seedance-1-lite' && say "  ✅ video_generate говорит правду о провайдере" || { say "  ❌ video_generate не упоминает seedance"; fail=1; }
echo "$desc" | grep -q 'ТОЛЬКО при валидном ключе' && say "  ✅ audio_generate честен про ключ" || { say "  ❌ audio_generate потерял честную оговорку"; fail=1; }
echo "$desc" | grep -q 'flux-schnell' && say "  ✅ image_generate называет реальную модель" || { say "  ❌ image_generate не упоминает flux-schnell"; fail=1; }

say "— Инварианты прайса (PRICING.md) —"
printf '%s' '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"my_balance","arguments":{}}}' > /tmp/rc-req.json
prices_ok=$(curl -s -m 10 http://127.0.0.1:3333/mcp -H "X-Agent-Key: $KEY" -H 'Content-Type: application/json' --data @/tmp/rc-req.json | python3 -c "
import json,sys
p=json.load(sys.stdin)['result']['structuredContent']['прайс']
ok = p.get('image_generate')==1 and p.get('reel_render')==1 and p.get('audio_generate')==6 and p.get('video_generate')==20
print('ok' if ok else 'bad')" 2>/dev/null)
[ "$prices_ok" = "ok" ] && say "  ✅ цены от себестоимости: картинка 1 · рилс 1 · озвучка 6 · видео 20" || { say "  ❌ прайс нарушает инвариант (ожидалось 1/1/6/20)"; fail=1; }

say "— Прокси блога —"
items=$(curl -s -m 15 http://127.0.0.1:3333/api/blog | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('items',[])))" 2>/dev/null)
[ "$items" -gt 0 ] 2>/dev/null && say "  ✅ /api/blog ($items постов)" || { say "  ❌ /api/blog пуст"; fail=1; }

say "— Лента: живой GET (ловит 500 на свежей схеме) —"
feed_probe() { # $1=base
  curl -s -m 15 "$1/api/feed?limit=2" | python3 -c '
import json,sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(1)
ts = d.get("templates")
if not isinstance(ts, list) or not ts:
    sys.exit(1)
t = ts[0]
if "starsCount" not in t or "isStarred" not in t:
    sys.exit(2)
sys.exit(0)' 2>/dev/null
}
feed_probe http://127.0.0.1:3333
rc=$?
[ $rc -eq 0 ] && say "  ✅ локальная лента: 200, templates, starsCount+isStarred" || { say "  ❌ локальная лента: код $rc (0=нет полей схемы звёзд, 1/2=500/пусто)"; fail=1; }
if [ "${REGRESS_PROBE_PROD:-0}" = "1" ]; then
  feed_probe https://vibee-render-production.up.railway.app
  rc=$?
  [ $rc -eq 0 ] && say "  ✅ прод-лента: 200, поля звёзд на месте" || { say "  ❌ ПРОД-ЛЕНТА СЛОМАНА (код $rc) — это прод, чинить немедленно"; fail=1; }
  # Фронт мини-аппа живёт на другом домене, чем API: владелец заходит на
  # /feed — зондим и его, иначе упавший фронт видит только человек.
  # Переменную нельзя называть path: в zsh она связана с PATH и цикл
  # молча обнуляет окружение (курьёз, купленный этим витком).
  for fpath in "/" "/feed"; do
    code=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "https://vibee-editor-production.up.railway.app$fpath")
    check "прод-фронт $fpath" 200 "$code"
  done
  # Вебхук кассира звёзд: слетал разово (цикл №64) — теперь под надзором
  # каждого зонда. Кассовый токен живёт в vibee-render, печатать нельзя.
  PAYBOT=$(railway variables list -s vibee-render -e production --kv 2>/dev/null | grep ^TOKENS_PAYMENT_BOT_TOKEN= | cut -d= -f2-)
  if [ -n "$PAYBOT" ]; then
    wh=$(curl -s -m 10 "https://api.telegram.org/bot${PAYBOT}/getWebhookInfo" | python3 -c "import json,sys; u=json.load(sys.stdin)['result'].get('url',''); print('ok' if 'stars-wh' in u else 'gone')" 2>/dev/null)
    check "вебхук кассира" ok "$wh"
  fi
fi

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
