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
log_error "🚨 ЭКСТРЕННОЕ ВОССТАНОВЛЕНИЕ ПРОДАКШЕН"
echo "=================================================================="
echo ""

# 1. Остановка всех процессов на порту 3000
log_info "1. Остановка всех процессов на порту 3000..."
ssh_exec "
    # Найти и убить все node процессы на порту 3000
    fuser -k 3000/tcp 2>/dev/null || true
    sleep 2
    
    # Убить все node процессы связанные с рендер-сервером
    pkill -9 -f 'render-server.js' 2>/dev/null || true
    pkill -9 -f 'node src/server' 2>/dev/null || true
    
    # Проверить что порт свободен
    ss -tlnp | grep 3000 || echo 'Порт 3000 свободен'
"

# 2. Удаление старого контейнера
log_info "2. Удаление старого контейнера..."
ssh_exec "
    docker stop 999-multibots 2>/dev/null || true
    docker rm 999-multibots 2>/dev/null || true
    echo 'Старый контейнер удален'
"

# 3. Обновление кода
log_info "3. Обновление кода..."
ssh_exec "
    cd /root/999-agents-telegraf
    git fetch origin production
    git reset --hard origin/production
    echo 'Код обновлен'
"

# 4. Пересборка образа
log_info "4. Пересборка образа (без кеша)..."
ssh_exec "
    cd /root/999-agents-telegraf
    docker build --no-cache -t 999-agents-telegraf:latest . 2>&1 | tail -20
"

# 5. Запуск контейнера
log_info "5. Запуск контейнера 999-multibots..."
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

# 7. Проверка
log_info "7. Проверка статуса..."
ssh_exec "
    echo '=== DOCKER PS ==='
    docker ps | grep 999-multibots
    echo ''
    echo '=== ПОРТ 3000 ==='
    ss -tlnp | grep 3000 || echo 'Порт 3000 НЕ ОТКРЫТ'
"

# 8. Логи
log_info "8. Логи запуска..."
ssh_exec "
    sleep 5
    docker logs 999-multibots --tail 30 2>&1
"

# 9. Проверка API
log_info "9. Проверка API..."
ssh_exec "
    echo '=== API HEALTH ==='
    curl -s http://localhost:3000/health || echo 'API НЕ РАБОТАЕТ'
    echo ''
    echo '=== WEBHOOK ==='
    curl -s http://localhost/api/telegram/ai-reels-callback || echo 'WEBHOOK НЕ РАБОТАЕТ'
"

# 10. Проверка внешнего доступа
log_info "10. Проверка внешнего доступа..."
ssh_exec "
    echo '=== EXTERNAL WEBHOOK ==='
    curl -s http://three-head-dragon.shop/api/telegram/ai-reels-callback || echo 'EXTERNAL НЕ РАБОТАЕТ'
"

# 11. Перезапуск nginx
log_info "11. Перезапуск nginx..."
ssh_exec "
    docker restart bot-proxy 2>/dev/null || true
    sleep 5
    docker ps | grep bot-proxy
"

echo ""
echo "=================================================================="
log_success "ВОССТАНОВЛЕНИЕ ЗАВЕРШЕНО"
echo "=================================================================="
echo ""
echo "РЕЗУЛЬТАТ:"
echo "1. Проверьте статус контейнера"
echo "2. Проверьте логи: docker logs 999-multibots -f"
echo "3. Проверьте API: curl http://localhost:3000/health"
echo "4. Проверьте webhook: curl http://localhost/api/telegram/ai-reels-callback"
echo ""
