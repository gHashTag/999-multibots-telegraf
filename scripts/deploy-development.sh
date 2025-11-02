#!/bin/bash

# 🔧 DEVELOPMENT DEPLOYMENT SCRIPT - 2 BOTS
# Server: 45.66.11.152 (Development)

set -e

echo "🔧 ======================================="
echo "🔧 DEVELOPMENT DEPLOYMENT - 2 BOTS"
echo "🔧 ======================================="
echo ""
echo "✅ DEVELOPMENT сервер для тестирования"
echo "✅ Деплоим 2 бота в development режиме"
echo "✅ Безопасно для экспериментов"
echo ""

# Проверяем что мы на development сервере
echo "🔍 Проверяем сервер..."
SERVER_IP=$(hostname -I | awk '{print $1}')
echo "📍 Сервер IP: $SERVER_IP"

if [ "$SERVER_IP" != "45.66.11.152" ]; then
    echo "❌ ОШИБКА: Это не development сервер!"
    echo "❌ Development сервер: 45.66.11.152"
    exit 1
fi

echo "✅ Подтверждаем: development сервер"
echo ""

# Получаем последние изменения из main ветки
echo "📥 Получаем последние изменения из main..."
git fetch origin main
git checkout main
git pull origin main
echo ""

# Создаем development конфигурацию
echo "⚙️  Создаем development конфигурацию..."
cat > .env.development << 'EOF'
# DEVELOPMENT РЕЖИМ - 2 БОТА!
NODE_ENV=development
USE_PRODUCTION_API=false
forceProductionAPI=false
INNGEST_ENV=development

# 2 бота в development
BOT_COUNT=2
MAX_CONCURRENT_REQUESTS=10
RATE_LIMIT_REQUESTS_PER_MINUTE=200

# Development настройки
LOCAL_SERVER_URL=http://localhost:4000
API_SERVER_URL=https://three-head-dev.shop

# Отключаем heavy operations
ENABLE_INNGEST_MONITORING=true
ENABLE_FULL_LOGGING=true
ENABLE_METRICS=false

# Development режим для ботов
IS_DEV=true

# SSL сертификаты
SSL_CERT_PATH=/etc/letsencrypt/live/three-head-dev.shop/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/three-head-dev.shop/privkey.pem
EOF

echo "✅ Development конфигурация создана"
echo ""

# Останавливаем старые контейнеры
echo "🛑 Останавливаем старые контейнеры..."
docker stop $(docker ps -aq) 2>/dev/null || echo "Контейнеров нет"
docker rm $(docker ps -aq) 2>/dev/null || echo "Удалено"
echo ""

# Пересобираем development образ
echo "🐳 Пересобираем development образ..."
docker build -t 999-multibots-development --no-cache .
echo ""

# Запускаем development боты (2 штуки)
echo "🚀 Запускаем 2 development бота..."
echo ""

for i in {0..1}; do
    PORT=$((3000 + i))
    CONTAINER_NAME="dev-bot-$i"
    echo "🤖 Запускаем бот $((i + 1))/2 на порту $PORT..."

    docker run -d \
      --name $CONTAINER_NAME \
      --restart=unless-stopped \
      -p $PORT:$PORT \
      -p $((4000 + i)):$((4000 + i)) \
      --env-file .env.development \
      --label mode=development \
      --label bot_number=$((i + 1)) \
      --label bots=2 \
      --health-cmd="curl -f http://localhost:$PORT/health || exit 1" \
      --health-interval=30s \
      --health-timeout=10s \
      --health-retries=3 \
      999-multibots-development
done

echo ""
echo "✅ Оба development бота запущены"
echo ""

# Подождем и проверим статус
echo "⏳ Ждем 15 секунд для инициализации..."
sleep 15

echo ""
echo "📋 DEVELOPMENT СТАТУС:"
echo "=================================="
docker ps | grep dev-bot || echo "Контейнеры ботов:"
docker ps
echo ""

# Проверяем здоровье каждого бота
echo "🔍 ПРОВЕРКА ЗДОРОВЬЯ БОТОВ:"
echo "=================================="
for i in {0..1}; do
    PORT=$((3000 + i))
    CONTAINER_NAME="dev-bot-$i"
    sleep 1
    curl -s http://localhost:$PORT/health 2>/dev/null && echo "✅ Бот $((i + 1)) ($CONTAINER_NAME): OK" || echo "❌ Бот $((i + 1)) ($CONTAINER_NAME): НЕ ОТВЕЧАЕТ"
done
echo ""

# Запускаем nginx proxy для development
echo "🔀 Запускаем nginx proxy для development..."
cat > nginx-dev.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    upstream dev_bots {
        server 127.0.0.1:3000;
        server 127.0.0.1:3001;
    }

    server {
        listen 80;
        server_name three-head-dev.shop;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name three-head-dev.shop;

        ssl_certificate /etc/letsencrypt/live/three-head-dev.shop/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/three-head-dev.shop/privkey.pem;

        location / {
            proxy_pass http://dev_bots;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
EOF

docker run -d \
  --name dev-nginx \
  --restart=unless-stopped \
  -p 80:80 \
  -p 443:443 \
  -v $(pwd)/nginx-dev.conf:/etc/nginx/nginx.conf:ro \
  -v /etc/letsencrypt:/etc/letsencrypt:ro \
  nginx:alpine

echo "✅ Nginx proxy запущен"
echo ""

echo "🔧 ======================================="
echo "🔧 DEVELOPMENT DEPLOYMENT ЗАВЕРШЕН!"
echo "🔧 ======================================="
echo ""
echo "✅ Запущено: 2 бота в development режиме"
echo "✅ Сервер: 45.66.11.152"
echo "✅ Nginx: SSL на портах 80, 443"
echo "✅ Health checks: Активны для всех ботов"
echo ""
echo "🌐 URLs:"
echo "   - https://three-head-dev.shop - основной endpoint"
echo "   - http://45.66.11.152:3000 - бот 1"
echo "   - http://45.66.11.152:3001 - бот 2"
echo ""
echo "🔍 Мониторинг:"
echo "   - docker ps - статус всех контейнеров"
echo "   - docker logs dev-bot-N - логи конкретного бота"
echo "   - curl http://localhost:PORT/health - проверка здоровья"
echo ""
echo "✅ Безопасно для тестирования и экспериментов!"
echo ""
