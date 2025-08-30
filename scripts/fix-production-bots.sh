#!/bin/bash

# 🔧 СКРИПТ ВОССТАНОВЛЕНИЯ PRODUCTION БОТОВ
# Запуск: ssh -i ~/.ssh/selectel root@185.161.67.53 'bash -s' < scripts/fix-production-bots.sh

set -e

echo "======================================"
echo "🚀 ВОССТАНОВЛЕНИЕ PRODUCTION БОТОВ"
echo "======================================"

cd /root/999-agents-telegraf

# 1. Обновление кода
echo -e "\n📦 Обновление кода из production..."
git fetch origin
git checkout production
git pull origin production

# 2. Установка зависимостей
echo -e "\n📦 Установка зависимостей..."
npm install --production

# 3. Сборка проекта
echo -e "\n🏗️ Сборка проекта..."
npm run build:prod

# 4. Остановка старых процессов
echo -e "\n🛑 Остановка старых процессов..."
pm2 stop bot-farm || true
pm2 delete bot-farm || true

# 5. Запуск ботов
echo -e "\n🚀 Запуск ботов через PM2..."
pm2 start dist/index.js --name bot-farm --max-memory-restart 2G

# 6. Установка вебхуков
echo -e "\n🔗 Установка вебхуков..."
node scripts/setup-webhooks.js

# 7. Сохранение PM2 конфигурации
echo -e "\n💾 Сохранение PM2 конфигурации..."
pm2 save
pm2 startup

# 8. Проверка статуса
echo -e "\n✅ Проверка статуса..."
pm2 status
pm2 logs bot-farm --lines 20 --nostream

echo -e "\n======================================"
echo "✅ ВОССТАНОВЛЕНИЕ ЗАВЕРШЕНО!"
echo "======================================"