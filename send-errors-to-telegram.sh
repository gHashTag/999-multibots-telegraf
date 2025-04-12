#!/bin/bash

# Конфигурация
BOT_TOKEN="YOUR_BOT_TOKEN_HERE"  # Замените на токен своего бота
CHAT_ID="YOUR_CHAT_ID_HERE"      # Замените на ID чата или @канал
LOGS_DIR="/root/logs"
ERROR_LOG="$LOGS_DIR/errors-summary.txt"

# Проверяем наличие отчета об ошибках
if [ ! -f "$ERROR_LOG" ]; then
  echo "Файл с отчетом об ошибках не найден: $ERROR_LOG"
  exit 1
fi

# Проверяем размер файла
FILE_SIZE=$(wc -c < "$ERROR_LOG")
if [ "$FILE_SIZE" -eq 0 ]; then
  echo "Файл отчета пуст"
  exit 0
fi

# Проверяем наличие реальных ошибок (не только заголовки)
ERRORS_COUNT=$(grep -i "error\|exception\|critical\|failed\|ошибка" "$ERROR_LOG" | grep -v "КРИТИЧЕСКИЕ ОШИБКИ:" | wc -l)

if [ "$ERRORS_COUNT" -eq 0 ]; then
  echo "Ошибок не обнаружено, сообщение не отправляется"
  exit 0
fi

# Формируем сообщение
SERVER_NAME=$(hostname)
CURRENT_DATE=$(date "+%Y-%m-%d %H:%M:%S")
MESSAGE="🚨 *Обнаружены ошибки на сервере $SERVER_NAME*\n"
MESSAGE+="📅 Время: $CURRENT_DATE\n"
MESSAGE+="🔢 Количество ошибок: $ERRORS_COUNT\n\n"

# Добавляем первые 10 ошибок из отчета
MESSAGE+="*Примеры ошибок:*\n"

# Извлекаем и форматируем ошибки (максимум 10)
ERRORS=$(grep -i "error\|exception\|critical\|failed\|ошибка" "$ERROR_LOG" | grep -v "КРИТИЧЕСКИЕ ОШИБКИ:" | head -10)

# Добавляем каждую ошибку в сообщение
while IFS= read -r line; do
  # Экранируем специальные символы для Markdown
  ESCAPED_LINE=$(echo "$line" | sed 's/\([_*\[\]()~`>#+=|{}.!-]\)/\\\1/g')
  MESSAGE+="• $ESCAPED_LINE\n"
done <<< "$ERRORS"

# Добавляем информацию о полном отчете
MESSAGE+="\n💾 Полный отчет доступен на сервере в файле: \`$ERROR_LOG\`"

# Отправляем сообщение в Telegram (через curl)
curl -s -X POST "https://api.telegram.org/bot$BOT_TOKEN/sendMessage" \
     -d "chat_id=$CHAT_ID" \
     -d "text=$MESSAGE" \
     -d "parse_mode=MarkdownV2" \
     -d "disable_notification=false"

echo "Отчет об ошибках отправлен в Telegram"

# Создаем архив логов для отправки
ARCHIVE_NAME="logs_$(date +"%Y-%m-%d_%H-%M-%S").tar.gz"
ARCHIVE_PATH="$LOGS_DIR/$ARCHIVE_NAME"

# Упаковываем последние логи в архив
tar -czf "$ARCHIVE_PATH" "$ERROR_LOG" "$LOGS_DIR/latest-logs.txt"

# Отправляем архив в Telegram
curl -s -X POST "https://api.telegram.org/bot$BOT_TOKEN/sendDocument" \
     -F "chat_id=$CHAT_ID" \
     -F "document=@$ARCHIVE_PATH" \
     -F "caption=📋 Архив с логами сервера ($CURRENT_DATE)"

echo "Архив с логами отправлен в Telegram: $ARCHIVE_PATH"

# Опционально удаляем архив, чтобы не забивать диск
rm "$ARCHIVE_PATH" 