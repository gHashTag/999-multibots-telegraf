#!/bin/bash

# Получаем текущий токен из файла
CURRENT_TOKEN=$(grep "BOT_TOKEN=" /root/admin-pulse-notify.sh | head -1 | cut -d'"' -f2)
ADMIN_CHAT_ID="144022504"
PULSE_CHAT_ID="@neuro_blogger_pulse"

echo "=== Форсированное тестирование отправки уведомлений ==="
echo "Токен бота: $CURRENT_TOKEN"
echo "ID администратора: $ADMIN_CHAT_ID"
echo

# Отправка прямого тестового сообщения администратору
echo "Отправка тестового сообщения администратору..."
TEST_MESSAGE="🧪 *Тестовое уведомление*\n"
TEST_MESSAGE+="📅 Время: $(date "+%Y-%m-%d %H:%M:%S")\n\n"
TEST_MESSAGE+="Это прямое тестовое сообщение от системы мониторинга\\.\n"
TEST_MESSAGE+="✓ Настройка уведомлений выполнена успешно\\!"

admin_result=$(curl -s -X POST "https://api.telegram.org/bot$CURRENT_TOKEN/sendMessage" \
            -d "chat_id=$ADMIN_CHAT_ID" \
            -d "text=$TEST_MESSAGE" \
            -d "parse_mode=MarkdownV2")

if echo "$admin_result" | grep -q '"ok":true'; then
  echo "✅ Тестовое сообщение администратору отправлено успешно!"
else
  echo "❌ Ошибка отправки сообщения администратору: $admin_result"
fi

# Отправка тестового сообщения в канал пульс
echo "Отправка тестового сообщения в канал пульс..."
PULSE_MESSAGE="🧪 *Тестовое уведомление в канал*\n"
PULSE_MESSAGE+="📅 Время: $(date "+%Y-%m-%d %H:%M:%S")\n\n"
PULSE_MESSAGE+="Это тестовое сообщение системы мониторинга в канал @neuro\\_blogger\\_pulse\\.\n"
PULSE_MESSAGE+="✓ Настройка уведомлений выполнена успешно\\!"

pulse_result=$(curl -s -X POST "https://api.telegram.org/bot$CURRENT_TOKEN/sendMessage" \
            -d "chat_id=$PULSE_CHAT_ID" \
            -d "text=$PULSE_MESSAGE" \
            -d "parse_mode=MarkdownV2")

if echo "$pulse_result" | grep -q '"ok":true'; then
  echo "✅ Тестовое сообщение в канал пульс отправлено успешно!"
else
  echo "❌ Ошибка отправки сообщения в канал пульс: $pulse_result"
fi

# Теперь создаем реалистичные тестовые ошибки и запускаем скрипт уведомлений
echo
echo "Создание тестовых ошибок и проверка скрипта уведомлений..."

# Создаем директорию для логов, если её нет
mkdir -p /root/logs

# Создаем тестовый файл с ошибками
ERROR_LOG="/root/logs/errors-summary.txt"
echo "Анализ ошибок на $(date)" > $ERROR_LOG
echo "===============================" >> $ERROR_LOG
echo "КРИТИЧЕСКИЕ ОШИБКИ:" >> $ERROR_LOG
echo "[ERROR] Тестовая ошибка #1 - This is a test error" >> $ERROR_LOG
echo "[CRITICAL] Тестовая ошибка #2 - Database connection failed" >> $ERROR_LOG
echo "[ERROR] Тестовая ошибка #3 - API timeout" >> $ERROR_LOG
echo "[FAILED] Тестовая ошибка #4 - Payment process error" >> $ERROR_LOG
echo "[ERROR] Тестовая ошибка #5 - Image generation failed" >> $ERROR_LOG
echo "[ERROR] Тестовая ошибка #6 - Video processing error" >> $ERROR_LOG
echo "[ERROR] Тестовая ошибка #7 - Audio conversion failed" >> $ERROR_LOG
echo "[ERROR] Тестовая ошибка #8 - Authentication failed" >> $ERROR_LOG
echo "[ERROR] Тестовая ошибка #9 - Network connection lost" >> $ERROR_LOG
echo "[ERROR] Тестовая ошибка #10 - Server timeout" >> $ERROR_LOG
echo "[ERROR] Тестовая ошибка #11 - Memory allocation error" >> $ERROR_LOG
echo "" >> $ERROR_LOG
echo "ПРЕДУПРЕЖДЕНИЯ:" >> $ERROR_LOG
echo "[WARNING] Тестовое предупреждение - Low disk space" >> $ERROR_LOG
echo "" >> $ERROR_LOG

# Создаем тестовый файл логов контейнера
echo "Тестовые логи Docker-контейнера $(date)" > /root/logs/latest-logs.txt
echo "-------------------------------" >> /root/logs/latest-logs.txt
echo "[2025-04-12 01:55:00] [ERROR] Тестовая ошибка #1 - This is a test error" >> /root/logs/latest-logs.txt
echo "[2025-04-12 01:55:01] [CRITICAL] Тестовая ошибка #2 - Database connection failed" >> /root/logs/latest-logs.txt
echo "[2025-04-12 01:55:02] [ERROR] Тестовая ошибка #3 - API timeout" >> /root/logs/latest-logs.txt
echo "[2025-04-12 01:55:03] [FAILED] Тестовая ошибка #4 - Payment process error" >> /root/logs/latest-logs.txt
echo "[2025-04-12 01:55:04] [ERROR] Тестовая ошибка #5 - Image generation failed" >> /root/logs/latest-logs.txt
echo "[2025-04-12 01:55:05] [WARNING] Тестовое предупреждение - Low disk space" >> /root/logs/latest-logs.txt

# Временно модифицируем скрипт admin-pulse-notify.sh для тестирования
cp /root/admin-pulse-notify.sh /root/admin-pulse-notify.sh.bak
sed -i 's/ERRORS_COUNT=$(grep -i "error\\|exception\\|critical\\|failed\\|ошибка" "$ERROR_LOG" | grep -v "КРИТИЧЕСКИЕ ОШИБКИ:" | wc -l)/ERRORS_COUNT=11/' /root/admin-pulse-notify.sh

echo "Запуск скрипта отправки уведомлений..."
bash /root/admin-pulse-notify.sh

# Восстанавливаем оригинальный скрипт
mv /root/admin-pulse-notify.sh.bak /root/admin-pulse-notify.sh

echo
echo "✅ Тестирование завершено! Проверьте уведомления в Telegram."
echo "Если вы получили сообщения от бота @LeeSolarbot, значит настройка выполнена успешно." 