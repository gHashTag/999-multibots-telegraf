#!/bin/bash

# Цвета для вывода
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Конфигурация
SERVER="root@999-multibots-u14194.vm.elestio.app"
SSH_KEY="~/.ssh/id_rsa"
REMOTE_DIR="/opt/app/999-multibots-telegraf"

echo -e "${BLUE}🚀 Начинаю процесс деплоя...${NC}"

# Отправляем изменения в GitHub
echo -e "${BLUE}📤 Отправляем изменения в GitHub...${NC}"
git push origin main
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Ошибка при отправке изменений в GitHub${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Изменения успешно отправлены в GitHub${NC}"

# Подключаемся к серверу и выполняем команды
ssh -i $SSH_KEY $SERVER << 'ENDSSH'
    echo "📥 Переходим в директорию проекта..."
    cd /opt/app/999-multibots-telegraf

    echo "🔄 Переключаемся на ветку main..."
    git checkout main

    echo "⬇️ Получаем последние изменения из main..."
    git fetch origin main
    git reset --hard origin/main

    echo "🔄 Перезапускаем контейнеры..."
    docker compose down
    docker compose up --build -d

    echo "✅ Проверяем статус контейнеров..."
    docker compose ps
ENDSSH

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Ошибка при деплое на сервер${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Деплой успешно завершен!${NC}" 