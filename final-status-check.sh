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
log_info "🔍 ФИНАЛЬНАЯ ПРОВЕРКА СТАТУСА"
echo "=================================================================="
echo ""

# 1. Статус контейнера
log_info "1. Статус контейнера (5 раз)..."
for i in {1..5}; do
    ssh_exec "
        docker ps | grep 999-multibots
    " | grep -v "Restarting" && log_success "КОНТЕЙНЕР РАБОТАЕТ!" || log_warning "Попытка $i: Перезапуск..."
    sleep 2
done

# 2. Проверка API несколько раз
log_info "2. Проверка API (3 раза)..."
for i in {1..3}; do
    log_info "Попытка $i:"
    ssh_exec "
        curl -s http://localhost:3000/health
    " | grep -q "UP" && log_success "✅ API РАБОТАЕТ!" || log_warning "❌ API НЕ ОТВЕЧАЕТ"
    sleep 3
done

# 3. Проверка ботов
log_info "3. Проверка ботов (инициализация)..."
ssh_exec "
    docker logs 999-multibots | grep -i 'инициализирован' | tail -10
" | wc -l | awk '{if ($1 > 0) print "✅ ИНИЦИАЛИЗИРОВАНО БОТОВ: " $1; else print "❌ БОТЫ НЕ ИНИЦИАЛИЗИРОВАНЫ"}'

# 4. Проверка webhook
log_info "4. Проверка webhook (2 раза)..."
for i in {1..2}; do
    ssh_exec "
        curl -s http://localhost/api/telegram/ai-reels-callback
    " | grep -q "status" && log_success "✅ WEBHOOK РАБОТАЕТ!" || log_warning "❌ WEBHOOK НЕ РАБОТАЕТ"
    sleep 2
done

# 5. Проверка портов
log_info "5. Проверка открытых портов..."
ssh_exec "
    ss -tlnp | grep -E ':(3000|2999|3010)' | head -5
" | grep -q "3000" && log_success "✅ ПОРТ 3000 ОТКРЫТ" || log_error "❌ ПОРТ 3000 ЗАКРЫТ"

# 6. Последние логи (ошибки)
log_info "6. Последние 30 строк логов..."
ssh_exec "
    docker logs 999-multibots --tail 30 2>&1 | tail -10
"

echo ""
echo "=================================================================="
log_info "ПРОВЕРКА ЗАВЕРШЕНА"
echo "=================================================================="
echo ""
echo "ИТОГОВЫЙ СТАТУС:"
ssh_exec "
    echo 'Контейнер:'
    docker ps | grep 999-multibots
    echo ''
    echo 'API:'
    curl -s http://localhost:3000/health 2>/dev/null || echo '❌ Не работает'
    echo ''
    echo 'Ботов инициализировано:'
    docker logs 999-multibots 2>&1 | grep -c 'инициализирован' 2>/dev/null || echo '0'
"
echo ""
