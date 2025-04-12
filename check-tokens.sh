#!/bin/bash

# Список токенов, найденных в контейнере
TOKENS=(
  "7415778573:AAHZM-p6SfZGMlk3maUubZJNaWgZJ8oFCTU"
  "7655182164:AAFGdBTw539UKjlO5dDZcDlXoiqR5B6T5f4"
  "7699001347:AAHcQF4T_YWMe0K-fzjhnKo2oZo_pp5fmcc"
  "8032830593:AAF09IvQz4GOwSzSpfsNAWaGuqN40clWLdI"
  "7137641587:AAGN1W9tgYfhs9Wz_Bdk6anxI9vvCsi69gI"
  "7614375306:AAEiojth3kkTE-lGwNEbhh8saXA72nib2Zw"
  "8199290378:AAHrUgXvbjukMx62RnaqG2DmJNg6SdnKbjY"
  "6389824290:AAFjEjOu4oZUCXTFAxGe5Jo6ydXPprgKSAk"
  "7313269542:AAEarIAXhQfmLUYIQHiYA2kpR9D4r71Ufzs"
)

CHAT_ID="144022504"  # ID администратора

echo "=== Проверка токенов ботов ==="

# Функция для проверки и тестирования токена
check_token() {
  local token="$1"
  local description="$2"
  
  echo "Проверка токена: $description"
  
  # Получаем информацию о боте
  bot_info=$(curl -s "https://api.telegram.org/bot$token/getMe")
  
  if echo "$bot_info" | grep -q '"ok":true'; then
    bot_username=$(echo "$bot_info" | grep -o '"username":"[^"]*"' | cut -d'"' -f4)
    echo "✅ Токен валидный! Бот: @$bot_username"
    
    # Пробуем отправить тестовое сообщение
    message="🔍 Тестовое сообщение от бота @$bot_username\n"
    message+="Время: $(date "+%Y-%m-%d %H:%M:%S")\n"
    message+="Токен проверен и работает корректно."
    
    send_result=$(curl -s -X POST "https://api.telegram.org/bot$token/sendMessage" \
                -d "chat_id=$CHAT_ID" \
                -d "text=$message")
    
    if echo "$send_result" | grep -q '"ok":true'; then
      echo "✅ Сообщение успешно отправлено! Токен рабочий."
      
      # Обновляем токен в скриптах
      echo "Обновляем токен в скриптах уведомлений..."
      sed -i "s|BOT_TOKEN=\"[^\"]*\"|BOT_TOKEN=\"$token\"|g" /root/admin-pulse-notify.sh
      sed -i "s|BOT_TOKEN=\"[^\"]*\"|BOT_TOKEN=\"$token\"|g" /root/test-pulse-messages.sh
      
      echo "✓ Токен обновлен в скриптах."
      return 0
    else
      echo "❌ Ошибка отправки сообщения: $send_result"
    fi
  else
    echo "❌ Недействительный токен: $bot_info"
  fi
  
  return 1
}

# Проверяем каждый токен по очереди
for i in "${!TOKENS[@]}"; do
  token="${TOKENS[$i]}"
  description="Токен $((i+1)) из ${#TOKENS[@]}"
  
  echo
  echo "----------------------------"
  
  if check_token "$token" "$description"; then
    echo "----------------------------"
    echo "✅ Найден рабочий токен! Тестируем систему уведомлений..."
    
    # Запускаем тестовые уведомления
    echo "Запускаем скрипт тестового уведомления..."
    bash /root/test-notify.sh
    
    exit 0
  fi
done

echo
echo "❌ Не найдено рабочих токенов среди ${#TOKENS[@]} проверенных."
echo "Рекомендации:"
echo "1. Проверьте, что боты активны в @BotFather"
echo "2. Убедитесь, что у ботов есть права на отправку сообщений"
echo "3. Возможно требуется использовать прокси для доступа к API Telegram"

exit 1 