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
log_info "🚀 ФИНАЛЬНЫЙ ДЕПЛОЙ ИСПРАВЛЕНИЙ НА ПРОДАКШН"
echo "=================================================================="
echo ""

# 1. Pull нового коммита
log_info "1. Обновление кода на сервере..."
ssh_exec "
    cd /root/999-agents-telegraf
    git pull origin temp-fix
    echo 'Код обновлен до коммита:'
    git log --oneline -1
"

# 2. Удаление старого контейнера
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
    docker build --no-cache -t 999-agents-telegraf:latest . 2>&1 | tail -15
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

# 6. Проверка статуса
log_info "6. Проверка статуса..."
ssh_exec "
    echo '=== DOCKER PS ==='
    docker ps | grep 999-multibots
    echo ''
    echo '=== ЛОГИ (последние 50 строк) ==='
    docker logs 999-multibots --tail 50 2>&1 | tail -30
"

# 7. Проверка API
log_info "7. Проверка API и webhook..."
ssh_exec "
    echo '=== API HEALTH ==='
    curl -s http://localhost:3000/health || echo 'API НЕ РАБОТАЕТ'
    echo ''
    echo '=== WEBHOOK GET ==='
    curl -s http://localhost/api/telegram/ai-reels-callback || echo 'WEBHOOK НЕ РАБОТАЕТ'
    echo ''
    echo '=== WEBHOOK POST ==='
    curl -X POST http://localhost/api/telegram/ai-reels-callback \
      -H 'Content-Type: application/json' \
      -d '{\"test\":\"final\",\"job_id\":\"final-test\"}' \
      -s || echo 'WEBHOOK POST НЕ РАБОТАЕТ'
"

# 8. Проверка внешнего доступа
log_info "8. Проверка внешнего доступа..."
ssh_exec "
    echo '=== EXTERNAL WEBHOOK ==='
    curl -s http://three-head-dragon.shop/api/telegram/ai-reels-callback || echo 'EXTERNAL НЕ РАБОТАЕТ'
"

echo ""
echo "=================================================================="
log_success "ДEПЛОЙ ЗАВЕРШЕН!"
echo "=================================================================="
echo ""
echo "РЕЗУЛЬТАТ:"
echo "- Статус: docker ps | grep 999-multibots"
echo "- Логи: docker logs 999-multibots -f"
echo "- API: curl http://localhost:3000/health"
echo "- Webhook: curl http://localhost/api/telegram/ai-reels-callback"
echo "- Внешний: curl http://three-head-dragon.shop/api/telegram/ai-reels-callback"
echo ""
