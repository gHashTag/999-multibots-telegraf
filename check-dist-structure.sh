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
log_info "🔍 ПРОВЕРКА СТРУКТУРЫ DIST"
echo "=================================================================="
echo ""

# Создаем тестовый контейнер и проверяем dist
log_info "1. Проверка структуры dist в образе..."
ssh_exec "
    cd /root/999-agents-telegraf
    docker create --name test-dist 999-agents-telegraf:latest
    echo '=== ФАЙЛЫ В ROOT КОНТЕЙНЕРА ==='
    docker export test-dist | tar -xO app/ | head -20
    echo ''
    echo '=== ФАЙЛЫ В APP/DIST ==='
    docker export test-dist | tar -xO app/dist/ | head -30
    echo ''
    echo '=== ПРОВЕРКА index.js ==='
    docker export test-dist | tar -xO app/dist/index.js | head -10 || echo 'index.js НЕ НАЙДЕН в dist/'
    docker rm test-dist
"

# Проверяем TypeScript конфигурацию
log_info "2. Проверка tsconfig.json..."
ssh_exec "
    cd /root/999-agents-telegraf
    grep -A 5 '\"outDir\"' tsconfig.json || echo 'outDir не найден'
    echo ''
    grep -A 5 '\"rootDir\"' tsconfig.json || echo 'rootDir не найден'
"

# Проверяем package.json scripts
log_info "3. Проверка scripts в package.json..."
ssh_exec "
    cd /root/999-agents-telegraf
    grep -A 3 '\"build' package.json || echo 'build scripts не найдены'
"

echo ""
echo "=================================================================="
echo ""
