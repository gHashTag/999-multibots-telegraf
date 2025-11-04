#!/bin/bash

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

SERVER_URL="212.86.115.30"
SERVER_USER="root"
SSH_KEY="~/.ssh/zomro"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

ssh_exec() {
    ssh -i $SSH_KEY $SERVER_USER@$SERVER_URL "$1"
}

echo ""
echo "=================================================================="
log_info "ПРИНУДИТЕЛЬНЫЙ ЗАПУСК КОНТЕЙНЕРА"
echo "=================================================================="
echo ""

# Удаляем "созданный" контейнер
log_info "1. Удаление неработающего контейнера..."
ssh_exec "
    docker rm -f 999-multibots 2>/dev/null || true
    echo 'Контейнер удален'
"

# Проверяем образ
log_info "2. Проверка Docker образа..."
ssh_exec "
    docker images | grep 999-agents-telegraf
"

# Запускаем контейнер с подробным логированием
log_info "3. Запуск контейнера..."
ssh_exec "
    docker run -d \
      --name 999-multibots \
      --restart unless-stopped \
      -p 3000:3000 \
      -p 2999-3010:2999-3010 \
      -p 4000:4000 \
      -v /root/999-agents-telegraf/.env:/app/.env:ro \
      999-agents-telegraf:latest 2>&1
"

sleep 5

# Проверяем статус
log_info "4. Проверка статуса контейнера..."
ssh_exec "
    docker ps -a
"

# Смотрим логи сразу
log_info "5. Логи запуска..."
ssh_exec "
    sleep 3
    docker logs 999-multibots --tail 50 2>&1
"

# Проверяем порты
log_info "6. Проверка портов..."
ssh_exec "
    ss -tlnp | grep 3000 || echo 'Порт 3000 НЕ открыт'
    echo ''
    docker port 999-multibots || echo 'Порты не проброшены'
"

# Финальная проверка
log_info "7. Проверка API..."
ssh_exec "
    echo '=== API HEALTH ==='
    curl -s http://localhost:3000/health || echo 'API НЕ ОТВЕЧАЕТ'
    echo ''
    echo '=== WEBHOOK ==='
    curl -s http://localhost/api/telegram/ai-reels-callback || echo 'WEBHOOK НЕ ОТВЕЧАЕТ'
"

echo ""
echo "=================================================================="
log_success "ЗАВЕРШЕНО"
echo "=================================================================="
echo ""
