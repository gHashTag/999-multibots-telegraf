#!/bin/bash

# Путь к скриптам
SAVE_LOGS_SCRIPT="/root/save-logs.sh"
VIEW_LOGS_SCRIPT="/root/view-logs.sh"
MONITOR_CONTAINERS_SCRIPT="/root/monitor-containers.sh"
SEND_ERRORS_SCRIPT="/root/send-errors-to-telegram.sh"

# Проверка наличия директории для логов
if [ ! -d "/root/logs" ]; then
  mkdir -p /root/logs
  echo "Создана директория для логов: /root/logs"
fi

# Проверка наличия скриптов
if [ ! -f "$SAVE_LOGS_SCRIPT" ]; then
  echo "ОШИБКА: Скрипт $SAVE_LOGS_SCRIPT не найден"
  exit 1
fi

if [ ! -f "$VIEW_LOGS_SCRIPT" ]; then
  echo "ОШИБКА: Скрипт $VIEW_LOGS_SCRIPT не найден"
  exit 1
fi

# Устанавливаем права на выполнение для всех скриптов
chmod +x $SAVE_LOGS_SCRIPT
chmod +x $VIEW_LOGS_SCRIPT

# Проверяем наличие дополнительных скриптов и устанавливаем права, если они существуют
if [ -f "$MONITOR_CONTAINERS_SCRIPT" ]; then
  chmod +x $MONITOR_CONTAINERS_SCRIPT
  echo "Права установлены для скрипта мониторинга контейнеров"
fi

if [ -f "$SEND_ERRORS_SCRIPT" ]; then
  chmod +x $SEND_ERRORS_SCRIPT
  echo "Права установлены для скрипта отправки ошибок в Telegram"
fi

echo "Скриптам установлены права на выполнение"

# Создаем crontab запись для сбора логов каждый час
CRON_JOB="0 * * * * $SAVE_LOGS_SCRIPT > /dev/null 2>&1"

# Проверяем, существует ли уже такая задача
CRON_EXISTS=$(crontab -l 2>/dev/null | grep -F "$SAVE_LOGS_SCRIPT")

if [ -z "$CRON_EXISTS" ]; then
  # Добавляем новую задачу в crontab
  (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
  echo "Добавлена задача crontab для сбора логов каждый час"
else
  echo "Задача crontab для сбора логов уже существует"
fi

# Создаем скрипт для мониторинга ошибок
cat > /root/monitor-errors.sh << 'EOF'
#!/bin/bash

LOGS_DIR="/root/logs"
LATEST_LOG="$LOGS_DIR/latest-logs.txt"
ERROR_LOG="$LOGS_DIR/errors-summary.txt"

# Обновляем последние логи
bash /root/save-logs.sh > /dev/null 2>&1

# Ищем ошибки в логах
echo "Анализ ошибок на $(date)" > $ERROR_LOG
echo "===============================" >> $ERROR_LOG

# Поиск критических ошибок
echo "КРИТИЧЕСКИЕ ОШИБКИ:" >> $ERROR_LOG
grep -i "error\|exception\|critical\|failed\|ошибка\|критическ" $LATEST_LOG | grep -v "debug" >> $ERROR_LOG 2>/dev/null
echo "" >> $ERROR_LOG

# Поиск предупреждений
echo "ПРЕДУПРЕЖДЕНИЯ:" >> $ERROR_LOG
grep -i "warning\|warn\|предупрежден" $LATEST_LOG | grep -v "debug" >> $ERROR_LOG 2>/dev/null
echo "" >> $ERROR_LOG

echo "Анализ логов завершен. Результаты сохранены в $ERROR_LOG"
EOF

chmod +x /root/monitor-errors.sh

# Добавляем задачу для мониторинга ошибок
MONITOR_JOB="*/30 * * * * /root/monitor-errors.sh > /dev/null 2>&1"
MONITOR_EXISTS=$(crontab -l 2>/dev/null | grep -F "monitor-errors.sh")

if [ -z "$MONITOR_EXISTS" ]; then
  # Добавляем новую задачу в crontab
  (crontab -l 2>/dev/null; echo "$MONITOR_JOB") | crontab -
  echo "Добавлена задача crontab для мониторинга ошибок каждые 30 минут"
else
  echo "Задача crontab для мониторинга ошибок уже существует"
fi

# Добавляем задачу для мониторинга контейнеров, если скрипт существует
if [ -f "$MONITOR_CONTAINERS_SCRIPT" ]; then
  CONTAINERS_JOB="*/15 * * * * $MONITOR_CONTAINERS_SCRIPT > /dev/null 2>&1"
  CONTAINERS_EXISTS=$(crontab -l 2>/dev/null | grep -F "$MONITOR_CONTAINERS_SCRIPT")
  
  if [ -z "$CONTAINERS_EXISTS" ]; then
    # Добавляем новую задачу в crontab
    (crontab -l 2>/dev/null; echo "$CONTAINERS_JOB") | crontab -
    echo "Добавлена задача crontab для мониторинга контейнеров каждые 15 минут"
  else
    echo "Задача crontab для мониторинга контейнеров уже существует"
  fi
fi

# Добавляем задачу для отправки отчета об ошибках в Telegram, если скрипт существует
if [ -f "$SEND_ERRORS_SCRIPT" ]; then
  # Проверяем, был ли настроен токен бота
  BOT_TOKEN=$(grep -o 'BOT_TOKEN="[^"]*"' $SEND_ERRORS_SCRIPT | cut -d '"' -f 2)
  
  if [ "$BOT_TOKEN" = "YOUR_BOT_TOKEN_HERE" ]; then
    echo "⚠️ Внимание: Не настроен BOT_TOKEN в $SEND_ERRORS_SCRIPT"
    echo "Для отправки ошибок в Telegram, обновите токен бота и ID чата"
  else
    SEND_ERRORS_JOB="0 */2 * * * $SEND_ERRORS_SCRIPT > /dev/null 2>&1"
    SEND_ERRORS_EXISTS=$(crontab -l 2>/dev/null | grep -F "$SEND_ERRORS_SCRIPT")
    
    if [ -z "$SEND_ERRORS_EXISTS" ]; then
      # Добавляем новую задачу в crontab
      (crontab -l 2>/dev/null; echo "$SEND_ERRORS_JOB") | crontab -
      echo "Добавлена задача crontab для отправки ошибок в Telegram каждые 2 часа"
    else
      echo "Задача crontab для отправки ошибок в Telegram уже существует"
    fi
  fi
fi

# Вывод информации о настройке
echo
echo "=== НАСТРОЙКА ЗАВЕРШЕНА ==="
echo "Что было настроено:"
echo "1. Автоматический сбор логов каждый час"
echo "2. Мониторинг ошибок каждые 30 минут"
echo "3. Логи сохраняются в /root/logs/"

if [ -f "$MONITOR_CONTAINERS_SCRIPT" ]; then
  echo "4. Мониторинг Docker контейнеров каждые 15 минут"
fi

if [ -f "$SEND_ERRORS_SCRIPT" ]; then
  BOT_TOKEN=$(grep -o 'BOT_TOKEN="[^"]*"' $SEND_ERRORS_SCRIPT | cut -d '"' -f 2)
  
  if [ "$BOT_TOKEN" != "YOUR_BOT_TOKEN_HERE" ]; then
    echo "5. Отправка отчетов об ошибках в Telegram каждые 2 часа"
  else
    echo "5. ⚠️ Отправка в Telegram не настроена. Обновите токен в $SEND_ERRORS_SCRIPT"
  fi
fi

echo
echo "Как использовать:"
echo "- Для просмотра и управления логами: bash $VIEW_LOGS_SCRIPT"
echo "- Для ручного сохранения логов: bash $SAVE_LOGS_SCRIPT"
echo "- Для проверки ошибок: cat /root/logs/errors-summary.txt"

if [ -f "$MONITOR_CONTAINERS_SCRIPT" ]; then
  echo "- Для проверки контейнеров: bash $MONITOR_CONTAINERS_SCRIPT"
fi

if [ -f "$SEND_ERRORS_SCRIPT" ]; then
  echo "- Для отправки ошибок в Telegram: bash $SEND_ERRORS_SCRIPT"
fi

echo "==========================" 