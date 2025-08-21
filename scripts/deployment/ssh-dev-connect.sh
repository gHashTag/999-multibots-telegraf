#!/bin/bash

# ========================================
# SSH Connect to DEV Server (CICD Branch)
# ========================================
# Подключение к dev-серверу по SSH

set -e

# Цвета для вывода
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

DEV_SERVER="root@999-multibots-dev-u14194.vm.elestio.app"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   SSH подключение к DEV серверу        ${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${YELLOW}🌐 Сервер: $DEV_SERVER${NC}"
echo -e "${YELLOW}🌿 Ветка: cicd${NC}"
echo -e "${YELLOW}🏷️  Окружение: development${NC}"
echo -e "${BLUE}========================================${NC}"

# Проверяем SSH ключ
if [ ! -f ~/.ssh/id_rsa ]; then
    echo -e "${RED}❌ SSH ключ не найден: ~/.ssh/id_rsa${NC}"
    exit 1
fi

echo -e "${GREEN}🔑 Подключаюсь к серверу...${NC}"
echo -e "${BLUE}💡 Команда: ssh -i ~/.ssh/id_rsa $DEV_SERVER${NC}"

# Подключаемся к серверу
ssh -i ~/.ssh/id_rsa $DEV_SERVER