#!/bin/bash

# 🚀 Remote Deploy Script для bot-farm
# Выполняется на удаленном сервере

set -e

echo "🚀 Remote Deploy для bot-farm"
echo "============================="

# Переходим в директорию проекта
cd /root/999-agents-vibecoder/services/bot-farm

echo "📂 Переходим в директорию: $(pwd)"

# Проверяем Git статус
echo "🔍 Проверяем Git статус..."
git status

# Переключаемся на production ветку
echo "🔄 Переключаемся на production ветку..."
git checkout production
git pull origin production

# Проверяем, что мы на правильной ветке
echo "✅ Текущая ветка: $(git branch --show-current)"

# Останавливаем старый контейнер
echo "🛑 Останавливаем старый контейнер..."
docker stop 999-multibots 2>/dev/null || echo "Контейнер не был запущен"
docker rm 999-multibots 2>/dev/null || echo "Контейнер не существовал"

# Удаляем старый образ
echo "🗑️ Удаляем старый образ..."
docker rmi 999-agents-vibecoder_app 2>/dev/null || echo "Образ не существовал"

# Собираем новый образ
echo "🔨 Собираем новый образ..."
docker build -t 999-agents-vibecoder_app .

# Запускаем новый контейнер
echo "🚀 Запускаем новый контейнер..."
docker run -d \
  --name 999-multibots \
  --env-file .env \
  -e NODE_ENV=production \
  -p 2999:2999 \
  -p 3000:3000 \
  -p 3001:3001 \
  -p 3002:3002 \
  -p 3003:3003 \
  -p 3004:3004 \
  -p 3005:3005 \
  -p 3006:3006 \
  -p 3007:3007 \
  -p 3008:3008 \
  -p 3009:3009 \
  -p 3010:3010 \
  --restart unless-stopped \
  999-agents-vibecoder_app

# Проверяем статус
echo "📊 Проверяем статус контейнера..."
sleep 5
docker ps | grep 999-multibots

echo "✅ Деплой завершен!"
echo "📋 Логи контейнера:"
docker logs --tail 20 999-multibots
