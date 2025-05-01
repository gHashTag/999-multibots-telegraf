#!/bin/sh

# Строгий режим
set -e

# Включение логгирования команд (опционально)
# set -x

# --- Константы и Переменные ---
LOG_DIR="/app/logs"
ENV_FILE="/app/.env"
APP_NAME="neuroblogger" # Имя для PM2

# --- Функции ---
log_message() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# --- Основной скрипт ---
log_message "🚀 Инициализация Entrypoint..."
log_message "🔍 Текущая директория: $(pwd)"

# Проверка наличия необходимых команд
log_message "🔍 Проверка наличия необходимых команд (node, bun, pm2)..."
command -v node >/dev/null 2>&1 || { log_message "❌ Ошибка: node не найден."; exit 1; }
# bun пока опционален, pm2 будет установлен через npm install, проверяем его позже
log_message "✅ Необходимые команды найдены."


# Создание необходимых директорий
log_message "📁 Создание необходимых директорий (logs)..."
mkdir -p "$LOG_DIR"
log_message "✅ Директории созданы/проверены."

# Проверка наличия package.json и установка зависимостей, если нужно
if [ -f "/app/package.json" ]; then
  if [ ! -d "/app/node_modules" ]; then
    log_message "📦 Файл package.json найден, но нет node_modules. Запуск npm install..."
    # Используем npm ci для более предсказуемой установки
    if [ -f "/app/package-lock.json" ]; then
      npm ci --legacy-peer-deps
    else
      npm install --legacy-peer-deps
    fi
    log_message "✅ Зависимости установлены."
  else
    log_message "✅ Директория node_modules уже существует."
  fi
  # Проверка наличия pm2 после установки
  log_message "📦 Проверка наличия критически важных модулей (pm2)..."
  if ! npm list pm2 >/dev/null 2>&1; then
      log_message "❌ Ошибка: pm2 не найден после npm install. Проверьте зависимости."
      # Попытка установить глобально как fallback? Или просто выход? Пока выход.
      exit 1
  fi
   log_message "✅ Критически важные модули найдены."

else
  log_message "⚠️ Файл package.json не найден. Пропуск установки зависимостей."
fi

# Дополнительные проверки перед запуском
# Например, проверка доступности базы данных, если нужно

# Запуск приложения через PM2
log_message "🚀 Запуск приложения '$APP_NAME' через PM2..."
# Запускаем в режиме no-daemon, чтобы логи шли в stdout/stderr контейнера
# и Docker мог их собирать. PM2 будет PID 1 в контейнере.
# Используем exec для замены текущего процесса на pm2
exec pm2-runtime start dist/bot.js --name "$APP_NAME" --no-autorestart

# Если pm2-runtime завершится, скрипт тоже завершится.
# Этот код не должен выполниться при нормальной работе pm2-runtime
log_message "🏁 Entrypoint завершил работу (это неожиданно, если PM2 должен был запуститься)." 