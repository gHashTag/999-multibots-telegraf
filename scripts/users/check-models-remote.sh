#!/bin/bash
# 🔍 УДОБНЫЙ СКРИПТ ДЛЯ ПРОВЕРКИ МОДЕЛЕЙ ПОЛЬЗОВАТЕЛЯ НА PRODUCTION
#
# Использование:
# ./scripts/users/check-models-remote.sh <telegram_id>
#
# Пример:
# ./scripts/users/check-models-remote.sh 5439920152

set -e

TELEGRAM_ID=${1:-5439920152}
SERVER="root@188.137.250.69"
PROJECT_DIR="/root/999-agents-telegraf"
CONTAINER="999-multibots"

echo "🚀 Проверяю модели пользователя $TELEGRAM_ID на production сервере..."
echo ""

# Копируем скрипт на сервер
echo "📦 Копирую скрипт на сервер..."
scp -q scripts/users/check-models-prod.js ${SERVER}:${PROJECT_DIR}/scripts/users/

# Выполняем скрипт в Docker контейнере
echo "🔍 Выполняю проверку..."
echo ""

ssh ${SERVER} "docker exec ${CONTAINER} node ${PROJECT_DIR}/scripts/users/check-models-prod.js ${TELEGRAM_ID}"

echo ""
echo "✅ Проверка завершена!"
