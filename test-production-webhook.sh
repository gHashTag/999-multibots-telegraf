#!/bin/bash
# Тест webhook в продакшене

echo "🧪 Тестируем webhook в продакшене..."
echo "URL: https://three-head-dragon.shop/api/video-callback/123456789"
echo ""

echo "📤 Отправляем webhook с ошибкой контент-политики (successFlag=3)..."
curl -X POST https://three-head-dragon.shop/api/video-callback/123456789 \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "prod-test-content-policy-123",
    "successFlag": 3,
    "errorMessage": "OpenAI currently do not support uploads of images containing photorealistic people",
    "errorCode": 400
  }' \
  --max-time 10 \
  2>/dev/null || echo "❌ Webhook не дошел или сервер недоступен"

echo ""
echo "📤 Отправляем webhook с ошибкой генерации (successFlag=2)..."
curl -X POST https://three-head-dragon.shop/api/video-callback/987654321 \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "prod-test-generation-error-456",
    "successFlag": 2,
    "errorMessage": "Generation timeout exceeded",
    "errorCode": 500
  }' \
  --max-time 10 \
  2>/dev/null || echo "❌ Webhook не дошел или сервер недоступен"

echo ""
echo "✅ Тест отправлен!"
echo ""
echo "📋 Для проверки результата:"
echo "1. SSH на сервер: ssh root@188.137.250.69"
echo "2. Логи: docker logs 999-multibots --tail 100 -f"
echo "3. Поиск: grep 'Direct.*notification' логи"
