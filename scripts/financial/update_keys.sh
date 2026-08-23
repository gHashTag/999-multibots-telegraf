#!/bin/bash
# Update Inngest keys in Infisical

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

echo "🔑 Обновляем ключи INNGEST в Infisical..."

# Get auth token.
# Тело запроса собирается node-ом из окружения и уходит в curl через stdin:
# так секрет не попадает в argv (виден в `ps`) и не ломается о кавычки.
TOKEN=$(node -e 'process.stdout.write(JSON.stringify({clientId: process.env.INFISICAL_CLIENT_ID, clientSecret: process.env.INFISICAL_CLIENT_SECRET}))' \
  | curl -s -X POST "https://api.infisical.com/api/v2/auth/universal-auth/login" \
      -H "Content-Type: application/json" \
      --data-binary @- \
  | node -e 'process.stdin.once("data", d => console.log(JSON.parse(d).accessToken))')

if [ -z "$TOKEN" ]; then
  echo "❌ Не удалось получить токен авторизации"
  exit 1
fi

echo "✅ Токен получен"

# Update secrets
RESPONSE=$(curl -s -X POST "https://api.infisical.com/api/v2/secrets/batch" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"workspaceId\": \"$INFISICAL_PROJECT_ID\",
    \"environment\": \"prod\",
    \"type\": \"shared\",
    \"secrets\": [
      {
        \"secretKey\": \"INNGEST_EVENT_KEY\",
        \"secretValue\": \"DDRreS100AKTh7OAQNLHm7L7dHyMHTAhocQzHGYR6TfvEuHExLc-QYWj_ROzM0ZImzzFT9CskrsDHr7FB8-yPw\",
        \"secretComment\": \"Updated event key\"
      },
      {
        \"secretKey\": \"INNGEST_SIGNING_KEY\",
        \"secretValue\": \"signkey-test-c4167464e900701832920c98bb2ec6e6e3c59fd2b27c62e1f4140dada01e4597\",
        \"secretComment\": \"Signing key\"
      }
    ]
  }")

if echo "$RESPONSE" | grep -q "secrets"; then
  echo "✅ Ключи обновлены в Infisical!"
  echo ""
  echo "Теперь перезапускаем контейнер..."
  docker restart 999-multibots
  echo "✅ Контейнер перезапущен!"
  echo ""
  echo "Подождите 15 секунд и проверьте логи:"
  echo "  ssh prod999 'docker logs 999-multibots --tail 50 | grep INNGEST'"
else
  echo "❌ Ошибка обновления:"
  echo "$RESPONSE"
  exit 1
fi
