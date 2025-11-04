#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SERVER_URL="212.86.115.30"
SERVER_USER="root"
SSH_KEY="~/.ssh/zomro"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

ssh_exec() {
    ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_URL "$1"
}

echo ""
echo "=================================================================="
echo "🔧 ИСПРАВЛЕНИЕ И ВОССТАНОВЛЕНИЕ AI REELS CALLBACK"
echo "=================================================================="
echo ""

# Проверка портов
log_info "1. Проверка портов..."
ssh_exec "
    echo 'Занятые порты:'
    netstat -tlnp | grep -E ':(3000|80|443)'
    echo ''
    echo 'Контейнеры:'
    docker ps -a
"

# Убиваем процессы на порту 3000
log_info "2. Освобождение порта 3000..."
ssh_exec "
    fuser -k 3000/tcp 2>/dev/null || true
    sleep 2
    netstat -tlnp | grep 3000 || echo 'Порт 3000 свободен'
"

# Удаляем контейнеры
log_info "3. Удаление контейнеров..."
ssh_exec "
    docker stop 999-multibots 2>/dev/null || true
    docker rm 999-multibots 2>/dev/null || true
    docker stop bot-proxy 2>/dev/null || true
    docker rm bot-proxy 2>/dev/null || true
    echo 'Контейнеры удалены'
"

# Запуск контейнера
log_info "4. Запуск контейнера 999-multibots..."
ssh_exec "
    docker run -d \
      --name 999-multibots \
      --restart unless-stopped \
      -p 3000:3000 \
      -p 2999-3010:2999-3010 \
      -p 4000:4000 \
      -v /root/999-agents-telegraf/.env:/app/.env:ro \
      999-agents-telegraf:latest
    echo 'Контейнер запущен'
"

# Ожидание
log_info "5. Ожидание инициализации (30 сек)..."
sleep 30

# Запуск nginx
log_info "6. Запуск nginx..."
ssh_exec "
    mkdir -p /root/nginx-config
    cat > /root/nginx-config/default.conf << 'NGINX_EOF'
server {
    listen 80 default_server;
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
log_info "7. Ожидание стабилизации (20 сек)..."
sleep 20

# Проверка
log_info "8. Финальная проверка..."
ssh_exec "
    echo '=== КОНТЕЙНЕРЫ ==='
    docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    
    echo -e '\n=== API HEALTH ==='
    curl -s http://localhost:3000/health
    
    echo -e '\n=== WEBHOOK GET ==='
    curl -s http://localhost/api/telegram/ai-reels-callback
    
    echo -e '\n=== ЛОГИ API ==='
    docker logs 999-multibots --tail 15 2>&1 | tail -20
"

echo ""
echo "=================================================================="
log_success "ВОССТАНОВЛЕНИЕ ЗАВЕРШЕНО"
echo "=================================================================="
echo ""
