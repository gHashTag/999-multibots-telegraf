#!/bin/bash

################################################################################
# 🚨 ЭКСТРЕННОЕ ВОССТАНОВЛЕНИЕ: /api/telegram/ai-reels-callback
# Автоматический скрипт восстановления webhook endpoint
################################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SERVER_URL="212.86.115.30"
SERVER_USER="root"
SSH_KEY="~/.ssh/zomro"
PROJECT_PATH="/root/999-agents-telegraf"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

ssh_exec() {
    local cmd="$1"
    ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_URL "$cmd"
}

echo ""
echo "=================================================================="
echo "🚨 ЭКСТРЕННОЕ ВОССТАНОВЛЕНИЕ AI REELS CALLBACK"
echo "=================================================================="
echo ""

# Проверка доступности сервера
log_info "1. Проверка доступности сервера..."
if ping -c 2 $SERVER_URL >/dev/null 2>&1; then
    log_success "Сервер доступен"
else
    log_error "Сервер $SERVER_URL недоступен!"
    exit 1
fi

# Проверка SSH
log_info "2. Проверка SSH подключения..."
if ssh -i $SSH_KEY -o ConnectTimeout=5 $SERVER_USER@$SERVER_URL "echo 'SSH OK'" >/dev/null 2>&1; then
    log_success "SSH подключение работает"
else
    log_error "SSH подключение не удается!"
    exit 1
fi

# Остановка старых контейнеров
log_info "3. Остановка старых контейнеров..."
ssh_exec "
    docker stop 999-multibots 2>/dev/null || true
    docker rm 999-multibots 2>/dev/null || true
    docker stop bot-proxy 2>/dev/null || true
    docker rm bot-proxy 2>/dev/null || true
    echo 'Контейнеры остановлены'
"

# Обновление кода
log_info "4. Обновление кода с production..."
ssh_exec "
    cd $PROJECT_PATH
    git fetch origin production
    git reset --hard origin/production
    echo 'Код обновлён'
"

# Пересборка образа
log_info "5. Пересборка Docker образа (без кеша)..."
ssh_exec "
    cd $PROJECT_PATH
    docker build --no-cache -t 999-agents-telegraf:latest . 2>&1 | tail -10
"

# Запуск контейнера
log_info "6. Запуск контейнера 999-multibots..."
ssh_exec "
    docker run -d \
      --name 999-multibots \
      --restart unless-stopped \
      -p 3000:3000 \
      -p 2999-3010:2999-3010 \
      -p 4000:4000 \
      -v $PROJECT_PATH/.env:/app/.env:ro \
      999-agents-telegraf:latest
    echo 'Контейнер запущен'
"

# Ожидание инициализации
log_info "7. Ожидание инициализации (30 секунд)..."
sleep 30

# Запуск nginx
log_info "8. Настройка и запуск nginx..."
ssh_exec "
    mkdir -p /root/nginx-config
    
    # Создание простой nginx конфигурации
    cat > /root/nginx-config/default.conf << 'NGINX_EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name three-head-dragon.shop;
    client_max_body_size 100M;

    location = /api/telegram/ai-reels-callback {
        proxy_pass http://127.0.0.1:3000/api/telegram/ai-reels-callback;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto http;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    location /health {
        proxy_pass http://127.0.0.1:3000/health;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
    }

    location / {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
NGINX_EOF

    docker run -d \
      --name bot-proxy \
      --restart unless-stopped \
      --network host \
      -v /root/nginx-config:/etc/nginx/conf.d:ro \
      nginx:alpine
    
    echo 'Nginx запущен'
"

# Ожидание
log_info "9. Ожидание стабилизации (20 секунд)..."
sleep 20

# Финальная проверка
log_info "10. Финальная проверка системы..."
ssh_exec "
    echo '=== КОНТЕЙНЕРЫ ==='
    docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    
    echo -e '\n=== ПРОВЕРКА API ==='
    curl -s http://localhost:3000/health || echo 'API недоступен'
    
    echo -e '\n=== ПРОВЕРКА WEBHOOK ==='
    curl -s http://localhost/api/telegram/ai-reels-callback || echo 'Webhook недоступен'
    
    echo -e '\n=== ЛОГИ (последние 20 строк) ==='
    docker logs 999-multibots --tail 20 2>&1 | grep -E '(API|Server|callback|listening)' || echo 'Логи не найдены'
"

echo ""
echo "=================================================================="
log_success "ВОССТАНОВЛЕНИЕ ЗАВЕРШЕНО"
echo "=================================================================="
echo ""
echo "Проверьте доступность:"
echo "  API:        http://$SERVER_URL:3000/health"
echo "  Webhook:    http://$SERVER_URL/api/telegram/ai-reels-callback"
echo "  POST Test:  curl -X POST http://$SERVER_URL/api/telegram/ai-reels-callback -H 'Content-Type: application/json' -d '{\"test\":\"ok\"}'"
echo ""
echo "Логи:"
echo "  docker logs 999-multibots -f"
echo ""
