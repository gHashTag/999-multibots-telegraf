#!/bin/zsh
# СТРАЖ ВЕБХУКА КАССИРА — временный мост до деплоя периодического re-set
# (циклы №218-220: прод-бэкенд на каждом своём рестарте срубает вебхук
# кассира deleteWebhook'ом, потому что кассир = бот №12 бэкенда; окно
# «оплачено, но не зачислено» висит до следующего старта рендера).
#
# Страж живёт ЛОКАЛЬНО: каждые 5 минут проверяет регистрацию и молча
# возвращает её идемпотентным setWebhook с параметрами прод-кода.
# После деплоя фикс-рендера (периодический re-set) стража можно снять:
#   kill "$(cat loop/.cashier-watch.pid)"
export PATH="/opt/homebrew/bin:$PATH"
REPO=/Users/playom/999-multibots-telegraf
LOG=/tmp/cashier-watch.log

say() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$LOG"; }

# Кассирные env тянутся один раз за цикл проверки (гостевая сессия
# Railway флуктуирует пустыми ответами — ретраи как в start-render-local).
envs() {
  KV=""
  for i in 1 2 3 4 5 6; do
    KV="$(railway variables list -s vibee-render -e production --kv 2>/dev/null)"
    [ -n "$KV" ] && break
    sleep 15
  done
  PAYBOT="$(echo "$KV" | grep ^TOKENS_PAYMENT_BOT_TOKEN= | cut -d= -f2-)"
  SECRET="$(echo "$KV" | grep ^STARS_WEBHOOK_SECRET= | cut -d= -f2-)"
  SELFURL="$(echo "$KV" | grep ^SELF_URL= | cut -d= -f2-)"
}

say "страж стартовал (PID $$)"
while true; do
  envs
  if [ -n "$PAYBOT" ] && [ -n "$SECRET" ] && [ -n "$SELFURL" ]; then
    url=$(curl -s -m 10 "https://api.telegram.org/bot${PAYBOT}/getWebhookInfo" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['result'].get('url',''))" 2>/dev/null)
    if [[ "$url" != *stars-wh* ]]; then
      curl -s -m 15 "https://api.telegram.org/bot${PAYBOT}/setWebhook" \
        -H 'Content-Type: application/json' \
        -d "{\"url\": \"${SELFURL}/api/telegram/stars-wh/${SECRET}\", \"allowed_updates\": [\"pre_checkout_query\", \"successful_payment\"]}" > /dev/null 2>&1
      say "вебхук был сбит — восстановлен"
    fi
  else
    say "env не получены — пропуск цикла"
  fi
  sleep 300
done
