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
log_error "🚨 ЭКСТРЕННАЯ ПРОВЕРКА ПРОДАКШЕН СЕРВЕРА"
echo "=================================================================="
echo ""

# 1. Проверка доступности
log_info "1. Проверка доступности сервера..."
if ssh_exec "echo 'OK'" >/dev/null 2>&1; then
    log_success "Сервер доступен"
else
    log_error "Сервер НЕ ДОСТУПЕН!"
    exit 1
fi

# 2. Статус контейнеров
log_info "2. Статус контейнеров..."
ssh_exec "
    echo '=== DOCKER PS ==='
    docker ps -a
    echo ''
    echo '=== DOCKER SERVICES ==='
    systemctl status docker --no-pager -l | head -20
"

# 3. Логи (последние строки)
log_info "3. Последние логи..."
ssh_exec "
    echo '=== ПОСЛЕДНИЕ 50 СТРОК ЛОГОВ ==='
    docker logs 999-multibots 2>&1 | tail -50 || echo 'Логи недоступны'
"

# 4. Проверка процессов
log_info "4. Процессы на порту 3000..."
ssh_exec "
    ss -tlnp | grep 3000 || echo 'Порт 3000 НЕ ОТКРЫТ'
    echo ''
    ps aux | grep -E 'node|999' | grep -v grep || echo 'Node процессы не найдены'
"

# 5. Проверка endpoint'ов
log_info "5. Проверка endpoint'ов..."
ssh_exec "
    echo '=== API HEALTH ==='
    curl -s http://localhost:3000/health || echo 'API НЕ РАБОТАЕТ'
    echo ''
    echo '=== WEBHOOK ==='
    curl -s http://localhost/api/telegram/ai-reels-callback || echo 'WEBHOOK НЕ РАБОТАЕТ'
"

# 6. Проверка nginx
log_info "6. Проверка nginx..."
ssh_exec "
    echo '=== NGINX STATUS ==='
    docker ps | grep bot-proxy || echo 'Nginx НЕ ЗАПУЩЕН'
    echo ''
    docker logs bot-proxy 2>&1 | tail -10 || echo 'Nginx логи недоступны'
"

echo ""
echo "=================================================================="
log_info "ПРОВЕРКА ЗАВЕРШЕНА"
echo "=================================================================="
echo ""

echo "СЛЕДУЮЩИЕ ШАГИ:"
echo "1. Если контейнеры остановлены - запуск:"
echo "   ssh root@212.86.115.30"
echo "   cd /root/999-agents-telegraf"
echo "   ./emergency-restore.sh"
echo ""
echo "2. Проверка логов:"
echo "   docker logs 999-multibots -f"
echo ""
echo "3. Перезапуск если нужно:"
echo "   docker restart 999-multibots"
echo "   docker restart bot-proxy"
echo ""
