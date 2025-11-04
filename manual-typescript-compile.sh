#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }

SERVER_URL="212.86.115.30"
SERVER_USER="root"
SSH_KEY="~/.ssh/zomro"

ssh_exec() {
    ssh -i $SSH_KEY $SERVER_USER@$SERVER_URL "$1"
}

echo ""
echo "=================================================================="
log_info "🔧 УСТАНОВКА TYPESCRIPT И КОМПИЛЯЦИЯ ВРУЧНУЮ"
echo "=================================================================="
echo ""

# 1. Установка TypeScript
log_info "1. Установка TypeScript..."
ssh_exec "
    cd /root/999-agents-telegraf
    npm install -g typescript --legacy-peer-deps
    echo 'TypeScript установлен'
"

# 2. Компиляция
log_info "2. Компиляция TypeScript..."
ssh_exec "
    cd /root/999-agents-telegraf
    tsc --skipLibCheck --skipDefaultLibCheck --noEmitOnError false 2>&1 | tail -30
"

# 3. Проверка результата
log_info "3. Проверка созданных файлов..."
ssh_exec "
    cd /root/999-agents-telegraf
    echo '=== СОЗДАНАЛИ dist/ ==='
    ls -la dist/ 2>/dev/null | head -15 || echo 'dist/ НЕ СОЗДАНА'
    echo ''
    echo '=== dist/index.js ==='
    ls -la dist/index.js 2>/dev/null && echo '✅ НАЙДЕН' || echo '❌ НЕ НАЙДЕН'
"

# 4. Также проверим есть ли src/index.js в dist
log_info "4. Проверка src/index.js в dist..."
ssh_exec "
    cd /root/999-agents-telegraf
    ls -la dist/src/index.js 2>/dev/null && echo 'НАЙДЕН в dist/src/' || echo 'НЕ НАЙДЕН в dist/src/'
"

# 5. Создание symlink или копирование
log_info "5. Копирование dist/src/index.js в dist/index.js..."
ssh_exec "
    cd /root/999-agents-telegraf
    if [ -f dist/src/index.js ]; then
        cp dist/src/index.js dist/index.js
        echo '✅ СКОПИРОВАНО dist/src/index.js → dist/index.js'
    else
        echo '❌ ИСХОДНЫЙ ФАЙЛ НЕ НАЙДЕН'
    fi
"

# 6. Финальная проверка
log_info "6. Финальная проверка..."
ssh_exec "
    cd /root/999-agents-telegraf
    ls -la dist/index.js 2>/dev/null && echo '✅ dist/index.js ГОТОВ' || echo '❌ dist/index.js НЕ ГОТОВ'
"

echo ""
echo "=================================================================="
log_success "КОМПИЛЯЦИЯ ЗАВЕРШЕНА"
echo "=================================================================="
echo ""
