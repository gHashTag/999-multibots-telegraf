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
log_info "🔍 ПРОВЕРКА СКОМПИЛИРОВАННОГО КОДА С d13768c6"
echo "=================================================================="
echo ""

# Проверяем скомпилированный файл
log_info "1. Создаем тестовый контейнер и извлекаем registerCommands.js..."
ssh_exec "
    cd /root/999-agents-telegraf
    docker create --name test-extract 999-agents-telegraf:latest
    echo '=== ПОИСК New WizardScene в registerCommands.js ==='
    docker export test-extract | tar -xO app/dist/registerCommands.js | grep -n 'new.*WizardScene' | head -20 || echo 'Не найдено'
    echo ''
    echo '=== ПОИСК voiceAvatarWizard ==='
    docker export test-extract | tar -xO app/dist/registerCommands.js | grep -n 'voiceAvatarWizard' | head -10 || echo 'Не найдено'
    echo ''
    docker rm test-extract
"

# Проверяем контейнер напрямую
log_info "2. Проверяем содержимое контейнера напрямую..."
ssh_exec "
    docker exec 999-multibots ls -la /app/dist/registerCommands.js 2>/dev/null || echo 'Файл НЕ НАЙДЕН в контейнере'
    echo ''
    docker exec 999-multibots cat /app/dist/registerCommands.js | grep -n 'new.*WizardScene' | head -20 || echo 'Не найдено в контейнере'
"

# Проверяем TypeScript файл
log_info "3. Проверяем TypeScript на сервере..."
ssh_exec "
    cd /root/999-agents-telegraf
    grep -n 'new.*WizardScene' src/registerCommands.ts || echo 'Нет new WizardScene в TypeScript'
"

echo ""
echo "=================================================================="
echo ""
