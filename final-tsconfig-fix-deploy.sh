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
log_info "🚀 ФИНАЛЬНЫЙ ДЕПЛОЙ: ИСПРАВЛЕНИЕ tsconfig.json"
echo "=================================================================="
echo ""

# 1. Обновление кода
log_info "1. Обновление кода..."
ssh_exec "
    cd /root/999-agents-telegraf
    git pull origin temp-fix
    echo '=== ТЕКУЩИЙ КОММИТ ==='
    git log --oneline -1
    echo ''
    echo '=== ПРОВЕРКА rootDir ==='
    grep '\"rootDir\"' tsconfig.json
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

# 4. Проверка структуры dist
log_info "4. Проверка структуры dist в образе..."
ssh_exec "
    cd /root/999-agents-telegraf
    docker create --name test-final 999-agents-telegraf:latest
    echo '=== НАЛИЧИЕ dist/index.js ==='
    docker export test-final | tar -xO app/dist/index.js | head -5 && echo '✅ dist/index.js НАЙДЕН' || echo '❌ dist/index.js НЕ НАЙДЕН'
    echo ''
    echo '=== СПИСОК ФАЙЛОВ В dist ==='
    docker export test-final | tar -xO app/dist/ | grep '\.js$' | head -15
    docker rm test-final
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
log_info "6. Ожидание инициализации (50 сек)..."
sleep 50

# 7. Проверка статуса
log_info "7. Проверка статуса..."
ssh_exec "
    echo '=== DOCKER PS ==='
    docker ps | grep 999-multibots
    echo ''
    echo '=== ЛОГИ (последние 50 строк) ==='
    docker logs 999-multibots --tail 50 2>&1 | tail -25
"

# 8. Проверка API
log_info "8. Проверка API..."
ssh_exec "
    echo '=== API HEALTH ==='
    curl -s http://localhost:3000/health && echo '✅ API РАБОТАЕТ!' || echo '❌ API НЕ РАБОТАЕТ'
    echo ''
    echo '=== WEBHOOK GET ==='
    curl -s http://localhost/api/telegram/ai-reels-callback && echo '✅ WEBHOOK РАБОТАЕТ!' || echo '❌ WEBHOOK НЕ РАБОТАЕТ'
    echo ''
    echo '=== WEBHOOK POST ==='
    curl -X POST http://localhost/api/telegram/ai-reels-callback \
      -H 'Content-Type: application/json' \
      -d '{\"test\":\"success\",\"job_id\":\"final-success\"}' \
      -s && echo '✅ WEBHOOK POST РАБОТАЕТ!' || echo '❌ WEBHOOK POST НЕ РАБОТАЕТ'
"

# 9. Внешний доступ
log_info "9. Проверка внешнего доступа..."
ssh_exec "
    echo '=== EXTERNAL WEBHOOK ==='
    curl -s http://three-head-dragon.shop/api/telegram/ai-reels-callback && echo '✅ EXTERNAL РАБОТАЕТ!' || echo '❌ EXTERNAL НЕ РАБОТАЕТ'
"

echo ""
echo "=================================================================="
log_success "ФИНАЛЬНЫЙ ДЕПЛОЙ ЗАВЕРШЕН!"
echo "=================================================================="
echo ""
echo "РЕЗУЛЬТАТ:"
echo "- Контейнер: docker ps | grep 999-multibots"
echo "- Логи: docker logs 999-multibots -f"
echo "- API: curl http://localhost:3000/health"
echo "- Webhook: curl http://localhost/api/telegram/ai-reels-callback"
echo "- Внешний: curl http://three-head-dragon.shop/api/telegram/ai-reels-callback"
echo ""
echo "🎉 ЕСЛИ ВСЁ РАБОТАЕТ - БОТЫ ДОЛЖНЫ ОТВЕЧАТЬ НА /start!"
echo ""
