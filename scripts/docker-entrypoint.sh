#!/bin/sh

# Docker Entrypoint для Bot Farm
echo "🚀 Bot Farm Docker Entrypoint Starting..."

# Проверяем наличие .env файла
if [ ! -f .env ]; then
    echo "⚠️  .env файл не найден, создаем базовый..."
    touch .env
fi

# Устанавливаем права на .ssh директорию
if [ -d .ssh ]; then
    chmod 700 .ssh
    chown -R node:node .ssh 2>/dev/null || true
fi

# Проверяем наличие dist директории
if [ ! -d dist ]; then
    echo "⚠️  dist директория не найдена, пытаемся собрать проект..."
    npm run build:nocheck || echo "❌ Сборка не удалась, используем исходный код"
fi

# Проверяем наличие основного файла
if [ -f dist/bot.js ]; then
    echo "✅ Запускаем собранное приложение: dist/bot.js"
    exec node dist/bot.js
elif [ -f index.js ]; then
    echo "✅ Запускаем исходное приложение: index.js"
    exec node index.js
else
    echo "❌ Не найден файл для запуска (ни dist/bot.js, ни index.js)"
    exit 1
fi

