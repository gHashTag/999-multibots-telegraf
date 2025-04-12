#!/bin/bash

echo "=== Извлечение реального токена бота из Docker-контейнера ==="

# Переходим в директорию проекта
cd /opt/app/999-multibots-telegraf

# Получаем переменные окружения из docker-compose.yml
echo "Анализ конфигурации docker-compose.yml..."
BOT_TOKEN_ENV=$(grep -r "BOT_TOKEN=" docker-compose.yml | head -1 | cut -d= -f2- | tr -d '"' | tr -d ' ')

if [ -n "$BOT_TOKEN_ENV" ]; then
  echo "Найден токен в docker-compose.yml: $BOT_TOKEN_ENV"
else
  echo "Токен не найден в docker-compose.yml, пробуем найти в .env файле..."
  
  # Проверяем .env файл
  if [ -f ".env" ]; then
    BOT_TOKEN_ENV=$(grep -r "BOT_TOKEN=" .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d ' ')
    if [ -n "$BOT_TOKEN_ENV" ]; then
      echo "Найден токен в .env файле: $BOT_TOKEN_ENV"
    fi
  fi
fi

# Если не нашли в файлах, пробуем получить из запущенного контейнера
if [ -z "$BOT_TOKEN_ENV" ]; then
  echo "Токен не найден в конфигурационных файлах, пробуем получить из контейнера..."
  
  # Находим контейнер бота
  BOT_CONTAINER=$(docker ps | grep neuro-blogger | head -1 | awk '{print $1}')
  
  if [ -n "$BOT_CONTAINER" ]; then
    echo "Найден контейнер бота: $BOT_CONTAINER"
    BOT_TOKEN_ENV=$(docker exec $BOT_CONTAINER printenv | grep BOT_TOKEN | cut -d= -f2)
    
    if [ -n "$BOT_TOKEN_ENV" ]; then
      echo "Найден токен в контейнере: $BOT_TOKEN_ENV"
    fi
  else
    echo "Контейнер бота не найден"
  fi
fi

# Проверяем валидность найденного токена
if [ -n "$BOT_TOKEN_ENV" ]; then
  echo "Проверяем валидность токена..."
  
  bot_info=$(curl -s "https://api.telegram.org/bot$BOT_TOKEN_ENV/getMe")
  echo "Информация о боте: $bot_info"
  
  if echo "$bot_info" | grep -q '"ok":true'; then
    echo "✅ Токен валидный!"
    BOT_USERNAME=$(echo "$bot_info" | grep -o '"username":"[^"]*"' | cut -d'"' -f4)
    echo "Имя бота: @$BOT_USERNAME"
    
    # Обновляем токен в скриптах
    echo "Обновляем токен в скриптах уведомлений..."
    sed -i "s|BOT_TOKEN=\"[^\"]*\"|BOT_TOKEN=\"$BOT_TOKEN_ENV\"|g" /root/admin-pulse-notify.sh
    sed -i "s|BOT_TOKEN=\"[^\"]*\"|BOT_TOKEN=\"$BOT_TOKEN_ENV\"|g" /root/test-pulse-messages.sh
    
    echo "Токен обновлен в скриптах. Теперь запускаем тестовое уведомление..."
    bash /root/test-pulse-messages.sh
  else
    echo "❌ Недействительный токен"
  fi
else
  echo "❌ Не удалось найти токен бота"
fi

echo
echo "Завершено." 