#!/bin/bash

# Telegram Bot Token Validator
# Проверяет валидность токенов Telegram ботов

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}====== Telegram Bot Token Validator ======${NC}"
echo "Дата запуска: $(date)"
echo ""

# Set project path
PROJECT_PATH=${1:-"$PWD"}
ENV_FILE="${PROJECT_PATH}/.env"

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}Файл .env не найден по пути: $ENV_FILE${NC}"
    exit 1
fi

# Function to validate token
validate_token() {
    local token=$1
    local name=$2
    
    echo -e "${BLUE}Проверка токена для бота $name...${NC}"
    
    # Check token format (very basic check)
    if [[ ! $token =~ ^[0-9]+:[A-Za-z0-9_-]+$ ]]; then
        echo -e "${RED}✗ Токен имеет неверный формат${NC}"
        return 1
    fi
    
    # Extract bot ID
    local bot_id=${token%%:*}
    
    # Query Telegram API
    local response=$(curl -s "https://api.telegram.org/bot$token/getMe")
    
    # Check if the request was successful
    if [[ $response == *"\"ok\":true"* ]]; then
        # Extract bot username
        local username=$(echo $response | grep -o '"username":"[^"]*"' | cut -d'"' -f4)
        echo -e "${GREEN}✓ Токен действителен. Бот: @$username (ID: $bot_id)${NC}"
        return 0
    else
        local error=$(echo $response | grep -o '"description":"[^"]*"' | cut -d'"' -f4)
        echo -e "${RED}✗ Токен недействителен: $error${NC}"
        return 1
    fi
}

# Extract tokens from .env file
echo -e "${BLUE}Анализ файла .env...${NC}"
valid_count=0
invalid_count=0

for i in {1..7}; do
    TOKEN_VAR="BOT_TOKEN_$i"
    TOKEN_VALUE=$(grep "^$TOKEN_VAR=" $ENV_FILE | cut -d'=' -f2)
    
    if [ -n "$TOKEN_VALUE" ]; then
        if validate_token "$TOKEN_VALUE" "bot$i"; then
            valid_count=$((valid_count+1))
        else
            invalid_count=$((invalid_count+1))
            echo -e "${YELLOW}⚠️ Требуется обновление токена для $TOKEN_VAR${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️ Токен $TOKEN_VAR не настроен в .env${NC}"
    fi
    echo ""
done

# Summary
echo -e "${BLUE}====== Результаты проверки ======${NC}"
echo -e "Валидных токенов: ${GREEN}$valid_count${NC}"
echo -e "Невалидных токенов: ${RED}$invalid_count${NC}"
echo ""

if [ $invalid_count -gt 0 ]; then
    echo -e "${YELLOW}Рекомендации:${NC}"
    echo "1. Для получения нового токена используйте @BotFather в Telegram"
    echo "2. Обновите соответствующие токены в файле .env"
    echo "3. Перезапустите боты: scripts/fix-errors/docker-restart.sh"
fi

echo -e "${GREEN}====== Проверка токенов завершена ======${NC}"
echo "" 