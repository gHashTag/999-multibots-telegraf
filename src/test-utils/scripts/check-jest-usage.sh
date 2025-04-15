#!/bin/bash

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "🔍 Проверяем файлы на использование Jest..."

# Ищем использование Jest в файлах
JEST_USAGE=$(find . -type f -name "*.ts" -o -name "*.js" | xargs grep -l "jest\.")

if [ -n "$JEST_USAGE" ]; then
    echo -e "${RED}❌ Найдено использование Jest в следующих файлах:${NC}"
    echo "$JEST_USAGE"
    exit 1
else
    echo -e "${GREEN}✅ Jest не используется в проекте${NC}"
    exit 0
fi 