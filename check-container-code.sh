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
log_info "🔍 ПРОВЕРКА КОДА В КОНТЕЙНЕРЕ"
echo "=================================================================="
echo ""

# Извлекаем контейнер и смотрим registerCommands.js
log_info "1. Проверка registerCommands.js внутри образа..."
ssh_exec "
    docker create --name temp-check 999-agents-telegraf:latest
    docker export temp-check | tar -xO app/dist/registerCommands.js | grep -A 5 -B 5 'voiceAvatarWizard' | head -30
    docker rm temp-check
"

# Также проверим строки 130-145
log_info "2. Проверка строк 130-145..."
ssh_exec "
    docker create --name temp-check2 999-agents-telegraf:latest
    docker export temp-check2 | tar -xO app/dist/registerCommands.js | sed -n '130,145p'
    docker rm temp-check2
"

# Проверим исходный TypeScript файл
log_info "3. Проверка исходного TypeScript на сервере..."
ssh_exec "
    cd /root/999-agents-telegraf
    sed -n '135,145p' src/registerCommands.ts
"

echo ""
echo "=================================================================="
echo ""
