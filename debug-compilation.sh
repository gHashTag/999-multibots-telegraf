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
log_info "🔍 ДИАГНОСТИКА КОМПИЛЯЦИИ"
echo "=================================================================="
echo ""

# Проверяем TypeScript исходники
log_info "1. Проверка src/index.ts..."
ssh_exec "
    cd /root/999-agents-telegraf
    ls -la src/index.ts 2>/dev/null && echo '✅ src/index.ts СУЩЕСТВУЕТ' || echo '❌ src/index.ts НЕ НАЙДЕН'
    echo ''
    head -10 src/index.ts 2>/dev/null || echo 'НЕ УДАЛОСЬ ПРОЧИТАТЬ'
"

# Ручная компиляция на сервере
log_info "2. Ручная компиляция TypeScript..."
ssh_exec "
    cd /root/999-agents-telegraf
    npx tsc --skipLibCheck --skipDefaultLibCheck --noEmitOnError false 2>&1 | tail -20
"

# Проверяем что создалось
log_info "3. Проверка созданных файлов..."
ssh_exec "
    cd /root/999-agents-telegraf
    echo '=== ФАЙЛЫ В ROOT ==='
    ls -la *.js *.ts 2>/dev/null | head -10
    echo ''
    echo '=== ФАЙЛЫ В DIST ==='
    ls -la dist/ 2>/dev/null | head -15
    echo ''
    echo '=== dist/index.js ==='
    ls -la dist/index.js 2>/dev/null && echo '✅ НАЙДЕН' || echo '❌ НЕ НАЙДЕН'
"

# Проверяем содержимое директорий
log_info "4. Проверка структуры..."
ssh_exec "
    cd /root/999-agents-telegraf
    find . -name 'index.*' -type f 2>/dev/null | head -15
"

echo ""
echo "=================================================================="
echo ""
