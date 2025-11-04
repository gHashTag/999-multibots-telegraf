#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

SERVER_URL="212.86.115.30"
SERVER_USER="root"
SSH_KEY="~/.ssh/zomro"

ssh_exec() {
    ssh -i $SSH_KEY $SERVER_USER@$SERVER_URL "$1"
}

echo ""
echo "=================================================================="
log_info "🚨 ПРИНУДИТЕЛЬНОЕ ОБНОВЛЕНИЕ КОДА С 3a86d653"
echo "=================================================================="
echo ""

# 1. Принудительное обновление до последнего коммита
log_info "1. Принудительное обновление кода..."
ssh_exec "
    cd /root/999-agents-telegraf
    git fetch origin reels-callback-1
    git reset --hard origin/reels-callback-1
    echo '=== ТЕКУЩИЙ КОММИТ ==='
    git log --oneline -1
    echo ''
    echo '=== ПРОВЕРКА rootDir ==='
    grep '\"rootDir\"' tsconfig.json
    echo ''
    echo '=== ПРОВЕРКА tsconfig.json ИМЕННО ==='
    cat tsconfig.json | grep -A 2 -B 2 'rootDir'
"

# 2. Удаление контейнера
log_info "2. Удаление контейнера..."
ssh_exec "
    docker stop 999-multibots 2>/dev/null || true
    docker rm 999-multibots 2>/dev/null || true
"

# 3. Пересборка
log_info "3. Пересборка образа..."
ssh_exec "
    cd /root/999-agents-telegraf
    docker build --no-cache -t 999-agents-telegraf:latest . 2>&1 | tail -10
"

# 4. Запуск
log_info "4. Запуск контейнера..."
ssh_exec "
    cd /root/999-agents-telegraf
    docker run -d \
      --name 999-multibots \
      --restart unless-stopped \
      --network host \
      -v /root/999-agents-telegraf/.env:/app/.env:ro \
      999-agents-telegraf:latest
    echo 'Контейнер запущен'
"

# 5. Ожидание
log_info "5. Ожидание инициализации (50 сек)..."
sleep 50

# 6. Проверка
log_info "6. Проверка статуса..."
ssh_exec "
    echo '=== DOCKER PS ==='
    docker ps | grep 999-multibots
    echo ''
    echo '=== ЛОГИ (последние 50 строк) ==='
    docker logs 999-multibots --tail 50 2>&1 | tail -25
"

# 7. Проверка API
log_info "7. Проверка API..."
ssh_exec "
    echo '=== API HEALTH ==='
    curl -s http://localhost:3000/health && echo '✅ API РАБОТАЕТ!' || echo '❌ API НЕ РАБОТАЕТ'
    echo ''
    echo '=== WEBHOOK ==='
    curl -s http://localhost/api/telegram/ai-reels-callback && echo '✅ WEBHOOK РАБОТАЕТ!' || echo '❌ WEBHOOK НЕ РАБОТАЕТ'
"

echo ""
echo "=================================================================="
log_success "ПРОВЕРКА ЗАВЕРШЕНА"
echo "=================================================================="
echo ""
