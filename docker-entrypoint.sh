#!/bin/sh

# ====================================
# DOCKER ENTRYPOINT ДЛЯ TELEGRAM БОТОВ (POLLING MODE)
# ====================================

set -e

echo "======================================"
echo "🚀 ЗАПУСК TELEGRAM BOT FARM"
echo "======================================"
echo "📍 MODE: POLLING (без вебхуков)"
echo "   NODE_ENV: ${NODE_ENV:-production}"

# Запускаем основное приложение БЕЗ установки вебхуков
echo "🤖 Запуск ботов в режиме POLLING..."
exec node dist/index.js
