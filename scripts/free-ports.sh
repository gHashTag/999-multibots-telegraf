#!/bin/bash

# Emoji для логов
INFO="ℹ️"
SUCCESS="✅"
ERROR="❌"
START="🚀"
END="🏁"
WARN="⚠️"

echo "$START Checking and freeing ports if needed..."

# Функция для освобождения порта
free_port() {
    local port=$1
    local pid=$(lsof -ti :$port)
    if [ ! -z "$pid" ]; then
        echo "$WARN Port $port is in use by process $pid. Attempting to free it..."
        kill -9 $pid
        if [ $? -eq 0 ]; then
            echo "$SUCCESS Successfully freed port $port"
        else
            echo "$ERROR Failed to free port $port"
            return 1
        fi
    fi
    return 0
}

# Массив портов из конфигурации
PORTS=(8288 8289 3000 54321 54323)

# Проходим по всем портам
for port in "${PORTS[@]}"; do
    free_port $port
done

# Запускаем проверку портов
./scripts/check-ports.sh

# Проверяем результат
if [ $? -eq 0 ]; then
    echo "$SUCCESS All ports are now available!"
    exit 0
else
    echo "$ERROR Failed to free all ports. Please check manually."
    exit 1
fi 