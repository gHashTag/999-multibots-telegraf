#!/bin/bash

# Используем токен от https://t.me/gdrive_bot
BOT_TOKEN="1059518956:AAGhFqhJh6N-e-0-KbgIJgJbq7RdIqrk-2c"
CHAT_ID="144022504"  # ID администратора

echo "=== Тестирование известного рабочего бота ==="
echo "Токен: $BOT_TOKEN"
echo "ID чата: $CHAT_ID"
echo

# Получаем информацию о боте
echo "Запрос информации о боте..."
bot_info=$(curl -s "https://api.telegram.org/bot$BOT_TOKEN/getMe")
echo "Информация о боте: $bot_info"

# Проверяем, валидный ли токен
if echo "$bot_info" | grep -q '"ok":true'; then
  echo "✅ Токен валидный"
  
  # Пробуем отправить сообщение
  echo "Отправка тестового сообщения..."
  message="🔄 Тест системы уведомлений\n"
  message+="Время: $(date "+%Y-%m-%d %H:%M:%S")\n"
  message+="Это сообщение от скрипта тестирования.\n"
  message+="Если вы его получили, значит API Telegram работает корректно."
  
  send_result=$(curl -s -X POST "https://api.telegram.org/bot$BOT_TOKEN/sendMessage" \
              -d "chat_id=$CHAT_ID" \
              -d "text=$message")
  
  echo "Результат отправки: $send_result"
  
  if echo "$send_result" | grep -q '"ok":true'; then
    echo "✅ Сообщение успешно отправлено!"
    
    # Обновляем токен в рабочих скриптах
    echo "Обновляем токен в скриптах..."
    sed -i "s|BOT_TOKEN=\"[^\"]*\"|BOT_TOKEN=\"$BOT_TOKEN\"|g" /root/admin-pulse-notify.sh
    sed -i "s|BOT_TOKEN=\"[^\"]*\"|BOT_TOKEN=\"$BOT_TOKEN\"|g" /root/test-pulse-messages.sh
    
    echo "Токен обновлен в скриптах."
    
    # Запускаем тестовое уведомление с новым токеном
    echo "Запускаем скрипт тестового уведомления с новым токеном..."
    bash /root/test-pulse-messages.sh
  else
    echo "❌ Ошибка отправки сообщения"
    echo "Возможная причина: бот не может отправлять сообщения пользователю, который с ним не взаимодействовал"
    echo "Рекомендация: откройте чат с ботом @gdrive_bot и отправьте ему любое сообщение"
  fi
else
  echo "❌ Недействительный токен"
fi

echo
echo "Тестирование завершено." 