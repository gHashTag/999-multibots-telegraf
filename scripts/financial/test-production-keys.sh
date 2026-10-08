#!/bin/bash
echo "🔍 ТЕСТ ПРОДАКШН КЛЮЧЕЙ INNGEST"
echo "=" .repeat(60)

echo -e "\n1️⃣ Проверка через диагностический API:"
echo "URL: http://188.137.250.69:3001/api/diagnostic/template2"

# Проверяем доступность
if curl -s --max-time 5 http://188.137.250.69:3001/health > /dev/null 2>&1; then
    echo "✅ Сервер доступен"

    echo -e "\n📊 Ответ диагностики:"
    curl -s http://188.137.250.69:3001/api/diagnostic/template2 | jq '.envVars' 2>/dev/null || echo "Проверяем вручную..."

    echo -e "\n🔑 Проверяем ИМЕННО эти поля:"
    curl -s http://188.137.250.69:3001/api/diagnostic/template2 | jq '.envVars | {INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY, INNGEST_EVENT_KEY_preview, INNGEST_SIGNING_preview}' 2>/dev/null

else
    echo "❌ Сервер недоступен"
fi

echo -e "\n" = .repeat(60)
echo "\n2️⃣ СРАВНЕНИЕ С РАБОЧИМИ КЛЮЧАМИ:"
echo "ОЖИДАЕМЫЕ:"
echo "INNGEST_EVENT_KEY: ${EXPECTED_INNGEST_EVENT_KEY:?set EXPECTED_INNGEST_EVENT_KEY}"
echo "INNGEST_SIGNING_KEY: ${EXPECTED_INNGEST_SIGNING_KEY:?set EXPECTED_INNGEST_SIGNING_KEY}"

echo -e "\n📋 ДОЛЖНО БЫТЬ В ОТВЕТЕ:"
echo "✅ INNGEST_EVENT_KEY_preview: ${EXPECTED_INNGEST_EVENT_KEY:0:18}"
echo "✅ INNGEST_SIGNING_preview: ${EXPECTED_INNGEST_SIGNING_KEY:0:18}"

echo -e "\n❌ ЕСЛИ ВСЕ ЕЩЕ:"
echo "❌ INNGEST_EVENT_KEY_preview: 4JiBiCBZ8e..."
echo "❌ INNGEST_SIGNING_preview: signkey-te..."

echo -e "\n🔧 ТОГДА ПРОБЛЕМА В КОДЕ - нужно проверить загрузку из Infisical!"
