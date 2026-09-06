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
# Ключ с ретраями: гостевая сессия railway флуктуирует пустыми ответами
# (опыты №22/№30) — одиночный вызов давал ложный FAIL «нет ключа».
KEY=""
for _k in 1 2 3 4; do
  KEY=$(railway variables list -s vibee-render -e production --kv 2>/dev/null | grep ^AGENT_KEYS= | cut -d= -f2- | cut -d: -f1)
  [ -n "$KEY" ] && break
  sleep 8
done
[ -n "$KEY" ] || { echo "FAIL: нет ключа агента (4 ретрая — railway login/гость?)"; exit 1 }

fail=0
say() { printf '%s\n' "$*"; }
check() { # имя, ожидание, факт
  if [ "$2" = "$3" ]; then say "  ✅ $1"; else say "  ❌ $1 (ожидалось: $2, факт: $3)"; fail=1; fi
}

say "— Стек —"
# 5174 — порт player из vite.config.ts (server.port), не дефолтный 5173.
for p in "3333/health" "5174"; do
  code=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://localhost:$p")
  check "порт :${p%%/*}" 200 "$code"
done
# Локальный бот (2999) — опционален: прод живёт на Railway, локальный подъём
# без нужды гоняет второго бота. Вниз = предупреждение, не провал (29.08).
botc=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://localhost:2999/health")
if [ "$botc" = "200" ]; then say "  ✅ порт :2999"; else say "  ⚠️ порт :2999 (локальный бот не поднят — ок для дежурства, прод на Railway)"; fi

say "— Реестр инструментов —"
printf '%s' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' > /tmp/rc-req.json
n=$(curl -s -m 10 http://127.0.0.1:3333/mcp -H "X-Agent-Key: $KEY" -H 'Content-Type: application/json' --data @/tmp/rc-req.json | python3 -c "import json,sys; print(len(json.load(sys.stdin)['result']['tools']))" 2>/dev/null)
# 43 = 35 (было: производство + my_balance + skills CRUD/market
#      + z.ai-фолбэк #716 + планер plan_* + club/pricing/provider_setup)
#      + 8 новых из kie/расширенной ветки соседа (среди них img2img #1437;
#      полный список — tri providers / tools/list; билд 06aa07195beb, 31.08).
# Добавляешь инструмент — подними ожидание здесь ОДНОЙ правкой.
check "инструментов в реестре" 43 "$n"

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
# RSS t27.ai бывает медленным (7с+): одна повторная попытка зонда
# исключает ложный FAIL на миге апстрима (виток №157).
items=$(curl -s -m 15 http://127.0.0.1:3333/api/blog | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('items',[])))" 2>/dev/null)
if [ "${items:-0}" -le 0 ] 2>/dev/null; then sleep 3; items=$(curl -s -m 20 http://127.0.0.1:3333/api/blog | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('items',[])))" 2>/dev/null); fi
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
# Транзиенты ленты (миг пула БД под параллельной нагрузкой) не должны
# ронять виток: даём зонду вторую попытку (виток №110 — первый такой случай).
feed_probe http://127.0.0.1:3333
rc=$?
if [ $rc -ne 0 ]; then sleep 3; feed_probe http://127.0.0.1:3333; rc=$?; fi
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
  # ПРИЁМ АПДЕЙТОВ У КАССИРА. Зонд перевёрнут 06.09.2026: раньше он требовал,
  # чтобы вебхук СТОЯЛ, и был зелёным ровно тогда, когда бот молчал.
  #
  # Вебхук стоял с allowed_updates, где `successful_payment` — не тип апдейта,
  # а поле внутри `message`; Telegram выбрасывал его молча, оставляя один
  # `pre_checkout_query`. Пока вебхук стоит, getUpdates отвечает 409, а сервис
  # бота при виде вебхука опрос не запускал. Итог: ни одного сообщения за всё
  # время, включая оплаты клуба, и ни одной транзакции звёзд.
  #
  # Теперь приёмник один — опрос, — и признак здоровья обратный: вебхука быть
  # НЕ должно. Кассовый токен живёт в vibee-render, печатать нельзя.
  PAYBOT=$(railway variables list -s vibee-render -e production --kv 2>/dev/null | grep ^TOKENS_PAYMENT_BOT_TOKEN= | cut -d= -f2-)
  if [ -n "$PAYBOT" ]; then
    wh=$(curl -s -m 10 "https://api.telegram.org/bot${PAYBOT}/getWebhookInfo" | python3 -c "import json,sys; u=json.load(sys.stdin)['result'].get('url',''); print('gone' if not u else 'set')" 2>/dev/null)
    check "у кассира нет вебхука (принимает опросом)" gone "$wh"
  fi
fi

# Страж кассира УБРАН вместе с тем, что он сторожил.
#
# Страж каждые 5 минут возвращал вебхук, если тот пропал. Пока вебхук стоит,
# бот не может принимать сообщения опросом (409), а сам вебхук был разрешён
# только на pre_checkout_query — значит страж круглосуточно возвращал систему
# в состояние «бот молчит». Он был мостом до постоянного фикса; фикс сделан
# обратный тому, что задумывался, и мост больше не нужен.
#
# Зонд выше проверяет ровно то, что теперь важно: у кассира НЕТ вебхука.
# Проверка живости стража была красной и до этой правки: процесса нет с
# неизвестного момента, а PID-файл остался.

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
    # ВОЗРАСТ, а не наличие. Печаталось `lastPostAt=True` — булево, которое
    # остаётся истинным и через сутки простоя. Именно поэтому регресс говорил
    # ЧИСТО, пока фабрика стояла 51 час (29.08).
    # Источник правды — ЖИВАЯ ЛЕНТА (первый пост /api/feed, поле createdAt):
    # state.json осиротел после включения демона автопилота (#1073/#1074 —
    # тот же принцип: считать из ленты, а не из эфемерного файла). Файл —
    # только fallback, если лента недоступна.
    from datetime import datetime, timezone
    import urllib.request
    lp = None; src = 'state.json'
    today = None  # посты за текущие UTC-сутки, посчитанные по ленте
    try:
        with urllib.request.urlopen('http://127.0.0.1:3333/api/feed?limit=12', timeout=8) as r:
            feed = json.load(r)
        items = feed.get('templates') or []
        if items and items[0].get('createdAt'):
            lp = items[0]['createdAt']; src = 'лента'
            now = datetime.now(timezone.utc)
            today = sum(1 for it in items if it.get('createdAt')
                        and datetime.fromisoformat(str(it['createdAt']).replace('Z','+00:00')).date() == now.date())
    except Exception:
        pass
    if not lp:
        lp = s.get('lastPostAt')
    posts_today = today if today is not None else s.get('postsToday', 0)
    if lp:
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(str(lp).replace('Z','+00:00'))).total_seconds()/3600
        if age > 8 and posts_today < 4:
            print(f'  ❌ последний пост {age:.1f} ч назад, а лимит НЕ исчерпан ({posts_today}/4) — фабрика стоит'); ok = False
        else:
            print(f'  ✅ последний пост {age:.1f} ч назад ({src})')
    else:
        print('  ⚠️ lastPostAt пуст — фабрика ещё не постила');
    if ok:
        print(f'  ✅ тем {len(t)}, в запасе {left}, постов сегодня {posts_today}/{4}' + ('' if today is None else ' (по ленте)'))
    else:
        sys.exit(1)
except SystemExit:
    raise
except Exception as e:
    print(f'  ❌ state/topics не читаются: {e}'); sys.exit(1)
PYEOF
[ $? -ne 0 ] && fail=1

say "— Запас хода фабрики —"
# Баланс приходил в том же ответе my_balance и ВЫБРАСЫВАЛСЯ: проверялся только
# прайс. Поэтому «нужно 1, есть 0» не поднимало тревогу — фабрика встала молча.
printf '%s' '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"my_balance","arguments":{}}}' > /tmp/rc-req.json
runway=$(curl -s -m 10 http://127.0.0.1:3333/mcp -H "X-Agent-Key: $KEY" -H 'Content-Type: application/json' --data @/tmp/rc-req.json | python3 -c "
import json,sys
d=json.load(sys.stdin)['result']['structuredContent']
b=d.get('баланс_токенов'); p=d.get('прайс',{}).get('reel_render',1) or 1
print('house' if b is None else int(b)//int(p))" 2>/dev/null)
if [ "$runway" = "house" ]; then say "  ✅ дом не платит себе (баланс не метрируется)"
elif [ "${runway:-0}" -ge 4 ] 2>/dev/null; then say "  ✅ запас хода $runway рилсов (>= дневной лимит 4)"
else say "  ❌ запаса хода $runway рилсов (< 4): фабрика встанет в пределах суток"; fail=1; fi

say "— Платный слой медальона —"
# ПОЧЕМУ ЭТОТ БЛОК ВООБЩЕ ПОЯВИЛСЯ. Слой картинок был мёртв недели: шаг
# image_generate звал FAL, FAL отвечал 403 «Exhausted balance», а рилс без
# необязательного пропса рендерится в 900 валидных кадров и публикуется с
# отчётом «готово». Ни одна проверка не заглядывала ВНУТРЬ опубликованного
# рецепта — в этом файле до сегодня не было ни одного вхождения слов talking,
# portrait, posterUrl, avatarVideo. Говорящий портрет — слой той же породы:
# необязательный, платный и невидимый, когда ломается. Он приезжает вместе с
# проверкой, которой не было у постера.
#
# Выключатель живёт в проде, а не в этой оболочке, поэтому режим спрашиваем у
# самого деплоя. Три исхода: 0 — чисто или выключено, 1 — слой не производит,
# 2 — НЕ ИЗМЕРЕНО (лента молчит). Сломать её умышленно и увидеть красное
# можно так: PORTRAIT_WATCH_FEED=<файл-фикстура> AUTOPILOT_PORTRAIT=on
# node loop/portrait-watch.mjs
pvars=$(railway variables list -s vibee-render -e production --kv 2>/dev/null)
pmode=$(printf '%s\n' "$pvars" | grep ^AUTOPILOT_PORTRAIT= | cut -d= -f2-)
# «Переменной нет в деплое» и «Railway не ответил» — разные вещи, и путать их
# значит либо молчать при поломке, либо звенеть впустую. Различает их наличие
# ЛЮБОГО имени в том же ответе.
if [ -z "$pmode" ] && printf '%s\n' "$pvars" | grep -q '^AGENT_KEYS='; then
  pmode="off"
fi
if [ -z "$pmode" ]; then
  say "  ⚠️ Railway не ответил — режим портрета НЕ измерен"
else
  AUTOPILOT_PORTRAIT="$pmode" \
    PORTRAIT_WATCH_FEED="https://vibee-render-production.up.railway.app/api/feed?limit=8" \
    node "$HOME/999-multibots-telegraf/loop/portrait-watch.mjs" 2>&1 | sed 's/^/  /'
  prc=${pipestatus[1]}
  case "$prc" in
    0) : ;;
    2) say "  ⚠️ лента не ответила — платный слой НЕ измерен" ;;
    *) say "  ❌ платный слой медальона не производит (код $prc)"; fail=1 ;;
  esac
fi

say "— Слепок имён переменных деплоя —"
# ПОЧЕМУ ЭТО ЗДЕСЬ, А НЕ В ТЕСТЕ. channel-env-contract.test.ts сверяет имена,
# которые читает код, с checked-in списком loop/deploy-env-names.txt. Список
# ржавеет ровно в тот момент, когда кто-то правит переменные в Railway — и с
# этой минуты контракт-тест проверяет прошлогоднюю реальность, то есть не
# проверяет ничего. Увидеть расхождение может только тот, кто спросит сам
# деплой; из теста (без сети, без логина) — нельзя. Отсюда и разделение.
manifest="$HOME/999-multibots-telegraf/loop/deploy-env-names.txt"
live=$(railway variables list -s vibee-render -e production --kv 2>/dev/null | cut -d= -f1 | grep -E '^[A-Z][A-Z0-9_]*$' | sort)
if [ -z "$live" ]; then
  # Три исхода, а не два: «не смог измерить» — это НЕ «чисто».
  say "  ⚠️ Railway не ответил — свежесть слепка НЕ измерена"
elif [ ! -f "$manifest" ]; then
  say "  ❌ нет $manifest — контракт-тест сверяется с пустотой"; fail=1
else
  drift=$(diff <(grep -v '^#' "$manifest" | grep -v '^[[:space:]]*$') <(printf '%s\n' "$live"))
  if [ -z "$drift" ]; then
    say "  ✅ слепок совпадает с деплоем ($(printf '%s\n' "$live" | wc -l | tr -d ' ') имён)"
  else
    say "  ❌ слепок разошёлся с деплоем — пересними и разберись, что изменилось:"
    printf '%s\n' "$drift" | head -12 | sed 's/^/     /'
    fail=1
  fi
fi

say ""
if [ $fail -eq 0 ]; then say "РЕГРЕСС: ЧИСТО"; else say "РЕГРЕСС: ЕСТЬ ПРОВАЛЫ (см. ❌ выше)"; exit 1; fi
