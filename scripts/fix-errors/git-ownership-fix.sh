#!/bin/bash

# Git Ownership Fix Script
# Fixes issues with "dubious ownership" in Git repositories

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}====== Git Repository Ownership Fix ======${NC}"
echo "Дата запуска: $(date)"
echo ""

# Check if we're root
if [ "$(id -u)" != "0" ]; then
   echo -e "${RED}Этот скрипт должен быть запущен с правами root${NC}" 
   exit 1
fi

# Set repository path
REPO_PATH=${1:-"/opt/app/999-multibots-telegraf"}

# Check if repository exists
if [ ! -d "$REPO_PATH" ]; then
    echo -e "${RED}Репозиторий не найден по пути: $REPO_PATH${NC}"
    exit 1
fi

echo -e "${BLUE}Исправление прав доступа для репозитория: $REPO_PATH${NC}"

# Fix Git ownership issues
git config --global --add safe.directory $REPO_PATH
echo -e "${GREEN}✓ Репозиторий добавлен в список безопасных директорий${NC}"

# Check Git status
cd $REPO_PATH
if git status > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Git работает корректно с репозиторием${NC}"
else
    echo -e "${RED}✗ Все еще есть проблемы с Git. Выполните эти команды вручную:${NC}"
    echo "   git config --global --add safe.directory $REPO_PATH"
    echo "   cd $REPO_PATH && git status"
fi

echo ""
echo -e "${BLUE}Выполнение git pull для проверки...${NC}"
if git pull; then
    echo -e "${GREEN}✓ Git pull выполнен успешно${NC}"
else
    echo -e "${RED}✗ Есть проблемы с git pull. Проверьте вручную.${NC}"
fi

echo ""
echo -e "${GREEN}====== Процесс завершен ======${NC}"
echo "Для проверки выполните: cd $REPO_PATH && git status"
echo "" 