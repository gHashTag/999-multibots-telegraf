#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }

SERVER_URL="212.86.115.30"
SERVER_USER="root"
SSH_KEY="~/.ssh/zomro"

ssh_exec() {
    ssh -i $SSH_KEY $SERVER_USER@$SERVER_URL "$1"
}

echo ""
echo "=================================================================="
log_info "🔧 ИСПРАВЛЕНИЕ voiceAvatarWizard НА ПРОДАКШН"
echo "=================================================================="
echo ""

# 1. На сервере переключаемся на reels-callback-1
log_info "1. Переключение на reels-callback-1 на сервере..."
ssh_exec "
    cd /root/999-agents-telegraf
    git fetch origin reels-callback-1
    git checkout -b temp-fix origin/reels-callback-1
    echo 'Переключен на reels-callback-1'
"

# 2. Удаляем старый контейнер
log_info "2. Удаление старого контейнера..."
ssh_exec "
    docker stop 999-multibots 2>/dev/null || true
    docker rm 999-multibots 2>/dev/null || true
    echo 'Контейнер удален'
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
log_info "5. Ожидание инициализации (30 сек)..."
sleep 30

# 6. Проверка
log_info "6. Проверка статуса..."
ssh_exec "
    echo '=== DOCKER PS ==='
    docker ps | grep 999-multibots
    echo ''
    echo '=== ЛОГИ ==='
    docker logs 999-multibots --tail 20 2>&1
"

log_info "7. Проверка API..."
ssh_exec "
    curl -s http://localhost:3000/health || echo 'API НЕ РАБОТАЕТ'
    echo ''
    curl -s http://localhost/api/telegram/ai-reels-callback || echo 'WEBHOOK НЕ РАБОТАЕТ'
"

echo ""
echo "=================================================================="
log_success "ГОТОВО!"
echo "=================================================================="
echo ""
