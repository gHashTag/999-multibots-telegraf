#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
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
log_info "ИСПРАВЛЕНИЕ DOCKER NETWORK"
echo "=================================================================="
echo ""

# 1. Остановка всех контейнеров
log_info "1. Остановка ВСЕХ контейнеров..."
ssh_exec "
    docker stop \$(docker ps -aq) 2>/dev/null || true
    docker rm \$(docker ps -aq) 2>/dev/null || true
    echo 'Контейнеры остановлены'
"

# 2. Перезапуск Docker сервиса
log_info "2. Перезапуск Docker сервиса..."
ssh_exec "
    systemctl restart docker
    sleep 5
    docker info | grep 'Server Version'
"

# 3. Очистка сетей
log_info "3. Очистка Docker сетей..."
ssh_exec "
    docker network prune -f
    docker network ls
"

# 4. Запуск с host network (обход проблем с bridge)
log_info "4. Запуск с --network host (обход bridge)..."
ssh_exec "
    docker run -d \
      --name 999-multibots \
      --restart unless-stopped \
      --network host \
      -v /root/999-agents-telegraf/.env:/app/.env:ro \
      999-agents-telegraf:latest
    echo 'Контейнер запущен с host network'
"

sleep 10

# 5. Проверка
log_info "5. Проверка статуса..."
ssh_exec "
    docker ps -a
"

log_info "6. Логи..."
ssh_exec "
    docker logs 999-multibots --tail 30 2>&1
"

# 7. Проверка API (через localhost)
log_info "7. Проверка API (localhost:3000)..."
ssh_exec "
    echo '=== HEALTH CHECK ==='
    curl -s http://localhost:3000/health || echo 'HEALTH: FAILED'
    echo ''
    echo '=== WEBHOOK CHECK ==='
    curl -s http://localhost/api/telegram/ai-reels-callback || echo 'WEBHOOK: FAILED'
"

echo ""
echo "=================================================================="
log_success "ИСПРАВЛЕНИЕ ЗАВЕРШЕНО"
echo "=================================================================="
echo ""
