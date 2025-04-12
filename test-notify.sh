#!/bin/bash

# Создаем тестовые ошибки
echo "Создаем тестовые ошибки для проверки системы уведомлений..."
mkdir -p /root/logs
echo "Анализ ошибок на $(date)" > /root/logs/errors-summary.txt
echo "===============================" >> /root/logs/errors-summary.txt
echo "КРИТИЧЕСКИЕ ОШИБКИ:" >> /root/logs/errors-summary.txt
echo "[ERROR] Тестовая ошибка №1 - This is a test error" >> /root/logs/errors-summary.txt
echo "[CRITICAL] Тестовая ошибка №2 - Database connection failed" >> /root/logs/errors-summary.txt
echo "[ERROR] Тестовая ошибка №3 - API timeout" >> /root/logs/errors-summary.txt
echo "[FAILED] Тестовая ошибка №4 - Payment process error" >> /root/logs/errors-summary.txt
echo "[ERROR] Тестовая ошибка №5 - Image generation failed" >> /root/logs/errors-summary.txt
echo "" >> /root/logs/errors-summary.txt
echo "ПРЕДУПРЕЖДЕНИЯ:" >> /root/logs/errors-summary.txt
echo "[WARNING] Тестовое предупреждение - Low disk space" >> /root/logs/errors-summary.txt
echo "" >> /root/logs/errors-summary.txt

# Создаем тестовый файл latest-logs.txt для архивирования
echo "Тестовые логи для проверки системы уведомлений" > /root/logs/latest-logs.txt
echo "Дата: $(date)" >> /root/logs/latest-logs.txt
echo "-------------------------------" >> /root/logs/latest-logs.txt
echo "[ERROR] Тестовая ошибка №1 - This is a test error" >> /root/logs/latest-logs.txt
echo "[CRITICAL] Тестовая ошибка №2 - Database connection failed" >> /root/logs/latest-logs.txt

# Запускаем скрипт отправки уведомлений в тестовом режиме
echo "Запуск скрипта отправки уведомлений..."
bash /root/admin-pulse-notify.sh

echo "Тестовое уведомление должно быть отправлено!"
echo "Проверьте личные сообщения от бота и канал @neuro_blogger_pulse" 