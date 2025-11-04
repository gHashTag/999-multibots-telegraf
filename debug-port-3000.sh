#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

SERVER_URL="212.86.115.30"
SERVER_USER="root"
SSH_KEY="~/.ssh/zomro"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }

ssh_exec() {
    ssh -i $SSH_KEY $SERVER_USER@$SERVER_URL "$1"
}

echo ""
echo "=================================================================="
echo "🔍 ДИАГНОСТИКА ПОРТА 3000"
echo "=================================================================="
echo ""

# Проверка Docker процессов
log_info "1. Docker процессы..."
ssh_exec "
    docker ps -a
"

# Проверка процессов на порту 3000
log_info "2. Процессы на порту 3000 (через ss)..."
ssh_exec "
    ss -tlnp | grep 3000 || echo 'Порт 3000 свободен'
    echo ''
    ss -tlnp | grep ':3000' || echo 'Не найдено'
"

# Проверка что в контейнерах
log_info "3. Логи контейнеров..."
ssh_exec "
    echo '=== LOGS 999-multibots (последние 30 строк) ==='
    docker logs 999-multibots 2>&1 | tail -30 || echo 'Контейнер не существует'
    echo ''
    echo '=== LOGS bot-proxy (последние 10 строк) ==='
    docker logs bot-proxy 2>&1 | tail -10 || echo 'Контейнер не существует'
"

# Проверка статуса
log_info "4. Статус Docker..."
ssh_exec "
    docker info | grep -E 'Server Version|Storage Driver'
"

echo ""
echo "=================================================================="
echo "РЕЗУЛЬТАТ ДИАГНОСТИКИ"
echo "=================================================================="
echo ""
