#!/bin/bash

# Конфигурация для Telegram
BOT_TOKEN="6950844437:AAFnSoX01iXljaNxmsPojm7Cw5CJqw1O3qY"  # Токен NeuroBlogger бота
CHAT_ID="@neuro_blogger_pulse"                             # Канал пульс
ADMIN_CHAT_ID="144022504"                                  # ID администратора
LOGS_DIR="/root/logs"
ERROR_LOG="$LOGS_DIR/errors-summary.txt"
SERVER_NAME=$(hostname)

# Функция для логирования
log_message() {
  local message="$1"
  local timestamp=$(date "+%Y-%m-%d %H:%M:%S")
  echo "[$timestamp] $message"
  echo "[$timestamp] $message" >> "$LOGS_DIR/admin_notifications.log"
}

log_message "🔄 Запуск проверки логов для отправки администратору"

# Обновляем логи и проверяем наличие ошибок
bash /root/save-logs.sh > /dev/null 2>&1
bash /root/monitor-errors.sh > /dev/null 2>&1

# Проверяем наличие отчета об ошибках
if [ ! -f "$ERROR_LOG" ]; then
  log_message "❌ Файл с отчетом об ошибках не найден: $ERROR_LOG"
  exit 1
fi

# Проверяем наличие реальных ошибок (не только заголовки)
ERRORS_COUNT=$(grep -i "error\|exception\|critical\|failed\|ошибка" "$ERROR_LOG" | grep -v "КРИТИЧЕСКИЕ ОШИБКИ:" | wc -l)

if [ "$ERRORS_COUNT" -eq 0 ]; then
  log_message "✅ Ошибок не обнаружено, уведомление не отправляется"
  exit 0
fi

# Проверяем статус Docker контейнеров
CONTAINERS_STATUS=$(bash /root/monitor-containers.sh 2>&1)
CONTAINERS_RESTARTED=$(echo "$CONTAINERS_STATUS" | grep -i "перезапуск" | wc -l)

# Формируем сообщение для администратора
CURRENT_DATE=$(date "+%Y-%m-%d %H:%M:%S")
MESSAGE="🚨 *Отчет о состоянии сервера $SERVER_NAME*\n"
MESSAGE+="📅 *Время проверки:* $CURRENT_DATE\n\n"

# Добавляем информацию о контейнерах
if [ "$CONTAINERS_RESTARTED" -gt 0 ]; then
  MESSAGE+="⚠️ *Контейнеры:* Были перезапуски! Подробнее в логах\n"
else
  MESSAGE+="✅ *Контейнеры:* Работают нормально\n"
fi

# Добавляем информацию об ошибках
MESSAGE+="🔥 *Обнаружено ошибок:* $ERRORS_COUNT\n\n"

# Добавляем несколько примеров ошибок
MESSAGE+="*Примеры последних ошибок:*\n"

# Извлекаем важные ошибки (максимум 5)
ERRORS=$(grep -i "error\|exception\|critical\|failed\|ошибка" "$ERROR_LOG" | grep -v "КРИТИЧЕСКИЕ ОШИБКИ:" | grep -v "debug\|info" | head -5)

# Если не нашли серьезных ошибок, берем любые ошибки
if [ -z "$ERRORS" ]; then
  ERRORS=$(grep -i "error\|exception\|critical\|failed\|ошибка" "$ERROR_LOG" | grep -v "КРИТИЧЕСКИЕ ОШИБКИ:" | head -5)
fi

# Добавляем каждую ошибку в сообщение
while IFS= read -r line; do
  # Экранируем специальные символы для Markdown
  ESCAPED_LINE=$(echo "$line" | sed 's/\([_*\[\]()~`>#+=|{}.!-]\)/\\\1/g')
  MESSAGE+="• $ESCAPED_LINE\n"
done <<< "$ERRORS"

# Информация о системных ресурсах
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}')
MEMORY_USAGE=$(free -h | awk 'NR==2 {print $3"/"$2}')
CPU_LOAD=$(uptime | awk -F'load average: ' '{print $2}')

MESSAGE+="\n*Системная информация:*\n"
MESSAGE+="💾 Использование диска: $DISK_USAGE\n"
MESSAGE+="🧠 Использование памяти: $MEMORY_USAGE\n"
MESSAGE+="🔄 Загрузка CPU: $CPU_LOAD\n"

# Временная метка архива логов
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
ARCHIVE_NAME="logs_admin_$TIMESTAMP.tar.gz"
ARCHIVE_PATH="$LOGS_DIR/$ARCHIVE_NAME"

# Создаем архив с важными логами
tar -czf "$ARCHIVE_PATH" "$ERROR_LOG" "$LOGS_DIR/latest-logs.txt" "$LOGS_DIR/container_restarts.log" 2>/dev/null

# Отправляем сообщение администратору
curl -s -X POST "https://api.telegram.org/bot$BOT_TOKEN/sendMessage" \
     -d "chat_id=$ADMIN_CHAT_ID" \
     -d "text=$MESSAGE" \
     -d "parse_mode=MarkdownV2" \
     -d "disable_notification=false" > /dev/null

log_message "✅ Отправлено уведомление администратору о $ERRORS_COUNT ошибках"

# Отправляем архив с логами администратору
curl -s -X POST "https://api.telegram.org/bot$BOT_TOKEN/sendDocument" \
     -F "chat_id=$ADMIN_CHAT_ID" \
     -F "document=@$ARCHIVE_PATH" \
     -F "caption=📋 Архив с логами сервера ($CURRENT_DATE)" > /dev/null

log_message "✅ Отправлен архив с логами: $ARCHIVE_PATH"

# При серьезных проблемах дублируем в канал @neuro_blogger_pulse
if [ "$ERRORS_COUNT" -gt 10 ] || [ "$CONTAINERS_RESTARTED" -gt 0 ]; then
  # Сообщение для пульса (более короткое)
  PULSE_MESSAGE="⚠️ *Внимание! Проблемы на сервере $SERVER_NAME*\n"
  PULSE_MESSAGE+="📅 Время: $CURRENT_DATE\n"
  PULSE_MESSAGE+="🔥 Ошибок: $ERRORS_COUNT\n"
  
  if [ "$CONTAINERS_RESTARTED" -gt 0 ]; then
    PULSE_MESSAGE+="🔄 Были перезапуски контейнеров\n"
  fi
  
  PULSE_MESSAGE+="\n🔍 Подробности отправлены администратору"
  
  # Отправляем сообщение в пульс
  curl -s -X POST "https://api.telegram.org/bot$BOT_TOKEN/sendMessage" \
       -d "chat_id=$CHAT_ID" \
       -d "text=$PULSE_MESSAGE" \
       -d "parse_mode=MarkdownV2" \
       -d "disable_notification=false" > /dev/null
  
  log_message "✅ Дублирующее уведомление отправлено в канал $CHAT_ID"
fi

# Удаляем архив, чтобы не забивать диск
rm "$ARCHIVE_PATH" 