#!/bin/sh

echo "🚀 Docker Entrypoint Starting..."

# Проверяем USE_ALL_BOTS_IN_POLLING переменную
if [ "$USE_ALL_BOTS_IN_POLLING" = "true" ]; then
  echo "✅ Production Polling Mode - Запускаем всех ботов в polling"
  echo "📦 Running production-bot.js"
  exec node dist/production-bot.js
else
  echo "✅ Standard Mode - Запускаем обычное приложение"
  echo "📦 Running index.js"
  exec node dist/index.js
fi
