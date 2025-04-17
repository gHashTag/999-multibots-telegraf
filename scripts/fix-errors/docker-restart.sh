#!/bin/bash

# Docker Restart Script
# Перезапускает контейнеры Docker проекта NeuroBlogger

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}====== Docker Restart Script ======${NC}"
echo "Дата запуска: $(date)"
echo ""

# Check if we're root
if [ "$(id -u)" != "0" ]; then
   echo -e "${RED}Этот скрипт должен быть запущен с правами root${NC}" 
   exit 1
fi

# Set project path
PROJECT_PATH=${1:-"/opt/app/999-multibots-telegraf"}

# Check if project exists
if [ ! -d "$PROJECT_PATH" ]; then
    echo -e "${RED}Проект не найден по пути: $PROJECT_PATH${NC}"
    exit 1
fi

# Move to project directory
cd $PROJECT_PATH
echo -e "${BLUE}Текущая директория: $(pwd)${NC}"

# Check for docker-compose
if ! command -v docker-compose &> /dev/null; then
    if command -v docker &> /dev/null && docker compose version &> /dev/null; then
        echo -e "${YELLOW}Используется docker compose вместо docker-compose${NC}"
        DOCKER_COMPOSE="docker compose"
    else
        echo -e "${RED}docker-compose не найден!${NC}"
        exit 1
    fi
else
    DOCKER_COMPOSE="docker-compose"
fi

# Check current docker containers
echo -e "${BLUE}Проверка текущих контейнеров...${NC}"
$DOCKER_COMPOSE ps
echo ""

# Ask for confirmation
read -p "Вы уверены, что хотите перезапустить контейнеры? (y/n): " CONFIRM
if [[ $CONFIRM != "y" && $CONFIRM != "Y" ]]; then
    echo -e "${YELLOW}Операция отменена.${NC}"
    exit 0
fi

# Stop containers
echo -e "${BLUE}Останавливаем контейнеры...${NC}"
$DOCKER_COMPOSE down
if [ $? -ne 0 ]; then
    echo -e "${RED}Ошибка при остановке контейнеров!${NC}"
    exit 1
fi
echo -e "${GREEN}Контейнеры остановлены.${NC}"

# Pull latest changes
echo -e "${BLUE}Получение последних изменений...${NC}"
git pull
if [ $? -ne 0 ]; then
    echo -e "${YELLOW}Предупреждение: не удалось получить последние изменения из Git.${NC}"
    echo -e "${YELLOW}Возможно, есть проблемы с правами Git. Запустите scripts/fix-errors/git-ownership-fix.sh${NC}"
fi

# Start containers
echo -e "${BLUE}Запускаем контейнеры...${NC}"
if [[ -n $2 && $2 == "--no-build" ]]; then
    echo -e "${YELLOW}Запуск без пересборки образов...${NC}"
    $DOCKER_COMPOSE up -d
else
    echo -e "${YELLOW}Запуск с пересборкой образов...${NC}"
    $DOCKER_COMPOSE up --build -d
fi

if [ $? -ne 0 ]; then
    echo -e "${RED}Ошибка при запуске контейнеров!${NC}"
    exit 1
fi

echo -e "${GREEN}Контейнеры запущены.${NC}"

# Check status
echo -e "${BLUE}Проверка статуса контейнеров...${NC}"
$DOCKER_COMPOSE ps

# Show logs
echo -e "${BLUE}Показать логи? (y/n): ${NC}"
read SHOW_LOGS

if [[ $SHOW_LOGS == "y" || $SHOW_LOGS == "Y" ]]; then
    echo -e "${BLUE}Вывод последних 100 строк логов...${NC}"
    $DOCKER_COMPOSE logs --tail=100
    
    echo -e "${BLUE}Следить за логами в реальном времени? (y/n): ${NC}"
    read FOLLOW_LOGS
    
    if [[ $FOLLOW_LOGS == "y" || $FOLLOW_LOGS == "Y" ]]; then
        $DOCKER_COMPOSE logs -f
    fi
fi

echo ""
echo -e "${GREEN}====== Перезапуск Docker завершен ======${NC}"
echo "" 