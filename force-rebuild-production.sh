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
log_info "🔧 ПРИНУДИТЕЛЬНАЯ ПЕРЕСБОРКА С ОЧИСТКОЙ КЕША"
echo "=================================================================="
echo ""

# 1. Остановить контейнеры
log_info "1. Остановка контейнеров..."
ssh_exec "
    docker stop 999-multibots 2>/dev/null || true
    docker rm 999-multibots 2>/dev/null || true
"

# 2. Очистить Docker кеш
log_info "2. Очистка Docker кеша..."
ssh_exec "
    docker system prune -af
    docker builder prune -af
    echo 'Кеш очищен'
"

# 3. Пересборка с детальными логами
log_info "3. Пересборка образа с детальными логами..."
ssh_exec "
    cd /root/999-agents-telegraf
    echo '=== НАЧАЛО СБОРКИ ==='
    docker build --no-cache --progress=plain -t 999-agents-telegraf:latest . 2>&1 | tee /tmp/build.log | tail -50
    echo '=== КОНЕЦ СБОРКИ ==='
"

# 4. Проверить логи сборки
log_info "4. Проверка логов сборки..."
ssh_exec "
    echo '=== ПОСЛЕДНИЕ 30 СТРОК ЛОГОВ ==='
    tail -30 /tmp/build.log | grep -E '(ERROR|error|Error|TSFILE|registerCommands)' || echo 'Ошибок не найдено в логах'
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
log_info "6. Ожидание инициализации (40 сек)..."
sleep 40

# 7. Проверка
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
log_success "ПЕРЕСБОРКА ЗАВЕРШЕНА"
echo "=================================================================="
echo ""
