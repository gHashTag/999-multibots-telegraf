#!/bin/bash

# Emoji для логов
INFO="ℹ️"
SUCCESS="✅"
ERROR="❌"
START="🚀"
END="🏁"

echo "$START Checking ports availability..."

# Запускаем тест на проверку портов
npx tsx src/test-utils/tests/system/portValidator.test.ts

# Проверяем код возврата
if [ $? -eq 0 ]; then
    echo "$SUCCESS All ports are available!"
    exit 0
else
    echo "$ERROR Some ports are in use. Please check the logs above."
    exit 1
fi 