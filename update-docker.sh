#!/bin/bash

# Остановить текущие контейнеры
echo "🔄 Останавливаем текущие контейнеры..."
docker-compose down

# Пересобрать образ
echo "🔨 Пересобираем Docker-образ..."
docker-compose build --no-cache

# Запустить контейнеры заново
echo "🚀 Запускаем контейнеры..."
docker-compose up -d

# Проверить логи для диагностики
echo "📋 Просмотр логов приложения:"
docker-compose logs -f 