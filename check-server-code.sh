#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
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
log_info "🔍 ПРОВЕРКА КОДА НА СЕРВЕРЕ"
echo "=================================================================="
echo ""

# Проверяем ветку
log_info "1. Проверка ветки..."
ssh_exec "
    cd /root/999-agents-telegraf
    git branch
    echo ''
    git log --oneline -3
"

# Проверяем содержимое registerCommands.ts (строка 138)
log_info "2. Проверка registerCommands.ts (строки 135-140)..."
ssh_exec "
    cd /root/999-agents-telegraf
    sed -n '135,140p' src/registerCommands.ts
"

# Проверяем скомпилированный файл
log_info "3. Проверка скомпилированного registerCommands.js..."
ssh_exec "
    cd /root/999-agents-telegraf
    grep -A 2 -B 2 'voiceAvatarWizard' dist/registerCommands.js || echo 'Не найдено в dist'
"

# Проверяем есть ли файл в репозитории
log_info "4. Проверка файлов в dist..."
ssh_exec "
    cd /root/999-agents-telegraf
    ls -lh dist/registerCommands.js
"

echo ""
echo "=================================================================="
echo ""
