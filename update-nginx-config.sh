#!/bin/bash

# Скрипт для обновления IP-адресов в конфигурации Nginx после перезапуска контейнеров

# Получаем IP-адрес основного контейнера с ботами
APP_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 999-multibots)

if [ -z "$APP_IP" ]; then
  echo "❌ Ошибка: Не удалось получить IP-адрес контейнера 999-multibots"
  exit 1
fi

echo "✅ IP-адрес контейнера 999-multibots: $APP_IP"

# Путь к конфигурации Nginx
NGINX_CONFIG_PATH="/opt/app/999-multibots-telegraf/nginx-config/default.conf"

if [ ! -f "$NGINX_CONFIG_PATH" ]; then
  echo "❌ Ошибка: Файл конфигурации $NGINX_CONFIG_PATH не найден"
  exit 1
fi

# Обновляем IP-адрес в конфигурации
echo "🔄 Обновляем IP-адрес в конфигурации Nginx..."
sed -i "s|http://[0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:|http://$APP_IP:|g" $NGINX_CONFIG_PATH

echo "✅ Конфигурация обновлена"

# Перезапускаем Nginx
echo "🔄 Перезапускаем Nginx..."
docker restart bot-proxy

echo "✅ Готово! Конфигурация обновлена и Nginx перезапущен."
echo "📝 Проверьте статус вебхуков:"
echo "   curl -s https://api.telegram.org/bot\$BOT_TOKEN/getWebhookInfo" 