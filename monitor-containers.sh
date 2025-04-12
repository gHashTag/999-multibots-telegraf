#!/bin/bash

# Директория с логами
LOGS_DIR="/root/logs"
RESTART_LOG="$LOGS_DIR/container_restarts.log"

# Создаем директорию для логов, если её нет
if [ ! -d "$LOGS_DIR" ]; then
  mkdir -p "$LOGS_DIR"
fi

# Функция для логирования
log_message() {
  local message="$1"
  local timestamp=$(date "+%Y-%m-%d %H:%M:%S")
  echo "[$timestamp] $message" >> "$RESTART_LOG"
  echo "[$timestamp] $message"
}

log_message "Запущена проверка состояния контейнеров"

# Проверка наличия Docker
if ! command -v docker &> /dev/null; then
  log_message "❌ Docker не установлен. Выход."
  exit 1
fi

# Переходим в директорию с docker-compose
cd /opt/app/999-multibots-telegraf

# Получаем список контейнеров из docker-compose.yml
EXPECTED_CONTAINERS=$(docker-compose config --services)

if [ -z "$EXPECTED_CONTAINERS" ]; then
  log_message "❌ Не удалось получить список сервисов из docker-compose.yml. Проверьте файл конфигурации."
  exit 1
fi

# Проверяем статус каждого контейнера
RESTART_NEEDED=false

for service in $EXPECTED_CONTAINERS; do
  # Получаем ID контейнера
  CONTAINER_ID=$(docker-compose ps -q $service)
  
  if [ -z "$CONTAINER_ID" ]; then
    log_message "⚠️ Контейнер '$service' не запущен. Требуется запуск."
    RESTART_NEEDED=true
    continue
  fi
  
  # Проверяем статус контейнера
  STATUS=$(docker inspect --format='{{.State.Status}}' $CONTAINER_ID 2>/dev/null)
  
  if [ "$STATUS" != "running" ]; then
    log_message "⚠️ Контейнер '$service' имеет статус '$STATUS'. Требуется перезапуск."
    RESTART_NEEDED=true
  else
    # Контейнер работает, проверяем health status, если доступен
    HEALTH=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}HEALTH_CHECK_NOT_AVAILABLE{{end}}' $CONTAINER_ID 2>/dev/null)
    
    if [ "$HEALTH" != "HEALTH_CHECK_NOT_AVAILABLE" ] && [ "$HEALTH" != "healthy" ]; then
      log_message "⚠️ Контейнер '$service' имеет статус здоровья '$HEALTH'. Требуется перезапуск."
      RESTART_NEEDED=true
    fi
  fi
done

# Перезапускаем сервисы, если это необходимо
if [ "$RESTART_NEEDED" = true ]; then
  log_message "🔄 Перезапуск контейнеров..."
  
  # Сохраняем текущие логи перед перезапуском
  docker-compose logs > "$LOGS_DIR/containers_logs_before_restart_$(date +"%Y-%m-%d_%H-%M-%S").txt"
  
  # Перезапускаем контейнеры
  docker-compose down
  sleep 5
  docker-compose up -d
  
  log_message "✅ Перезапуск контейнеров выполнен"
else
  log_message "✅ Все контейнеры работают нормально"
fi

# Проверяем статус после перезапуска, если он произошел
if [ "$RESTART_NEEDED" = true ]; then
  sleep 15 # Даем время на запуск
  
  ALL_RUNNING=true
  
  for service in $EXPECTED_CONTAINERS; do
    # Получаем ID контейнера
    CONTAINER_ID=$(docker-compose ps -q $service)
    
    if [ -z "$CONTAINER_ID" ]; then
      log_message "❌ Контейнер '$service' не запустился после перезапуска."
      ALL_RUNNING=false
      continue
    fi
    
    # Проверяем статус контейнера
    STATUS=$(docker inspect --format='{{.State.Status}}' $CONTAINER_ID 2>/dev/null)
    
    if [ "$STATUS" != "running" ]; then
      log_message "❌ Контейнер '$service' имеет статус '$STATUS' после перезапуска."
      ALL_RUNNING=false
    fi
  done
  
  if [ "$ALL_RUNNING" = true ]; then
    log_message "✅ Все контейнеры успешно перезапущены и работают нормально."
  else
    log_message "❌ Некоторые контейнеры не запустились после перезапуска. Требуется ручное вмешательство."
  fi
fi

# Очистка старых логов (оставляем 20 последних)
LOGS_COUNT=$(ls -t "$LOGS_DIR" | grep "containers_logs_before_restart_" | wc -l)
if [ "$LOGS_COUNT" -gt 20 ]; then
  FILES_TO_DELETE=$(($LOGS_COUNT - 20))
  ls -t "$LOGS_DIR" | grep "containers_logs_before_restart_" | tail -$FILES_TO_DELETE | xargs -I {} rm "$LOGS_DIR/{}" 2>/dev/null
  log_message "🧹 Удалено $FILES_TO_DELETE старых файлов логов"
fi

log_message "Проверка состояния контейнеров завершена"
echo "----------------------------------------" 