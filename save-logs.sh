#!/bin/bash

# Создаем директорию для логов, если её нет
mkdir -p /root/logs

# Текущая дата и время для имени файла
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
LOG_FILE="/root/logs/docker-logs_${TIMESTAMP}.txt"

# Сохраняем логи всех контейнеров
echo "Сохраняем логи в файл: $LOG_FILE"
docker-compose -f /opt/app/999-multibots-telegraf/docker-compose.yml logs > $LOG_FILE

echo "Логи сохранены в $LOG_FILE"
echo "Размер файла: $(du -h $LOG_FILE | cut -f1)"

# Создаем символическую ссылку на последние логи
ln -sf $LOG_FILE /root/logs/latest-logs.txt
echo "Символическая ссылка создана: /root/logs/latest-logs.txt" 