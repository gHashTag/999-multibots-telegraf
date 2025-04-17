#!/bin/bash

# Скрипт для исправления переменной ELESTIO_URL в .env файле

# Устанавливаем цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Путь к файлу .env
ENV_FILE="/opt/app/999-multibots-telegraf/.env"

# Проверяем существование файла .env
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}Ошибка: Файл .env не найден по пути $ENV_FILE${NC}"
    exit 1
fi

# Проверяем наличие переменной ELESTIO_URL в файле .env
if grep -q "ELESTIO_URL=" "$ENV_FILE"; then
    current_url=$(grep "ELESTIO_URL=" "$ENV_FILE" | cut -d "=" -f2)
    echo -e "${BLUE}Текущее значение ELESTIO_URL:${NC} $current_url"
    
    # Проверяем, пустое ли значение или указан example.com
    if [ -z "$current_url" ] || [ "$current_url" = "https://example.com" ] || [ "$current_url" = "" ]; then
        echo -e "${YELLOW}ELESTIO_URL имеет неправильное или пустое значение. Обновляем...${NC}"
        need_update=true
    else
        echo -e "${GREEN}ELESTIO_URL уже имеет допустимое значение. Проверяем доступность...${NC}"
        # Проверяем доступность сервера
        if curl -s --head "$current_url" > /dev/null; then
            echo -e "${GREEN}Сервер доступен!${NC}"
            exit 0
        else
            echo -e "${YELLOW}Сервер недоступен. Обновляем URL...${NC}"
            need_update=true
        fi
    fi
else
    echo -e "${YELLOW}ELESTIO_URL не найден в файле .env. Добавляем...${NC}"
    need_update=true
fi

# Если нужно обновление, добавляем или обновляем переменную
if [ "$need_update" = true ]; then
    # Новое значение для ELESTIO_URL
    NEW_ELESTIO_URL="https://ai-server-u14194.vm.elestio.app"
    
    # Создаем бэкап файла .env
    cp "$ENV_FILE" "${ENV_FILE}.bak"
    echo -e "${BLUE}Создан бэкап файла ${ENV_FILE}.bak${NC}"
    
    # Проверяем, существует ли строка ELESTIO_URL в файле
    if grep -q "ELESTIO_URL=" "$ENV_FILE"; then
        # Если существует, обновляем значение
        sed -i "s|ELESTIO_URL=.*|ELESTIO_URL=$NEW_ELESTIO_URL|" "$ENV_FILE"
    else
        # Если не существует, добавляем новую строку
        echo "" >> "$ENV_FILE"
        echo "ELESTIO_URL=$NEW_ELESTIO_URL" >> "$ENV_FILE"
    fi
    
    echo -e "${GREEN}ELESTIO_URL успешно обновлен до $NEW_ELESTIO_URL${NC}"
    
    # Проверяем доступность нового сервера
    if curl -s --head "$NEW_ELESTIO_URL" > /dev/null; then
        echo -e "${GREEN}Новый сервер доступен!${NC}"
    else
        echo -e "${YELLOW}Предупреждение: Новый сервер недоступен. Проверьте подключение или URL.${NC}"
    fi
    
    echo -e "${BLUE}Перезапустите Docker-контейнер для применения изменений:${NC}"
    echo "cd /opt/app/999-multibots-telegraf && docker-compose down && docker-compose up --build -d"
fi

exit 0 