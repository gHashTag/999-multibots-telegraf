#!/bin/bash

# Автоматическая синхронизация .env файла
SOURCE_ENV="/Users/playra/999-agents-telegraf/.env"
TARGET_ENV="/Users/playra/999-agents-telegraf/worktrees/veo-3/.env"

# Проверка существования исходного файла
if [ -f "$SOURCE_ENV" ]; then
    cp "$SOURCE_ENV" "$TARGET_ENV"
    
    # Добавляем TEST_BOT_NAME если его нет
    if ! grep -q "^TEST_BOT_NAME=" "$TARGET_ENV"; then
        echo -e "\nTEST_BOT_NAME=neuro_blogger_bot" >> "$TARGET_ENV"
    fi
    
    echo "✅ .env файл синхронизирован из $SOURCE_ENV"
else
    echo "❌ Исходный .env файл не найден: $SOURCE_ENV"
    exit 1
fi