#!/bin/bash
set -e # Прерывать выполнение при любой ошибке

SCRIPT_NAME=$(basename "$0")
LOG_PREFIX="[${SCRIPT_NAME}]"

echo "$LOG_PREFIX 🕉️ Запускаем раздельную сборку образов Docker..."

# Функция для логирования
log() {
    echo "$LOG_PREFIX $1"
}

# --- Сборка образа app ---
SERVICE_APP="app"
IMAGE_APP="999-multibots-telegraf_${SERVICE_APP}" # Имя образа, которое ожидает docker-compose
CONTEXT_APP="."
DOCKERFILE_APP="Dockerfile"

log "🛠️ Собираем образ для сервиса '${SERVICE_APP}' (тег: ${IMAGE_APP})..."
if docker build --no-cache -t "${IMAGE_APP}" -f "${DOCKERFILE_APP}" "${CONTEXT_APP}"; then
  log "✅ Образ ${IMAGE_APP} успешно собран."
else
  log "❌ Ошибка при сборке образа ${IMAGE_APP}."
  exit 1
fi

# --- Сборка образа ai-server ---
SERVICE_AI="ai-server"
IMAGE_AI="999-multibots-telegraf_${SERVICE_AI}" # Имя образа, которое ожидает docker-compose
CONTEXT_AI="./packages/ai-server"
DOCKERFILE_AI="Dockerfile" # Имя Dockerfile внутри контекста

log "🛠️ Собираем образ для сервиса '${SERVICE_AI}' (тег: ${IMAGE_AI})..."
if docker build --no-cache -t "${IMAGE_AI}" -f "${CONTEXT_AI}/${DOCKERFILE_AI}" "${CONTEXT_AI}"; then
  log "✅ Образ ${IMAGE_AI} успешно собран."
else
  log "❌ Ошибка при сборке образа ${IMAGE_AI}."
  exit 1
fi

log "🕉️ Раздельная сборка образов успешно завершена."
exit 0 