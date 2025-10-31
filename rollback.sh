#!/bin/bash

################################################################################
# 🔄 ROLLBACK СКРИПТ ДЛЯ 999-AGENTS-TELEGRAF
# Быстрый откат к предыдущей версии
# Использование: ./rollback.sh [имя_снапшота]
################################################################################

set -e

# Конфигурация
CONTAINER_NAME="999-multibots"
SERVER_URL="212.86.115.30"
SERVER_USER="root"
SSH_KEY="~/.ssh/zomro"

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Функция выполнения SSH команды
ssh_exec() {
    ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_URL "$1"
}

echo -e "${YELLOW}=== ROLLBACK TOOL ===${NC}"
echo ""

# Если указан снапшот - используем его
if [ -n "$1" ]; then
    SNAPSHOT="$1"
    echo -e "${GREEN}Откат к снапшоту:${NC} $SNAPSHOT"
else
    # Показываем список доступных снапшотов
    echo -e "${YELLOW}Доступные снапшоты:${NC}"
    ssh_exec "ls -lh /root/docker-snapshot-*.tar.gz 2>/dev/null | awk '{print \$9, \$5}' || echo 'Снапшоты не найдены'"
    echo ""
    read -p "Введите имя снапшота (prod-stable-YYYYMMDD_HHMMSS): " SNAPSHOT
fi

if [ -z "$SNAPSHOT" ]; then
    echo -e "${RED}Снапшот не указан!${NC}"
    echo "Использование: ./rollback.sh <snapshot_name>"
    exit 1
fi

echo ""
echo -e "${YELLOW}1. Остановка контейнера...${NC}"
ssh_exec "
    docker stop $CONTAINER_NAME 2>/dev/null || true
    docker rm $CONTAINER_NAME 2>/dev/null || true
    echo 'Контейнер остановлен'
"

echo -e "${YELLOW}2. Загрузка снапшота...${NC}"
ssh_exec "
    cd /root
    if [ -f 'docker-snapshot-${SNAPSHOT}.tar.gz' ]; then
        docker load < docker-snapshot-${SNAPSHOT}.tar.gz
        echo 'Снапшот загружен'
    else
        echo 'Снапшот НЕ НАЙДЕН: docker-snapshot-${SNAPSHOT}.tar.gz'
        exit 1
    fi
"

echo -e "${YELLOW}3. Запуск контейнера...${NC}"
ssh_exec "
    docker run -d \
      --name $CONTAINER_NAME \
      --restart unless-stopped \
      -p 2999-3010:2999-3010 \
      999-agents-telegraf:latest

    echo 'Контейнер запущен'
    sleep 20

    echo ''
    echo '=== СТАТУС ==='
    docker ps --format 'table {{.Names}}\t{{.Status}}'
    echo ''
    echo '=== БОТЫ ==='
    docker logs $CONTAINER_NAME 2>&1 | grep 'Бот.*инициализирован' | wc -l
    echo ''
    echo '=== API ==='
    curl -s http://localhost:3000/health || echo 'API недоступен'
"

echo ""
echo -e "${GREEN}=== ROLLBACK ЗАВЕРШЁН ===${NC}"
