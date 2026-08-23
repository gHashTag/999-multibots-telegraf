#!/bin/bash

# 🔐 Учётка Infisical (Machine Identity) — ТОЛЬКО из окружения.
# Она открывает доступ ко ВСЕМ секретам проекта, в скрипт её не зашивать.
# Где взять: railway variables --kv | grep INFISICAL_
#   либо https://app.infisical.com → project "999" → Access Control
#         → Machine Identities → Client ID / Client Secret
for VAR in INFISICAL_CLIENT_ID INFISICAL_CLIENT_SECRET INFISICAL_PROJECT_ID; do
  if [ -z "${!VAR}" ]; then
    echo "❌ $VAR не задан. Взять: railway variables --kv | grep INFISICAL_" >&2
    exit 1
  fi
done

# Get Infisical token.
# Тело запроса собирается python-ом из окружения и уходит в curl через stdin:
# так секрет не попадает в argv (виден в `ps`) и не ломается о кавычки.
TOKEN=$(python3 -c 'import json, os, sys; sys.stdout.write(json.dumps({"clientId": os.environ["INFISICAL_CLIENT_ID"], "clientSecret": os.environ["INFISICAL_CLIENT_SECRET"]}))' \
  | curl -s -X POST "https://app.infisical.com/api/v1/auth/universal-auth/login" \
      -H "Content-Type: application/json" \
      --data-binary @- \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['accessToken'])")

if [ -z "$TOKEN" ]; then
  echo "❌ Не удалось получить токен Infisical (проверьте INFISICAL_CLIENT_ID / INFISICAL_CLIENT_SECRET)" >&2
  exit 1
fi

echo "Token: ${#TOKEN} chars"

# Get secrets
SECRETS=$(curl -s "https://app.infisical.com/api/v3/secrets/raw?workspaceId=$INFISICAL_PROJECT_ID&environment=prod" \
  -H "Authorization: Bearer $TOKEN")

SUPABASE_URL=$(echo "$SECRETS" | python3 -c "import sys, json; secrets = json.load(sys.stdin)['secrets']; print(next((s['secretValue'] for s in secrets if s['secretKey'] == 'SUPABASE_URL'), ''))")
SUPABASE_SERVICE_KEY=$(echo "$SECRETS" | python3 -c "import sys, json; secrets = json.load(sys.stdin)['secrets']; print(next((s['secretValue'] for s in secrets if s['secretKey'] == 'SUPABASE_SERVICE_KEY'), ''))")

# Пустое значение здесь дало бы невнятную ошибку от PostgREST тремя вызовами позже
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_KEY" ]; then
  echo "❌ SUPABASE_URL / SUPABASE_SERVICE_KEY не найдены в Infisical (env=prod)" >&2
  exit 1
fi

echo "SUPABASE_URL=$SUPABASE_URL"
echo "SUPABASE_SERVICE_KEY length: ${#SUPABASE_SERVICE_KEY}"

export SUPABASE_URL
export SUPABASE_SERVICE_KEY

# Run node script to update
node -e "
const { createClient } = require('@supabase/supabase-js');
// Ключ берём из окружения (экспортирован выше), а не подставляем в argv
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
(async () => {
  const { data, error } = await supabase
    .from('payments_v2')
    .update({ type: 'MONEY_INCOME' })
    .in('telegram_id', [693774948, 691324065])
    .eq('description', 'Бонус от администратора для баланса 1000⭐')
    .select('telegram_id, type, stars');
  console.log('Updated:', JSON.stringify({ data, error }, null, 2));

  // Check new balance
  for (const tid of ['693774948', '691324065']) {
    const { data: bal } = await supabase.rpc('get_user_balance', { user_telegram_id: tid });
    console.log('Balance for ' + tid + ':', bal);
  }
})();
"
