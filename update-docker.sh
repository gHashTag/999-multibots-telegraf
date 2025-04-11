#!/bin/bash

# Остановить все текущие контейнеры
echo "🔄 Останавливаем текущие контейнеры..."
docker compose down

# Пересобрать образы и запустить ВСЕ сервисы
echo "🔨 Собираем и запускаем все сервисы..."
docker compose up --build -d

# Дожидаемся запуска (можно улучшить проверкой)
echo "⏳ Ждем запуска контейнеров (10 секунд)..."
sleep 10

# Обновляем IP-адреса в конфигурации Nginx
echo "🔄 Обновляем IP-адреса в конфигурации Nginx..."
./update-nginx-config.sh

# Проверяем статус вебхуков
echo "🔍 Проверяем статус вебхуков..."
BOT_TOKEN=$(grep BOT_TOKEN_1 .env | cut -d '=' -f2)
if [ -n "$BOT_TOKEN" ]; then
  curl -s https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo | grep -v token
else
  echo "⚠️ Не удалось получить BOT_TOKEN_1 из .env"
fi

echo "🎉 Развертывание успешно завершено." 