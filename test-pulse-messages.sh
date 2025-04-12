#!/bin/bash

# Конфигурация для Telegram
BOT_TOKEN="6950844437:AAFnSoX01iXljaNxmsPojm7Cw5CJqw1O3qY"  # Токен NeuroBlogger бота
CHAT_ID="@neuro_blogger_pulse"                             # Канал пульс
ADMIN_CHAT_ID="144022504"                                  # ID администратора

echo "=== Тестирование отправки сообщений в Telegram ==="
echo "Токен бота: $BOT_TOKEN"
echo "ID администратора: $ADMIN_CHAT_ID"
echo "Канал пульс: $CHAT_ID"
echo

# Функция для отправки тестового сообщения
send_test_message() {
  local chat="$1"
  local message="$2"
  local timestamp=$(date "+%Y-%m-%d %H:%M:%S")
  
  echo "Отправка сообщения в $chat..."
  
  # Отправляем сообщение
  response=$(curl -s -X POST "https://api.telegram.org/bot$BOT_TOKEN/sendMessage" \
        -d "chat_id=$chat" \
        -d "text=$message" \
        -d "parse_mode=MarkdownV2" \
        -d "disable_notification=false")
  
  # Проверяем результат
  if echo "$response" | grep -q '"ok":true'; then
    echo "✅ Сообщение успешно отправлено в $chat"
  else
    echo "❌ Ошибка отправки сообщения в $chat"
    echo "Ответ API: $response"
  fi
  
  echo
}

# Тестовое сообщение для администратора
admin_message="🧪 *Тестовое сообщение*\n"
admin_message+="📅 Время: $(date "+%Y-%m-%d %H:%M:%S")\n"
admin_message+="\nЭто прямой тест системы уведомлений\\.\n"
admin_message+="Если вы получили это сообщение, значит API Telegram работает корректно\\."

# Тестовое сообщение для канала пульс
pulse_message="🧪 *Тестовое сообщение в пульс*\n"
pulse_message+="📅 Время: $(date "+%Y-%m-%d %H:%M:%S")\n"
pulse_message+="\nПроверка работы уведомлений в канале @neuro\_blogger\_pulse\\."

# Отправляем тестовые сообщения
send_test_message "$ADMIN_CHAT_ID" "$admin_message"
send_test_message "$CHAT_ID" "$pulse_message"

echo "Проверьте сообщения от бота!" 