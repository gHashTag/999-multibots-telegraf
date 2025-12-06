#!/bin/bash
# 🔧 ИСПРАВЛЕНИЕ: Порты 2999 → 3000 в продакшене
# Запустить на сервере 188.137.250.69

echo "🔧 ФИКС ПОРТОВ В ПРОДАКШЕНЕ"
echo "=========================================="

# 1. Переходим в директорию
cd /opt/999-agents-telegraf || exit 1

# 2. Проверяем текущие порты
echo "📋 Проверяем текущие порты в docker-compose.yml..."
grep -n "ports:" docker-compose.yml | head -5

# 3. Скачиваем обновленный docker-compose.yml
echo ""
echo "📥 Скачиваем обновленный docker-compose.yml..."
curl -o docker-compose.yml https://raw.githubusercontent.com/gHashTag/999-multibots-telegraf/production/docker-compose.yml

# 4. Проверяем что порты изменились
echo ""
echo "✅ Новые порты:"
grep -n "ports:" docker-compose.yml | head -5

# 5. Перезапускаем контейнеры
echo ""
echo "🔄 Перезапускаем контейнеры..."
docker-compose down
docker-compose up -d

# 6. Проверяем статус
echo ""
echo "📊 Статус контейнеров:"
docker ps | grep 999-multibots

# 7. Проверяем логи
echo ""
echo "📜 Проверяем логи (последние 10 строк):"
docker logs 999-multibots --tail 10

# 8. Проверяем доступность API
echo ""
echo "🌐 Проверяем API на порту 3000..."
sleep 5
curl -s http://localhost:3000/health || echo "❌ API на 3000 недоступен"
curl -s http://localhost:3001/health || echo "❌ API на 3001 недоступен"

echo ""
echo "✅ ФИКС ЗАВЕРШЕН!"
echo ""
echo "📋 СЛЕДУЮЩИЕ ШАГИ:"
echo "1. Проверить nginx конфиг: docker exec bot-proxy nginx -t"
echo "2. Если нужно: docker exec bot-proxy nginx -s reload"
echo "3. Проверить webhook: curl -X POST http://localhost:3000/api/video-callback/123456789 -H 'Content-Type: application/json' -d '{\"taskId\":\"test\",\"successFlag\":3}'"
