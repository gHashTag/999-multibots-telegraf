#!/bin/bash

# 🚀 PRODUCTION DEPLOYMENT SCRIPT - 10 BOTS
# Server: 212.86.115.30 (Production)

set -e

echo "🚀 ======================================="
echo "🚀 PRODUCTION DEPLOYMENT - 10 BOTS"
echo "🚀 ======================================="
echo ""
echo "⚠️  ПРЕДУПРЕЖДЕНИЕ: Это production сервер!"
echo "⚠️  Деплоим 10 ботов в production режиме"
echo "⚠️  Проверяем development сервер перед деплоем"
echo ""

# Проверяем что мы на правильном сервере
echo "🔍 Проверяем сервер..."
SERVER_IP=$(hostname -I | awk '{print $1}')
echo "📍 Сервер IP: $SERVER_IP"

if [ "$SERVER_IP" != "212.86.115.30" ]; then
    echo "❌ ОШИБКА: Это не production сервер!"
    echo "❌ Production сервер: 212.86.115.30"
    exit 1
fi

echo "✅ Подтверждаем: production сервер"
echo ""

# Получаем последние изменения из production ветки
echo "📥 Получаем последние изменения..."
git fetch origin production
git checkout production
git pull origin production
echo ""

# Создаем production конфигурацию
echo "⚙️  Создаем production конфигурацию..."
cat > .env.production << 'EOF'
# PRODUCTION РЕЖИМ - 10 БОТОВ!
NODE_ENV=production
USE_PRODUCTION_API=true
forceProductionAPI=true
INNGEST_ENV=production

# 10 ботов в production
BOT_COUNT=10
MAX_CONCURRENT_REQUESTS=50
RATE_LIMIT_REQUESTS_PER_MINUTE=1000

# Production настройки
LOCAL_SERVER_URL=http://localhost:4000
API_SERVER_URL=https://three-head-dragon.shop

# Включаем все production возможности
ENABLE_INNGEST_MONITORING=true
ENABLE_FULL_LOGGING=true
ENABLE_METRICS=true

# Production режим для ботов
IS_DEV=false

# SSL сертификаты
SSL_CERT_PATH=/etc/letsencrypt/live/three-head-dragon.shop/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/three-head-dragon.shop/privkey.pem
EOF

echo "✅ Production конфигурация создана"
echo ""

# Останавливаем старые контейнеры
echo "🛑 Останавливаем старые контейнеры..."
docker stop $(docker ps -aq) 2>/dev/null || echo "Контейнеров нет"
docker rm $(docker ps -aq) 2>/dev/null || echo "Удалено"
echo ""

# Пересобираем production образ
echo "🐳 Пересобираем production образ..."
docker build -t 999-multibots-production --no-cache .
echo ""

# Запускаем production боты (10 штук)
echo "🚀 Запускаем 10 production ботов..."
echo ""

for i in {0..9}; do
    PORT=$((3000 + i))
    CONTAINER_NAME="prod-bot-$i"
    echo "🤖 Запускаем бот $((i + 1))/10 на порту $PORT..."

    docker run -d \
      --name $CONTAINER_NAME \
      --restart=unless-stopped \
      -p $PORT:$PORT \
      -p $((4000 + i)):$((4000 + i)) \
      --env-file .env.production \
      --label mode=production \
      --label bot_number=$((i + 1)) \
      --label bots=10 \
      --health-cmd="curl -f http://localhost:$PORT/health || exit 1" \
      --health-interval=30s \
      --health-timeout=10s \
      --health-retries=3 \
      999-multibots-production
done

echo ""
echo "✅ Все 10 ботов запущены"
echo ""

# Подождем и проверим статус
echo "⏳ Ждем 30 секунд для инициализации..."
sleep 30

echo ""
echo "📋 ПРОDUCTION СТАТУС:"
echo "=================================="
docker ps | grep prod-bot || echo "Контейнеры ботов:"
docker ps
echo ""

# Проверяем здоровье каждого бота
echo "🔍 ПРОВЕРКА ЗДОРОВЬЯ ВСЕХ БОТОВ:"
echo "=================================="
for i in {0..9}; do
    PORT=$((3000 + i))
    CONTAINER_NAME="prod-bot-$i"
    sleep 2
    curl -s http://localhost:$PORT/health 2>/dev/null && echo "✅ Бот $((i + 1)) ($CONTAINER_NAME): OK" || echo "❌ Бот $((i + 1)) ($CONTAINER_NAME): НЕ ОТВЕЧАЕТ"
done
echo ""

# Запускаем nginx proxy для production
echo "🔀 Запускаем nginx proxy для production..."
cat > nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    upstream prod_bots {
        server 127.0.0.1:3000;
        server 127.0.0.1:3001;
        server 127.0.0.1:3002;
        server 127.0.0.1:3003;
        server 127.0.0.1:3004;
        server 127.0.0.1:3005;
        server 127.0.0.1:3006;
        server 127.0.0.1:3007;
        server 127.0.0.1:3008;
        server 127.0.0.1:3009;
    }

    server {
        listen 80;
        server_name three-head-dragon.shop;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name three-head-dragon.shop;

        ssl_certificate /etc/letsencrypt/live/three-head-dragon.shop/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/three-head-dragon.shop/privkey.pem;

        location / {
            proxy_pass http://prod_bots;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
EOF

docker run -d \
  --name prod-nginx \
  --restart=unless-stopped \
  -p 80:80 \
  -p 443:443 \
  -v $(pwd)/nginx.conf:/etc/nginx/nginx.conf:ro \
  -v /etc/letsencrypt:/etc/letsencrypt:ro \
  nginx:alpine

echo "✅ Nginx proxy запущен"
echo ""

echo "🚨 ======================================="
echo "🚨 PRODUCTION DEPLOYMENT ЗАВЕРШЕН!"
echo "🚨 ======================================="
echo ""
echo "✅ Запущено: 10 ботов в production режиме"
echo "✅ Сервер: 212.86.115.30"
echo "✅ Nginx: SSL на портах 80, 443"
echo "✅ Health checks: Активны для всех ботов"
echo ""
echo "🌐 URLs:"
echo "   - https://three-head-dragon.shop - основной endpoint"
echo "   - http://212.86.115.30:3000 - бот 1"
echo "   - http://212.86.115.30:3001 - бот 2"
echo "   - ..."
echo "   - http://212.86.115.30:3009 - бот 10"
echo ""
echo "🔍 Мониторинг:"
echo "   - docker ps - статус всех контейнеров"
echo "   - docker logs prod-bot-N - логи конкретного бота"
echo "   - curl http://localhost:PORT/health - проверка здоровья"
echo ""
