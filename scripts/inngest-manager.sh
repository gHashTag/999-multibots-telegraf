#!/bin/bash

# 🎛️ INNGEST DEV SERVER MANAGER
# Священный скрипт для управления единым Inngest Dev Server
# 🕉️ "सर्वे भवन्तु सुखिनः" - "Пусть все существа будут счастливы"

INNGEST_PORT=8288
INNGEST_URL="http://localhost:$INNGEST_PORT"

# Цвета для красивого вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Функция проверки сервера
check_inngest_server() {
    curl -s --max-time 3 "$INNGEST_URL" > /dev/null 2>&1
    return $?
}

# Функция проверки health endpoint
check_inngest_health() {
    local response
    response=$(curl -s --max-time 3 "$INNGEST_URL/health" 2>/dev/null)
    if [[ "$response" == *"OK"* ]] || [[ "$response" == *"status"* ]]; then
        return 0
    else
        return 1
    fi
}

# Функция запуска сервера
start_inngest_server() {
    echo -e "${BLUE}🚀 Запускаем Inngest Dev Server на порту $INNGEST_PORT...${NC}"

    # Запускаем в фоне с правильными параметрами
    nohup npx inngest-cli@latest dev --port $INNGEST_PORT > /dev/null 2>&1 &
    local inngest_pid=$!

    # Ждем запуска с таймаутом
    local timeout=15
    local counter=0

    while [ $counter -lt $timeout ]; do
        if check_inngest_server || check_inngest_health; then
            echo -e "${GREEN}✅ Inngest Dev Server запущен успешно (PID: $inngest_pid)${NC}"
            return 0
        fi
        sleep 1
        counter=$((counter + 1))
        echo -n "."
    done

    echo -e "\n${RED}❌ Не удалось запустить Inngest Dev Server за $timeout секунд${NC}"
    return 1
}

# Основная логика
main() {
    echo -e "${BLUE}🎛️  === INNGEST DEV SERVER MANAGER ===${NC}"
    echo -e "${BLUE}🔧 Проверяем единый сервер на $INNGEST_URL${NC}"

    # Сначала проверяем простую доступность
    if check_inngest_server; then
        echo -e "${GREEN}✅ Inngest Dev Server найден на $INNGEST_URL${NC}"

        # Дополнительно проверяем health
        if check_inngest_health; then
            echo -e "${GREEN}💚 Health check пройден${NC}"
        else
            echo -e "${YELLOW}⚠️  Сервер найден, но health check не прошел${NC}"
        fi

    else
        echo -e "${YELLOW}⚠️  Inngest Dev Server не найден${NC}"

        # Проверяем, не занят ли порт другим процессом
        if lsof -i :$INNGEST_PORT > /dev/null 2>&1; then
            echo -e "${YELLOW}⚠️  Порт $INNGEST_PORT занят другим процессом${NC}"
            echo -e "${BLUE}🔍 Процессы на порту $INNGEST_PORT:${NC}"
            lsof -i :$INNGEST_PORT | head -5
        fi

        # Пытаемся запустить
        if start_inngest_server; then
            echo -e "${GREEN}🎉 Новый Inngest Dev Server успешно запущен${NC}"
        else
            echo -e "${RED}💥 Не удалось запустить Inngest Dev Server${NC}"
            exit 1
        fi
    fi

    # Экспортируем переменную окружения
    export INNGEST_DEV_SERVER_URL=$INNGEST_URL
    echo -e "${GREEN}🔧 INNGEST_DEV_SERVER_URL=$INNGEST_DEV_SERVER_URL${NC}"

    # Финальная проверка
    echo -e "${BLUE}🎯 Финальная проверка доступности...${NC}"
    if check_inngest_server && check_inngest_health; then
        echo -e "${GREEN}✅ Inngest Dev Server готов к работе!${NC}"
        echo -e "${GREEN}🎛️  Dashboard: $INNGEST_URL${NC}"
        echo -e "${BLUE}🤖 Все агенты могут подключаться к $INNGEST_URL${NC}"
    else
        echo -e "${RED}❌ Проблемы с финальной проверкой Inngest Dev Server${NC}"
        exit 1
    fi
}

# Функция для использования в других скриптах
ensure_inngest_server() {
    if ! check_inngest_server; then
        start_inngest_server
    fi
    export INNGEST_DEV_SERVER_URL=$INNGEST_URL
}

# Если скрипт запущен напрямую, выполняем основную логику
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
