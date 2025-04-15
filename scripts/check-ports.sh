#!/bin/bash

# Определение цветов для эмоционального вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Функция проверки порта
check_port() {
    local port=$1
    if lsof -i :$port > /dev/null 2>&1; then
        echo -e "${RED}❌ Порт $port занят${NC}"
        return 1
    else
        echo -e "${GREEN}✅ Порт $port свободен${NC}"
        return 0
    fi
}

# Список портов для проверки
PORTS=(2999 3001 8288)

echo -e "${YELLOW}🔍 Проверяю доступность портов...${NC}"

# Флаг для отслеживания общего результата
ALL_PORTS_FREE=true

# Проверяем каждый порт
for port in "${PORTS[@]}"; do
    if ! check_port $port; then
        ALL_PORTS_FREE=false
    fi
done

# Выводим итоговый результат
if [ "$ALL_PORTS_FREE" = true ]; then
    echo -e "${GREEN}✨ Все порты свободны${NC}"
    exit 0
else
    echo -e "${RED}⚠️ Некоторые порты заняты${NC}"
    exit 1
fi