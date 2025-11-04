#!/bin/bash

RED='\033[0;31m'
BLUE='\033[0;34m'
GREEN='\033[0;32m'
NC='\033[0m'

SERVER_URL="212.86.115.30"
SERVER_USER="root"
SSH_KEY="~/.ssh/zomro"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

ssh_exec() {
    ssh -i $SSH_KEY $SERVER_USER@$SERVER_URL "$1"
}

echo ""
echo "=================================================================="
log_info "ГЛУБОКАЯ ДИАГНОСТИКА"
echo "=================================================================="
echo ""

# 1. Все процессы на 3000
log_info "1. Поиск ВСЕХ процессов на порту 3000..."
ssh_exec "
    lsof -i :3000 2>/dev/null || echo 'lsof не найден'
    echo ''
    fuser -v 3000/tcp 2>/dev/null || echo 'fuser не нашел процессы'
    echo ''
    ps aux | grep 3000 | grep -v grep || echo 'Процессы 3000 не найдены'
"

# 2. Проверка .env файла
log_info "2. Проверка .env файла..."
ssh_exec "
    echo 'Размер .env:'
    ls -lh /root/999-agents-telegraf/.env
    echo ''
    echo 'Первые 10 строк .env:'
    head -10 /root/999-agents-telegraf/.env 2>/dev/null || echo '.env не найден'
"

# 3. Проверка ENOSPC и диска
log_info "3. Проверка места на диске..."
ssh_exec "
    df -h
    echo ''
    echo 'Inodes:'
    df -i
"

# 4. Все контейнеры и их ошибки
log_info "4. ВСЕ контейнеры (включая остановленные)..."
ssh_exec "
    docker ps -a --no-trunc
"

# 5. Docker networks
log_info "5. Docker сети..."
ssh_exec "
    docker network ls
    echo ''
    docker network inspect bridge 2>/dev/null | grep -A 20 'Containers' || echo 'bridge network empty'
"

# 6. Попытка запуска без портов для теста
log_info "6. Тестовый запуск БЕЗ портов (проверка ошибок)..."
ssh_exec "
    docker run --rm --name test-999 \
      -v /root/999-agents-telegraf/.env:/app/.env:ro \
      999-agents-telegraf:latest \
      node -e 'console.log(\"Test OK\"); process.exit(0)' 2>&1 | head -20
"

echo ""
echo "=================================================================="
echo "ДИАГНОСТИКА ЗАВЕРШЕНА"
echo "=================================================================="
echo ""
