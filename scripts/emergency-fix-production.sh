#!/bin/bash

# 🚨 ЭКСТРЕННОЕ ВОССТАНОВЛЕНИЕ PRODUCTION
# Запуск локально: bash scripts/emergency-fix-production.sh

set -e

echo "======================================"
echo "🚨 ЭКСТРЕННОЕ ВОССТАНОВЛЕНИЕ БОТОВ"
echo "======================================"

# 1. Коммит и пуш изменений
echo -e "\n📦 Отправка изменений в production..."
git add -A
git commit -m "fix: emergency bot restoration - fix invalid tokens and webhooks" || true
git push origin neuro-photo-2-2:production --force

# 2. SSH команды для восстановления
echo -e "\n🔧 Запуск восстановления на сервере..."

ssh -i ~/.ssh/selectel root@185.161.67.53 << 'ENDSSH'
set -e

echo "📍 Подключен к серверу three-head-dragon"

cd /root/999-agents-telegraf

# Обновление кода
echo "📦 Получение последних изменений..."
git fetch origin
git checkout production
git reset --hard origin/production

# Копирование .env из основной папки если нужно
if [ ! -f .env ]; then
    echo "⚠️ .env не найден, копирую из бэкапа..."
    cp /root/.env.backup .env 2>/dev/null || echo "❌ Бэкап .env не найден"
fi

# Установка зависимостей
echo "📦 Установка зависимостей..."
npm install --production

# Сборка
echo "🏗️ Сборка проекта..."
npm run build:prod

# Остановка и запуск
echo "🔄 Перезапуск PM2..."
pm2 stop bot-farm || true
pm2 delete bot-farm || true
pm2 start dist/index.js --name bot-farm --max-memory-restart 2G

# Установка вебхуков
echo "🔗 Установка вебхуков..."
if [ -f scripts/setup-webhooks.js ]; then
    node scripts/setup-webhooks.js
else
    echo "⚠️ Скрипт вебхуков не найден, пропускаю..."
fi

# Сохранение
pm2 save
pm2 startup || true

# Финальная проверка
echo -e "\n✅ Проверка статуса:"
pm2 list
pm2 logs bot-farm --lines 30 --nostream

echo "======================================"
echo "✅ ВОССТАНОВЛЕНИЕ ЗАВЕРШЕНО!"
echo "======================================"
ENDSSH

echo -e "\n🎉 Все операции завершены успешно!"
echo "📊 Проверить статус: ssh -i ~/.ssh/selectel root@185.161.67.53 'pm2 list'"
echo "📝 Смотреть логи: ssh -i ~/.ssh/selectel root@185.161.67.53 'pm2 logs bot-farm'"