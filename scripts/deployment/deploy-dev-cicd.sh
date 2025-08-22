#!/bin/bash

# ========================================
# Deploy DEV Environment (CICD Branch)
# ========================================
# Деплой dev-окружения на ветку CICD
# Сервер: 999-multibots-dev-u14194.vm.elestio.app

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Deploy DEV Environment (CICD)       ${NC}"
echo -e "${BLUE}========================================${NC}"

# Проверяем SSH ключ
if [ ! -f ~/.ssh/id_rsa ]; then
    echo -e "${RED}❌ SSH ключ не найден: ~/.ssh/id_rsa${NC}"
    exit 1
fi

DEV_SERVER="root@999-multibots-dev-u14194.vm.elestio.app"
TARGET_BRANCH="cicd"

echo -e "${YELLOW}🚀 Начинаю деплой на DEV сервер...${NC}"
echo -e "${BLUE}Сервер: $DEV_SERVER${NC}"
echo -e "${BLUE}Ветка: $TARGET_BRANCH${NC}"

# Проверяем подключение к серверу
echo -e "${YELLOW}📡 Проверяю подключение к серверу...${NC}"
if ! ssh -o ConnectTimeout=10 -i ~/.ssh/id_rsa $DEV_SERVER "echo 'Connection OK'"; then
    echo -e "${RED}❌ Не удается подключиться к серверу $DEV_SERVER${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Подключение к серверу успешно${NC}"

# Деплой на сервер
ssh -i ~/.ssh/id_rsa $DEV_SERVER << 'ENDSSH'
set -e

echo "🔄 Обновляю код на сервере..."

# Переходим в рабочую директорию
cd /opt/999-multibots-telegraf

# Переключаемся на ветку cicd
echo "📦 Переключаюсь на ветку cicd..."
git fetch origin
git checkout cicd
git pull origin cicd

# Останавливаем контейнеры если запущены
echo "🛑 Останавливаю старые контейнеры..."
docker-compose -f deployment/docker/docker-compose.dev.yml down --remove-orphans || true

# Пересобираем образы
echo "🔨 Пересобираю Docker образы..."
docker-compose -f deployment/docker/docker-compose.dev.yml build --no-cache

# Запускаем новые контейнеры
echo "🚀 Запускаю новые контейнеры..."
docker-compose -f deployment/docker/docker-compose.dev.yml up -d

# Ждем запуска
echo "⏳ Жду запуска сервисов..."
sleep 15

# Проверяем статус
echo "📊 Проверяю статус сервисов..."
docker-compose -f deployment/docker/docker-compose.dev.yml ps

echo "✅ Деплой завершен!"
ENDSSH

if [ $? -eq 0 ]; then
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✅ DEV окружение успешно развернуто!    ${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo -e "${BLUE}🌐 URL: https://999-multibots-dev-u14194.vm.elestio.app${NC}"
    echo -e "${BLUE}🌿 Ветка: cicd${NC}"
    echo -e "${BLUE}🏷️  Окружение: development${NC}"
else
    echo -e "${RED}❌ Ошибка при деплое${NC}"
    exit 1
fi