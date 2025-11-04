#!/bin/bash

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

SERVER_URL="212.86.115.30"
SERVER_USER="root"
SSH_KEY="~/.ssh/zomro"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

ssh_exec() {
    ssh -i $SSH_KEY $SERVER_USER@$SERVER_URL "$1"
}

echo ""
echo "=================================================================="
log_info "НАСТРОЙКА NGINX ДЛЯ HOST NETWORK"
echo "=================================================================="
echo ""

# 1. Останавливаем старый nginx
log_info "1. Остановка старого nginx..."
ssh_exec "
    docker stop bot-proxy 2>/dev/null || true
    docker rm bot-proxy 2>/dev/null || true
    echo 'Nginx остановлен'
"

# 2. Создаем новую конфигурацию для host network
log_info "2. Создание nginx конфигурации для host network..."
ssh_exec "
    mkdir -p /root/nginx-config
    
    cat > /root/nginx-config/default.conf << 'NGINX_EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name three-head-dragon.shop;
    client_max_body_size 100M;

    # AI Reels Callback - прямой доступ к localhost:3000
    location = /api/telegram/ai-reels-callback {
        proxy_pass http://127.0.0.1:3000/api/telegram/ai-reels-callback;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto http;
        
        # Webhook optimizations
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_connect_timeout 30s;
        proxy_send_timeout 90s;
        proxy_read_timeout 90s;
    }

    # API routes
    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:3000/health;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
    }

    # Main app
    location / {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
NGINX_EOF

    echo 'Конфигурация создана'
"

# 3. Запускаем nginx с host network
log_info "3. Запуск nginx с host network..."
ssh_exec "
    docker run -d \
      --name bot-proxy \
      --restart unless-stopped \
      --network host \
      -v /root/nginx-config:/etc/nginx/conf.d:ro \
      nginx:alpine
    echo 'Nginx запущен с host network'
"

sleep 5

# 4. Проверяем статус nginx
log_info "4. Проверка nginx..."
ssh_exec "
    docker ps | grep bot-proxy
"

# 5. Логи nginx
log_info "5. Логи nginx..."
ssh_exec "
    docker logs bot-proxy --tail 10
"

# 6. ТЕСТ WEBHOOK
log_info "6. ТЕСТ WEBHOOK..."
ssh_exec "
    echo '=== WEBHOOK GET ==='
    curl -s http://localhost/api/telegram/ai-reels-callback
    echo ''
    echo ''
    echo '=== WEBHOOK POST TEST ==='
    curl -X POST http://localhost/api/telegram/ai-reels-callback \
      -H 'Content-Type: application/json' \
      -d '{\"status\":\"completed\",\"test\":\"ok\",\"job_id\":\"telegram-123-456\"}' \
      -s
    echo ''
    echo ''
    echo '=== API HEALTH ==='
    curl -s http://localhost:3000/health
"

# 7. Проверка внешнего доступа
log_info "7. Внешний доступ..."
ssh_exec "
    echo '=== ВНЕШНИЙ WEBHOOK ==='
    curl -s http://three-head-dragon.shop/api/telegram/ai-reels-callback || echo 'Внешний доступ НЕ РАБОТАЕТ'
"

# 8. Проверка логов API
log_info "8. Проверка логов API на webhook..."
ssh_exec "
    sleep 2
    docker logs 999-multibots --tail 20 | grep -E 'callback|AI REELS|Webhook' || echo 'Нет логов webhook'
"

echo ""
echo "=================================================================="
log_success "НАСТРОЙКА NGINX ЗАВЕРШЕНА"
echo "=================================================================="
echo ""
