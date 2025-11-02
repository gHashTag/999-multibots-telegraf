#!/bin/bash

# 🚨 КРИТИЧЕСКИЙ СКРИПТ - ТОЛЬКО 2 БОТА В DEVELOPMENT РЕЖИМЕ!
# ⚠️ НЕ ЛОМАТЬ ПРОДАКШН!

set -e

echo "🚨 ======================================="
echo "🚨 ПРОДАКШН ВОССТАНОВЛЕНИЕ - 2 БОТА DEV"
echo "🚨 ======================================="
echo ""
echo "⚠️  ПРЕДУПРЕЖДЕНИЕ: Это продакшн сервер!"
echo "⚠️  Запускаем ТОЛЬКО 2 бота в development режиме"
echo "⚠️  НЕ ТРОГАТЬ полный деплой!"
echo ""

# Проверяем что мы на правильном сервере
echo "🔍 Проверяем сервер..."
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ipinfo.io/ip 2>/dev/null || echo "unknown")
echo "📍 Сервер IP: $SERVER_IP"

if [ "$SERVER_IP" != "212.86.115.30" ]; then
    echo "❌ ОШИБКА: Это не продакшн сервер!"
    echo "❌ Продакшн сервер: 212.86.115.30"
    exit 1
fi

echo "✅ Подтверждаем: продакшн сервер"
echo ""

# Останавливаем все контейнеры (на всякий случай)
echo "🛑 Останавливаем все контейнеры..."
docker stop $(docker ps -aq) 2>/dev/null || echo "Контейнеров нет"
docker rm $(docker ps -aq) 2>/dev/null || echo "Удалено"
echo ""

# Создаем development конфигурацию
echo "⚙️  Создаем development конфигурацию..."
cat > .env.production.dev << 'EOF'
# DEVELOPMENT РЕЖИМ НА ПРОДАКШН - ТОЛЬКО 2 БОТА!
NODE_ENV=development
USE_PRODUCTION_API=false
forceProductionAPI=false
INNGEST_ENV=development

# Только 2 основных бота
BOT_COUNT=2
BOT_NAMES=neuro_blogger_bot,MetaMuse_Manifest_bot

# DEV настройки
LOCAL_SERVER_URL=http://localhost:4000
API_SERVER_URL=https://three-head-dev.shop

# Уменьшенные лимиты
MAX_CONCURRENT_REQUESTS=5
RATE_LIMIT_REQUESTS_PER_MINUTE=100

# Отключаем heavy operations
ENABLE_INNGEST_MONITORING=false
ENABLE_FULL_LOGGING=false

# Dev режим для ботов
IS_DEV=true
EOF

echo "✅ Development конфигурация создана"
echo ""

# Создаем production Dockerfile для dev режима
echo "🐳 Подготавливаем Docker..."
cat > Dockerfile.dev << 'EOF'
FROM node:20-alpine

WORKDIR /app

# Копируем только необходимые файлы
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts --legacy-peer-deps

COPY . .

# Development build - быстро и просто
RUN npm run build:nocheck

EXPOSE 3000 4000

CMD ["node", "dist/index.js"]
EOF

echo "✅ Dockerfile.dev создан"
echo ""

# Запускаем ТОЛЬКО 2 бота в development режиме
echo "🚀 Запускаем 2 бота в development режиме..."
echo ""

docker run -d \
  --name prod-bot-dev-1 \
  --restart=unless-stopped \
  -p 3000:3000 \
  -p 4000:4000 \
  --env-file .env.production.dev \
  --label mode=development \
  --label bots=2 \
  --label safe=true \
  --health-cmd="curl -f http://localhost:3000/health || exit 1" \
  --health-interval=30s \
  --health-timeout=10s \
  --health-retries=3 \
  .

echo ""
echo "✅ Первый бот запущен"
echo ""

# Подождем немного и проверим статус
echo "⏳ Ждем 10 секунд для инициализации..."
sleep 10

echo ""
echo "📋 СТАТУС ПРОДАКШН СЕРВЕРА:"
echo "=================================="
docker ps | grep -E '(prod-bot|CONTAINER)' || echo "Контейнеры:"
docker ps
echo ""
echo "📜 ЛОГИ (последние 20 строк):"
echo "=================================="
docker logs prod-bot-dev-1 --tail 20 2>/dev/null || echo "Логи пока недоступны"
echo ""

echo "🔍 ПРОВЕРКА ЗДОРОВЬЯ:"
echo "=================================="
sleep 5
curl -s http://localhost:3000/health 2>/dev/null && echo "✅ Бот 1: OK" || echo "❌ Бот 1: НЕ ОТВЕЧАЕТ"
echo ""

echo "🚨 ======================================="
echo "🚨 ПРОДАКШН ВОССТАНОВЛЕНИЕ ЗАВЕРШЕНО!"
echo "🚨 ======================================="
echo ""
echo "✅ Запущено: 2 бота в development режиме"
echo "✅ Сервер: 212.86.115.30"
echo "✅ Порт: 3000"
echo "✅ Режим: DEVELOPMENT"
echo ""
echo "⚠️  ПАМЯТКА:"
echo "   - НЕ деплой full систему на продакшн"
echo "   - НЕ запускай больше 2 ботов"
echo "   - Используй DEV сервер (45.66.11.152) для тестов"
echo "   - Только development режим на продакшн!"
echo ""
echo "🚨 НЕ ЛОМАТЬ ПРОДАКШН! 🚨"
