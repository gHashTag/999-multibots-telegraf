#!/bin/bash
# 🚨 ЭКСТРЕННОЕ ИСПРАВЛЕНИЕ nginx + API сервер

echo "🚨 ЭКСТРЕННОЕ ИСПРАВЛЕНИЕ 502 BAD GATEWAY"
echo "=========================================="

# 1. Проверяем что слушает на 3000
echo "1️⃣ Проверяем порты..."
echo "=== Docker containers ==="
ssh root@188.137.250.69 'docker ps -a | grep 999-multibots'
echo ""
echo "=== Port 3000 ==="
ssh root@188.137.250.69 'netstat -tulpn | grep :3000 || echo "Port 3000 NOT LISTENING"'
echo ""
echo "=== Port 2999 ==="
ssh root@188.137.250.69 'netstat -tulpn | grep :2999 || echo "Port 2999 NOT LISTENING"'

# 2. Проверяем nginx конфиг
echo ""
echo "2️⃣ Проверяем nginx конфиг..."
ssh root@188.137.250.69 'docker exec bot-proxy grep -n "proxy_pass" /etc/nginx/conf.d/default.conf || echo "Nginx not accessible"'

# 3. Проверяем docker-compose.yml
echo ""
echo "3️⃣ Проверяем docker-compose.yml..."
ssh root@188.137.250.69 'grep -n "2999\|3000" /root/999-agents-telegraf/docker-compose.yml | head -10'

# 4. ЭКСТРЕННОЕ ИСПРАВЛЕНИЕ
echo ""
echo "4️⃣ ЭКСТРЕННОЕ ИСПРАВЛЕНИЕ..."
echo "Убиваем старые контейнеры..."
ssh root@188.137.250.69 'docker stop 999-multibots 2>/dev/null || true'
ssh root@188.137.250.69 'docker rm 999-multibots 2>/dev/null || true'

echo "Исправляем nginx config..."
ssh root@188.137.250.69 'docker exec bot-proxy sed -i "s|localhost:2999|localhost:3000|g" /etc/nginx/conf.d/default.conf || echo "Failed to update nginx"'
ssh root@188.137.250.69 'docker exec bot-proxy nginx -t'
ssh root@188.137.250.69 'docker exec bot-proxy nginx -s reload || echo "Failed to reload nginx"'

echo "Перезапускаем с правильными портами..."
ssh root@188.137.250.69 'cd /root/999-agents-telegraf && docker-compose down && docker-compose up -d'

echo "Ждем 15 секунд для запуска..."
ssh root@188.137.250.69 'sleep 15'

# 5. Проверяем результат
echo ""
echo "5️⃣ ПРОВЕРЯЕМ РЕЗУЛЬТАТ..."
echo "=== API на 3000 ==="
ssh root@188.137.250.69 'curl -s http://localhost:3000/health || echo "❌ API 3000 недоступен"'

echo ""
echo "=== Container status ==="
ssh root@188.137.250.69 'docker ps | grep 999-multibots'

echo ""
echo "=== Logs (последние 20 строк) ==="
ssh root@188.137.250.69 'docker logs 999-multibots --tail 20'

echo ""
echo "6️⃣ ФИНАЛЬНЫЙ ТЕСТ WEBHOOK..."
echo "Отправляем webhook..."
WEBHOOK_RESPONSE=$(ssh root@188.137.250.69 'curl -s -w "HTTP_CODE:%{http_code}" -X POST http://localhost:3000/api/video-callback/123456789 -H "Content-Type: application/json" -d "{\"taskId\":\"emergency-test\",\"successFlag\":3,\"errorMessage\":\"Test\",\"errorCode\":400}"' 2>/dev/null || echo "HTTP_CODE:000")
echo "Ответ: $WEBHOOK_RESPONSE"

echo ""
echo "✅ ЭКСТРЕННОЕ ИСПРАВЛЕНИЕ ЗАВЕРШЕНО!"
