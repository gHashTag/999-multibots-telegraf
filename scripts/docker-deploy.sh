#!/bin/bash

# Строгий режим: выход при любой ошибке
set -e

# --- Конфигурация ---
readonly COMPOSE_FILE="docker-compose.yml"
readonly APP_CONTAINER_NAME="999-multibots"
readonly PROXY_CONTAINER_NAME="bot-proxy"
readonly LOG_CHECK_DELAY=10 # Секунд ожидания перед проверкой логов
readonly LOG_LINES_TO_CHECK=50 # Сколько последних строк лога проверять

# --- Функции ---
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DeployScript] $1"
}

# --- Основной скрипт ---
log_message "🚀 Начало развертывания Docker..."

log_message "🧹 Шаг 1: Остановка и удаление старых контейнеров..."
docker-compose -f "$COMPOSE_FILE" down --remove-orphans
log_message "🧹 Шаг 1.5: Принудительное удаление контейнеров (на случай, если down не сработал)..."
docker rm -f 999-multibots bot-proxy || true
log_message "✅ Старые контейнеры остановлены и удалены."

log_message "🛠️ Шаг 2: Пересборка образов без кэша..."
docker-compose -f "$COMPOSE_FILE" build --no-cache
log_message "✅ Образы пересобраны."

log_message "⚡ Шаг 3: Запуск новых контейнеров в фоновом режиме..."
docker-compose -f "$COMPOSE_FILE" up --build -d
log_message "✅ Контейнеры запущены."

log_message "⏳ Шаг 4: Ожидание ${LOG_CHECK_DELAY} секунд для стабилизации контейнеров..."
sleep $LOG_CHECK_DELAY

log_message "🔍 Шаг 5: Проверка статуса контейнеров..."
APP_STATUS=$(docker ps -q -f name="^/${APP_CONTAINER_NAME}$")
PROXY_STATUS=$(docker ps -q -f name="^/${PROXY_CONTAINER_NAME}$")

if [ -z "$APP_STATUS" ]; then
    log_message "❌ Ошибка: Контейнер приложения '$APP_CONTAINER_NAME' не запущен!"
    # Попытка показать логи упавшего контейнера
    FALLEN_CONTAINER_ID=$(docker ps -a -q -f status=exited -f name="^/${APP_CONTAINER_NAME}$")
    if [ -n "$FALLEN_CONTAINER_ID" ]; then
        log_message "📜 Логи упавшего контейнера '$APP_CONTAINER_NAME':"
        docker logs "$FALLEN_CONTAINER_ID" --tail $LOG_LINES_TO_CHECK || log_message "Не удалось получить логи упавшего контейнера."
    else
        log_message "Не найдены запущенные или упавшие контейнеры '$APP_CONTAINER_NAME'."
    fi
    exit 1
else
    log_message "✅ Контейнер приложения '$APP_CONTAINER_NAME' запущен (ID: $APP_STATUS)."
fi

if [ -z "$PROXY_STATUS" ]; then
    log_message "❌ Ошибка: Контейнер прокси '$PROXY_CONTAINER_NAME' не запущен!"
    exit 1
else
    log_message "✅ Контейнер прокси '$PROXY_CONTAINER_NAME' запущен (ID: $PROXY_STATUS)."
fi

log_message "📜 Шаг 6: Проверка последних ${LOG_LINES_TO_CHECK} строк логов контейнера '$APP_CONTAINER_NAME'..."
# Получаем последние N строк лога
RECENT_LOGS=$(docker logs --tail $LOG_LINES_TO_CHECK "$APP_CONTAINER_NAME" 2>&1)

log_message "--- Начало логов ($APP_CONTAINER_NAME) ---"
echo "$RECENT_LOGS"
log_message "--- Конец логов ($APP_CONTAINER_NAME) ---"

# Ищем явные признаки ошибки в entrypoint или запуске PM2
# (Можно добавить более специфичные проверки)
if echo "$RECENT_LOGS" | grep -q -E '(command not found|Error:|Failed|Cannot find module)'; then
    log_message "❌ Обнаружены потенциальные ошибки в логах контейнера '$APP_CONTAINER_NAME'. Проверьте вывод выше."
    # Не выходим, просто предупреждаем
else
    log_message "✅ Критических ошибок в последних логах не обнаружено (базовая проверка)."
fi

# Опционально: Проверка переменных внутри контейнера
log_message "🔧 Шаг 7: Проверка ключевых переменных окружения внутри '$APP_CONTAINER_NAME'..."
# Проверяем SUPABASE_URL и один из токенов
SUPABASE_VAR=$(docker exec "$APP_CONTAINER_NAME" printenv SUPABASE_URL || echo "MISSING")
BOT_TOKEN_VAR=$(docker exec "$APP_CONTAINER_NAME" printenv BOT_TOKEN_1 || echo "MISSING")

if [ "$SUPABASE_VAR" = "MISSING" ] || [ -z "$SUPABASE_VAR" ]; then
    log_message "⚠️ Переменная SUPABASE_URL не найдена или пуста внутри контейнера!"
else
    log_message "✅ Переменная SUPABASE_URL найдена."
fi

if [ "$BOT_TOKEN_VAR" = "MISSING" ] || [ -z "$BOT_TOKEN_VAR" ]; then
    log_message "⚠️ Переменная BOT_TOKEN_1 не найдена или пуста внутри контейнера!"
else
    log_message "✅ Переменная BOT_TOKEN_1 найдена."
fi

log_message "🏁 Развертывание Docker завершено!" 