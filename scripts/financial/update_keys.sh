#!/bin/bash
# Update Inngest keys in Infisical

echo "🔑 Обновляем ключи INNGEST в Infisical..."

# Get auth token
TOKEN=$(curl -s -X POST "https://api.infisical.com/api/v2/auth/universal-auth/login" \
  -H "Content-Type: application/json" \
  -d '{"clientId":"88fcf0cd-cce9-4844-bad2-8e19b4bad3ed","clientSecret":"b377e7a60b669ea2317f339dc6cb79ce49d588a7bbed92433bb2a73dedff3314"}' \
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
    \"workspaceId\": \"fd763fa3-35d5-4045-93bd-1795c5f00fc3\",
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
