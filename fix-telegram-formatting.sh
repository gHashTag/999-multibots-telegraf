#!/bin/bash

# Загружаем токены из безопасного хранилища
source /root/.telegram_tokens/.env

# Функция для отправки сообщений с правильным форматированием
send_formatted_message() {
  local chat_id="$1"
  local message="$2"
  
  # Важно: используем --data-binary вместо --data и формат HTML вместо MarkdownV2
  # Это сохраняет переносы строк и позволяет использовать HTML-форматирование
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-binary "chat_id=${chat_id}&text=${message}&parse_mode=HTML" > /dev/null
}

echo "=== Исправление форматирования сообщений Telegram ==="

# Создаем пример сообщения для тестирования
TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"
TEST_MESSAGE="<b>🔍 Тестовое сообщение</b>
📅 Дата: ${TIMESTAMP}
✅ Статус: Успешно

<i>Это тестовое сообщение с переносами строк.</i>
Строки должны отображаться с правильными переносами,
а не показывать символы \n как текст.

<code>
Также это сообщение тестирует
форматирование кода
с сохранением переносов строк.
</code>"

CHANNEL_MESSAGE="<b>📢 ТЕСТОВОЕ СООБЩЕНИЕ В КАНАЛ</b>
📅 Дата: ${TIMESTAMP}

👋 Это тест системы оповещений
с правильным форматированием
и переносами строк.

<i>Сообщение отправлено автоматически</i>"

# Отправляем тестовое сообщение администратору и в канал
echo "🚀 Отправка тестового сообщения администратору..."
send_formatted_message "$TELEGRAM_ADMIN_CHAT_ID" "$TEST_MESSAGE"

echo "🚀 Отправка тестового сообщения в канал..."
send_formatted_message "$TELEGRAM_PULSE_CHAT_ID" "$CHANNEL_MESSAGE"

# Обновляем функции отправки сообщений в других скриптах
echo "📝 Обновление функций отправки в других скриптах..."

# Обновляем admin-pulse-notify.sh
echo "📝 Обновление admin-pulse-notify.sh..."
sed -i 's/send_message() {/send_formatted_message() {/' /root/admin-pulse-notify.sh
sed -i 's/--data "chat_id=${chat_id}/--data-binary "chat_id=${chat_id}/' /root/admin-pulse-notify.sh
sed -i 's/parse_mode=MarkdownV2/parse_mode=HTML/' /root/admin-pulse-notify.sh
# Замена форматирования с MarkdownV2 на HTML в тексте сообщений
sed -i 's/\\\*/\<b\>/g' /root/admin-pulse-notify.sh
sed -i 's/\*\\\\/\<\/b\>/g' /root/admin-pulse-notify.sh
sed -i 's/\\\`/\<code\>/g' /root/admin-pulse-notify.sh
sed -i 's/\`\\\\/\<\/code\>/g' /root/admin-pulse-notify.sh

# Обновляем test-pulse-messages.sh
echo "📝 Обновление test-pulse-messages.sh..."
sed -i 's/send_message() {/send_formatted_message() {/' /root/test-pulse-messages.sh
sed -i 's/--data "chat_id=${chat_id}/--data-binary "chat_id=${chat_id}/' /root/test-pulse-messages.sh
sed -i 's/parse_mode=MarkdownV2/parse_mode=HTML/' /root/test-pulse-messages.sh
# Замена форматирования с MarkdownV2 на HTML в тексте сообщений
sed -i 's/\\\*/\<b\>/g' /root/test-pulse-messages.sh
sed -i 's/\*\\\\/\<\/b\>/g' /root/test-pulse-messages.sh
sed -i 's/\\\`/\<code\>/g' /root/test-pulse-messages.sh
sed -i 's/\`\\\\/\<\/code\>/g' /root/test-pulse-messages.sh

# Обновляем fix-test-logs.sh
echo "📝 Обновление fix-test-logs.sh..."
sed -i 's/send_notification() {/send_formatted_message() {/' /root/fix-test-logs.sh
sed -i 's/--data "chat_id=${chat_id}/--data-binary "chat_id=${chat_id}/' /root/fix-test-logs.sh
sed -i 's/parse_mode=MarkdownV2/parse_mode=HTML/' /root/fix-test-logs.sh
# Замена форматирования с MarkdownV2 на HTML в тексте сообщений
sed -i 's/\\\*/\<b\>/g' /root/fix-test-logs.sh
sed -i 's/\*\\\\/\<\/b\>/g' /root/fix-test-logs.sh
sed -i 's/\\\`/\<code\>/g' /root/fix-test-logs.sh
sed -i 's/\`\\\\/\<\/code\>/g' /root/fix-test-logs.sh

echo
echo "✅ Готово! Все скрипты обновлены для правильного форматирования сообщений"
echo "📱 Проверьте сообщения в Telegram - они должны отображаться с правильными переносами строк" 