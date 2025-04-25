#!/bin/bash

# Скрипт для запуска бота в Docker через PM2
# Используется внутри контейнера Docker

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функция для логирования
log() {
  local level="$1"
  local message="$2"
  local color="$NC"
  
  case "$level" in
    "INFO")
      color="$BLUE"
      ;;
    "SUCCESS")
      color="$GREEN"
      ;;
    "WARN")
      color="$YELLOW"
      ;;
    "ERROR")
      color="$RED"
      ;;
  esac
  
  echo -e "${color}[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $message${NC}"
}

log "INFO" "🐳 Запуск NeuroBlogger в Docker через PM2..."

# Проверка наличия PM2
if ! command -v pm2 &> /dev/null; then
  log "INFO" "📦 PM2 не обнаружен, устанавливаем..."
  npm install -g pm2
  log "SUCCESS" "✅ PM2 успешно установлен!"
fi

# Проверяем наличие переменных окружения
if [[ -z "$NODE_ENV" ]]; then
  export NODE_ENV=production
  log "WARN" "⚠️ NODE_ENV не установлен, используем значение по умолчанию: $NODE_ENV"
fi

# Устанавливаем зависимости, если node_modules не существует
if [[ ! -d "node_modules" ]]; then
  log "INFO" "📦 Устанавливаем зависимости..."
  npm ci || npm install
  log "SUCCESS" "✅ Зависимости установлены!"
fi

# Проверяем наличие директории dist
if [[ ! -d "dist" ]]; then
  log "INFO" "🏗️ Сборка проекта..."
  npm run build
  log "SUCCESS" "✅ Проект собран!"
fi

# Определяем режим работы бота
if [[ "$POLLING" == "true" ]]; then
  MODE="polling"
elif [[ "$WEBHOOK" == "true" ]]; then
  MODE="webhook"
else
  MODE="default"
  log "WARN" "⚠️ Режим работы не указан (POLLING или WEBHOOK), используем стандартный режим"
fi

# Определяем режим выполнения PM2 в зависимости от количества экземпляров
if [[ "${PM2_INSTANCES:-1}" -gt 1 ]]; then
  EXEC_MODE="cluster"
else
  EXEC_MODE="fork"
fi

# Создаем PM2 конфигурацию
cat > pm2.config.json << EOL
{
  "apps": [
    {
      "name": "neuroblogger",
      "script": "dist/bot.js",
      "instances": ${PM2_INSTANCES:-1},
      "exec_mode": "${EXEC_MODE}",
      "max_memory_restart": "${PM2_MAX_MEMORY:-500M}",
      "watch": false,
      "log_date_format": "YYYY-MM-DD HH:mm:ss Z",
      "env": {
        "NODE_ENV": "${NODE_ENV}",
        "POLLING": "${POLLING}",
        "WEBHOOK": "${WEBHOOK}",
        "PORT": "${PORT:-2999}",
        "FORCE_START": "true"
      }
    }
  ]
}
EOL

# Запускаем PM2 в режиме Docker (не демон)
log "INFO" "🚀 Запускаем PM2 с конфигурацией..."
cat pm2.config.json
log "INFO" "🔄 Режим работы: $MODE"

# Запускаем PM2 в режиме Docker
log "INFO" "🚀 Запускаем бота..."
pm2-runtime start pm2.config.json 