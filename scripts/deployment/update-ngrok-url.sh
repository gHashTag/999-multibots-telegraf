#!/bin/bash

# 🔄 Скрипт для быстрого обновления ngrok URL в .env
# Использование: ./scripts/update-ngrok-url.sh https://новый-url.ngrok.app

if [ -z "$1" ]; then
    echo "❌ Укажи новый ngrok URL!"
    echo "📝 Использование: $0 https://новый-url.ngrok.app"
    exit 1
fi

NEW_URL="$1"

# Удаляем http:// или https:// и добавляем https://
CLEAN_URL=$(echo "$NEW_URL" | sed 's|^https\?://||')
FINAL_URL="https://$CLEAN_URL"

echo "🔄 Обновляем ngrok URL..."
echo "📋 Старый URL: $(grep 'LOCAL_SERVER_URL' .env | cut -d'=' -f2)"
echo "📋 Новый URL: $FINAL_URL"

# Обновляем .env файл
sed -i '' "s|LOCAL_SERVER_URL=.*|LOCAL_SERVER_URL=$FINAL_URL|" .env

# Проверяем что обновилось
UPDATED_URL=$(grep 'LOCAL_SERVER_URL' .env | cut -d'=' -f2)
if [ "$UPDATED_URL" = "$FINAL_URL" ]; then
    echo "✅ URL успешно обновлен в .env!"
    echo "🚀 Теперь запусти: ./scripts/restart-with-ngrok.sh"
else
    echo "❌ Ошибка обновления URL!"
    exit 1
fi 