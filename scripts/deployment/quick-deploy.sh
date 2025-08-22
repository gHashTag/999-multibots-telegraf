#!/bin/bash

# ========================================
# БЫСТРЫЙ ДЕПЛОЙ НА СЕРВЕРЫ
# ========================================
# Скрипт для быстрого деплоя изменений

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Показываем помощь
show_help() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}           БЫСТРЫЙ ДЕПЛОЙ              ${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo -e "${YELLOW}Использование:${NC}"
    echo "  $0 [dev|prod] [ветка]"
    echo ""
    echo -e "${YELLOW}Примеры:${NC}"
    echo "  $0 dev cicd      # Деплой ветки cicd на dev сервер"
    echo "  $0 prod main     # Деплой ветки main на prod сервер"
    echo "  $0 dev           # Деплой текущей ветки на dev"
    echo "  $0 prod          # Деплой текущей ветки на prod"
    echo ""
    echo -e "${YELLOW}Доступные окружения:${NC}"
    echo "  dev  - Development сервер (999-multibots-dev-u14194.vm.elestio.app)"
    echo "  prod - Production сервер (999-multibots-u14194.vm.elestio.app)"
    echo ""
}

# Параметры
ENVIRONMENT=${1:-""}
BRANCH=${2:-$(git branch --show-current)}

if [ -z "$ENVIRONMENT" ]; then
    show_help
    exit 1
fi

# Определяем сервер
case $ENVIRONMENT in
    "dev"|"development")
        SERVER="root@999-multibots-dev-u14194.vm.elestio.app"
        ENV_NAME="Development"
        COMPOSE_FILE="docker-compose.dev.yml"
        ;;
    "prod"|"production")
        SERVER="root@999-multibots-u14194.vm.elestio.app"
        ENV_NAME="Production"
        COMPOSE_FILE="docker-compose.yml"
        ;;
    *)
        echo -e "${RED}❌ Неизвестное окружение: $ENVIRONMENT${NC}"
        show_help
        exit 1
        ;;
esac

echo -e "${BLUE}🚀 Быстрый деплой${NC}"
echo -e "${YELLOW}Окружение: $ENV_NAME${NC}"
echo -e "${YELLOW}Сервер: $SERVER${NC}"
echo -e "${YELLOW}Ветка: $BRANCH${NC}"
echo ""

# Проверяем SSH ключ
if [ ! -f ~/.ssh/id_rsa ]; then
    echo -e "${RED}❌ SSH ключ не найден: ~/.ssh/id_rsa${NC}"
    exit 1
fi

# Проверяем подключение
echo -e "${YELLOW}📡 Проверяю подключение к серверу...${NC}"
if ! ssh -o ConnectTimeout=10 -i ~/.ssh/id_rsa $SERVER "echo 'SSH OK'" 2>/dev/null; then
    echo -e "${RED}❌ Не удается подключиться к серверу $SERVER${NC}"
    exit 1
fi
echo -e "${GREEN}✅ SSH подключение работает${NC}"

# Локальная сборка (опционально)
read -p "🔨 Выполнить локальную сборку перед деплоем? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}🔨 Выполняю локальную сборку...${NC}"
    
    if command -v bun &> /dev/null; then
        bun install
        bun run lint
        bun run typecheck
        bun run build:prod
    else
        npm ci
        npm run lint
        npm run typecheck
        npm run build:prod
    fi
    
    echo -e "${GREEN}✅ Локальная сборка завершена${NC}"
fi

# Деплой на сервер
echo -e "${YELLOW}🚀 Начинаю деплой на $ENV_NAME сервер...${NC}"

ssh -i ~/.ssh/id_rsa $SERVER << ENDSSH
set -e

echo "📦 Деплой на $ENV_NAME сервере..."
cd /opt/app/999-multibots-telegraf

# Создаем backup
echo "💾 Создаю backup..."
BACKUP_DIR="/opt/backups/\$(date +%Y%m%d_%H%M%S)"
mkdir -p \$BACKUP_DIR
if [ -d "dist" ]; then
    cp -r dist \$BACKUP_DIR/
fi
echo "Backup создан: \$BACKUP_DIR"

# Останавливаем контейнеры
echo "🛑 Останавливаю контейнеры..."
if [ -f "$COMPOSE_FILE" ]; then
    docker-compose -f $COMPOSE_FILE down --remove-orphans || true
else
    docker-compose down --remove-orphans || true
fi

# Обновляем код
echo "🔄 Обновляю код..."
git fetch origin
git checkout $BRANCH
git pull origin $BRANCH

# Проверяем и устанавливаем зависимости
if [ -f "bun.lockb" ] && command -v bun &> /dev/null; then
    echo "📦 Устанавливаю зависимости с Bun..."
    bun install
    echo "🔨 Собираю проект с Bun..."
    bun run build:prod
elif [ -f "package-lock.json" ]; then
    echo "📦 Устанавливаю зависимости с npm..."
    npm ci
    echo "🔨 Собираю проект с npm..."
    npm run build:prod
else
    echo "📦 Устанавливаю зависимости..."
    npm install
    echo "🔨 Собираю проект..."
    npm run build:prod
fi

# Проверяем сборку
if [ ! -d "dist" ]; then
    echo "❌ Ошибка сборки - директория dist не создана!"
    exit 1
fi

echo "✅ Сборка успешна, размер dist:"
du -sh dist/

# Запускаем контейнеры
echo "🚀 Запускаю контейнеры..."
if [ -f "$COMPOSE_FILE" ]; then
    docker-compose -f $COMPOSE_FILE up -d --build
else
    docker-compose up -d --build
fi

# Ждем запуска
echo "⏳ Жду запуска сервисов..."
sleep 15

# Проверяем статус
echo "📊 Проверяю статус сервисов..."
if [ -f "$COMPOSE_FILE" ]; then
    docker-compose -f $COMPOSE_FILE ps
else
    docker-compose ps
fi

# Проверяем логи
echo "📋 Последние логи:"
if [ "$ENVIRONMENT" == "dev" ]; then
    docker logs 999-multibots-dev --tail 10 || docker logs 999-multibots --tail 10
else
    docker logs 999-multibots --tail 10
fi

echo "✅ Деплой завершен успешно!"
ENDSSH

if [ $? -eq 0 ]; then
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✅ ДЕПЛОЙ УСПЕШНО ЗАВЕРШЕН!            ${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo -e "${BLUE}🌐 Сервер: $SERVER${NC}"
    echo -e "${BLUE}🌿 Ветка: $BRANCH${NC}"
    echo -e "${BLUE}🏷️  Окружение: $ENV_NAME${NC}"
    echo ""
    echo -e "${YELLOW}🔍 Проверьте работу сервиса:${NC}"
    
    if [ "$ENVIRONMENT" == "dev" ]; then
        echo -e "${BLUE}https://999-multibots-dev-u14194.vm.elestio.app${NC}"
    else
        echo -e "${BLUE}https://999-multibots-u14194.vm.elestio.app${NC}"
    fi
else
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}❌ ДЕПЛОЙ ЗАВЕРШИЛСЯ С ОШИБКОЙ!        ${NC}"
    echo -e "${RED}========================================${NC}"
    echo -e "${YELLOW}Проверьте логи на сервере для диагностики${NC}"
    exit 1
fi