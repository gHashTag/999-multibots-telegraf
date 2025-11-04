#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

SERVER_URL="212.86.115.30"
SERVER_USER="root"
SSH_KEY="~/.ssh/zomro"

ssh_exec() {
    ssh -i $SSH_KEY $SERVER_USER@$SERVER_URL "$1"
}

echo ""
echo "=================================================================="
log_info "🚨 ДЕПЛОЙ ИСПРАВЛЕНИЯ voiceAvatarWizard"
echo "=================================================================="
echo ""

# 1. Push в remote
log_info "1. Push исправления в remote..."
git push origin reels-callback-1

# 2. Обновление кода на production
log_info "2. Обновление кода на production..."
ssh_exec "
    cd /root/999-agents-telegraf
    git fetch origin reels-callback-1
    git reset --hard origin/reels-callback-1
    echo 'Код обновлен'
"

# 3. Удаление старого контейнера
log_info "3. Удаление старого контейнера..."
ssh_exec "
    docker stop 999-multibots 2>/dev/null || true
    docker rm 999-multibots 2>/dev/null || true
    echo 'Контейнер удален'
"

# 4. Пересборка образа
log_info "4. Пересборка образа..."
ssh_exec "
    cd /root/999-agents-telegraf
    docker build --no-cache -t 999-agents-telegraf:latest . 2>&1 | tail -10
"

# 5. Запуск контейнера
log_info "5. Запуск контейнера..."
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

# 6. Ожидание
log_info "6. Ожидание инициализации (30 сек)..."
sleep 30

# 7. Проверка статуса
log_info "7. Проверка статуса..."
ssh_exec "
    echo '=== DOCKER PS ==='
    docker ps | grep 999-multibots
    echo ''
    echo '=== ЛОГИ (последние 30 строк) ==='
    docker logs 999-multibots --tail 30 2>&1
"

# 8. Проверка API
log_info "8. Проверка API..."
ssh_exec "
    echo '=== API HEALTH ==='
    curl -s http://localhost:3000/health || echo 'API НЕ РАБОТАЕТ'
    echo ''
    echo '=== WEBHOOK ==='
    curl -s http://localhost/api/telegram/ai-reels-callback || echo 'WEBHOOK НЕ РАБОТАЕТ'
"

echo ""
echo "=================================================================="
log_success "ДЕПЛОЙ ЗАВЕРШЕН"
echo "=================================================================="
echo ""
echo "РЕЗУЛЬТАТ:"
echo "1. Статус контейнера: docker ps | grep 999-multibots"
echo "2. Логи: docker logs 999-multibots -f"
echo "3. API: curl http://localhost:3000/health"
echo "4. Webhook: curl http://localhost/api/telegram/ai-reels-callback"
echo ""
