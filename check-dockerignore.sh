#!/bin/bash

BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }

SERVER_URL="212.86.115.30"
SERVER_USER="root"
SSH_KEY="~/.ssh/zomro"

ssh_exec() {
    ssh -i $SSH_KEY $SERVER_USER@$SERVER_URL "$1"
}

echo ""
echo "=================================================================="
log_info "🔍 ПРОВЕРКА .dockerignore и build контекста"
echo "=================================================================="
echo ""

# Проверяем .dockerignore
log_info "1. Проверка .dockerignore на сервере..."
ssh_exec "
    cd /root/999-agents-telegraf
    cat .dockerignore 2>/dev/null || echo '❌ .dockerignore НЕ НАЙДЕН'
"

# Проверяем что есть в build контексте
log_info "2. Список файлов в build контексте..."
ssh_exec "
    cd /root/999-agents-telegraf
    docker build --help | grep -A 5 'context'
    echo ''
    echo 'ФАЙЛЫ В ТЕКУЩЕЙ ДИРЕКТОРИИ:'
    ls -la | grep -E '^d|dist'
"

# Проверяем содержимое dist
log_info "3. Проверка dist/ на сервере..."
ssh_exec "
    cd /root/999-agents-telegraf
    echo 'СОДЕРЖИМОЕ dist/:'
    ls -la dist/ 2>/dev/null || echo 'dist/ НЕ НАЙДЕН НА ХОСТЕ'
"

echo ""
echo "=================================================================="
echo ""
