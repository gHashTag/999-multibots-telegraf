#!/bin/bash

# Токены для тестирования
TOKENS=(
  "6950844437:AAFnSoX01iXljaNxmsPojm7Cw5CJqw1O3qY"  # Текущий токен
  "6950844437:AAFnSoX01iXljaNxmsPojm7Cw5CJqw1O3qY"  # Токен с другой кодировкой
  "5662522862:AAH7yTQVZd9aBpDIGCXK_aTVx7QeXTABKK0"  # Токен @BotFather
)

CHAT_ID="144022504"  # ID администратора

echo "=== Тестирование токенов бота ==="

for token in "${TOKENS[@]}"; do
  echo "Тестирование токена: $token"
  
  # Получаем информацию о боте
  bot_info=$(curl -s "https://api.telegram.org/bot$token/getMe")
  echo "Информация о боте: $bot_info"
  
  # Если информация получена успешно, пробуем отправить сообщение
  if echo "$bot_info" | grep -q '"ok":true'; then
    echo "✅ Токен валидный"
    
    # Тестовое сообщение
    message="🔍 Тест токена бота\nВремя: $(date "+%Y-%m-%d %H:%M:%S")\nЭто проверка работоспособности API"
    
    # Отправляем сообщение
    send_result=$(curl -s -X POST "https://api.telegram.org/bot$token/sendMessage" \
                -d "chat_id=$CHAT_ID" \
                -d "text=$message")
    
    echo "Результат отправки: $send_result"
    
    if echo "$send_result" | grep -q '"ok":true'; then
      echo "✅ Сообщение успешно отправлено!"
      echo "РАБОЧИЙ ТОКЕН: $token"
      echo
      
      # Обновляем токен в скриптах
      echo "Обновляем токен в скриптах..."
      sed -i "s|BOT_TOKEN=\"[^\"]*\"|BOT_TOKEN=\"$token\"|g" /root/admin-pulse-notify.sh
      sed -i "s|BOT_TOKEN=\"[^\"]*\"|BOT_TOKEN=\"$token\"|g" /root/test-pulse-messages.sh
      
      echo "Токен обновлен в скриптах."
      break
    else
      echo "❌ Ошибка отправки сообщения"
    fi
  else
    echo "❌ Недействительный токен"
  fi
  
  echo "-------------------------------"
done

echo
echo "Тестирование завершено." 