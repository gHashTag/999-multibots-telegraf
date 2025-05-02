#!/bin/bash

# === Скрипт для генерации видео из картинки через Replicate (Модель Haiper) ===
#
# Этот скрипт автоматизирует шаги, описанные в README.md,
# используя curl, jq, base64 и file.
#
# Использование:
#   bash scripts/generate_video_from_image.sh <REPLICATE_API_TOKEN> <IMAGE_URL> "<PROMPT>"
#
# Пример:
#   bash scripts/generate_video_from_image.sh "r8_abc...xyz" "https://example.com/image.jpg" "Летящий кот"
#

# === Безопасный режим ===
set -e # Выход при любой ошибке
set -u # Ошибка при использовании необъявленной переменной
set -o pipefail # Ошибка, если команда в пайплайне (|) завершилась с ошибкой

# === Проверка аргументов ===
if [ "$#" -ne 3 ]; then
  echo "Ошибка: Неверное количество аргументов."
  echo "Использование: $0 <REPLICATE_API_TOKEN> <IMAGE_URL> \"<PROMPT>\""
  exit 1
fi

# === Шаг 0: Присваиваем аргументы переменным ===
REPLICATE_API_TOKEN="$1"
IMAGE_URL="$2"
PROMPT="$3"

# Задаем параметры модели Haiper и временный файл
REPLICATE_MODEL_ID="haiper-ai/haiper-video-2:latest"
IMAGE_INPUT_KEY="image" # Предполагаемое имя поля для картинки
TEMP_IMAGE_FILE="/tmp/temp_image_$$.jpg"

echo "Начинаем генерацию видео..."
echo "  Модель: $REPLICATE_MODEL_ID"
echo "  URL картинки: $IMAGE_URL"
echo "  Промпт: $PROMPT"

# === Шаг 1: Скачиваем картинку ===
echo
echo "--- Шаг 1: Скачиваю картинку --- "
curl -L -s -o "$TEMP_IMAGE_FILE" "$IMAGE_URL"
# Проверяем код возврата curl
if [ $? -ne 0 ]; then
  echo "ОШИБКА: Не удалось скачать картинку! Проверь ссылку $IMAGE_URL"
  exit 1
fi
echo "Картинка успешно скачана во временный файл: $TEMP_IMAGE_FILE"

# === Шаг 2: Готовим картинку к отправке ===
echo
echo "--- Шаг 2: Готовлю картинку (кодирую в Base64) --- "
IMAGE_MIME=$(file --mime-type -b "$TEMP_IMAGE_FILE")
IMAGE_BASE64=$(base64 -i "$TEMP_IMAGE_FILE")
IMAGE_DATA_URI="data:$IMAGE_MIME;base64,$IMAGE_BASE64"
echo "Картинка подготовлена!"

# === Шаг 3: Собираем посылку для Replicate (в формате JSON) ===
echo
echo "--- Шаг 3: Собираю JSON-запрос для Replicate --- "
REPLICATE_MODEL_ID="haiper-ai/haiper-video-2"
MODEL_VERSION="latest"
JSON_INPUT=$(jq -n \
    --arg img_uri "$IMAGE_DATA_URI" \
    --arg prompt "$PROMPT" \
    --arg version "$MODEL_VERSION" \
    --arg duration "4" \
    --arg resolution "720" \
    '{ "input": { "image": $img_uri, "prompt": $prompt, "version": $version, "duration": $duration, "resolution": $resolution } }'
)
echo "JSON-запрос готов."
echo "$JSON_INPUT" | jq .
# echo "$JSON_INPUT" | jq . # Раскомментируй для отладки JSON

# === Шаг 4: Отправляем запрос в Replicate и получаем ID задачи ===
echo
echo "--- Шаг 4: Отправляю запрос в Replicate --- "
REPLICATE_API_ENDPOINT="https://api.replicate.com/v1/predictions"
PREDICTION_RESPONSE=$(curl -s -X POST \
  -H "Authorization: Token $REPLICATE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$JSON_INPUT" \
  "$REPLICATE_API_ENDPOINT")

if echo "$PREDICTION_RESPONSE" | jq -e '.detail' > /dev/null; then
  echo "ОШИБКА при создании задачи Replicate:"
  echo "$PREDICTION_RESPONSE" | jq .
  rm "$TEMP_IMAGE_FILE" # Удаляем временный файл при ошибке
  exit 1
fi

PREDICTION_ID=$(echo "$PREDICTION_RESPONSE" | jq -r '.id')
PREDICTION_STATUS=$(echo "$PREDICTION_RESPONSE" | jq -r '.status')
echo "Запрос отправлен! ID задачи: $PREDICTION_ID (Статус: $PREDICTION_STATUS)"

# === Шаг 5: Ждем, пока Replicate сделает видео ===
echo
echo "--- Шаг 5: Жду завершения задачи (опрашиваю Replicate) --- "
GET_PREDICTION_URL="$REPLICATE_API_ENDPOINT/$PREDICTION_ID"

while [[ "$PREDICTION_STATUS" == "starting" || "$PREDICTION_STATUS" == "processing" ]]; do
  echo "Текущий статус: $PREDICTION_STATUS. Жду 5 секунд..."
  sleep 5
  POLL_RESPONSE=$(curl -s -H "Authorization: Token $REPLICATE_API_TOKEN" "$GET_PREDICTION_URL")
  PREDICTION_STATUS=$(echo "$POLL_RESPONSE" | jq -r '.status')
done
echo "Задача завершена! Финальный статус: $PREDICTION_STATUS"

# === Шаг 6: Получаем ссылку на видео (если всё успешно) ===
echo
echo "--- Шаг 6: Получаю результат --- "
if [[ "$PREDICTION_STATUS" == "succeeded" ]]; then
  echo "Успех! Извлекаю ссылку на видео..."
  VIDEO_URL=$(echo "$POLL_RESPONSE" | jq -r '.output | if type=="array" then .[0] else . end')

  if [[ -z "$VIDEO_URL" || "$VIDEO_URL" == "null" ]]; then
    echo "ОШИБКА: Не смог найти ссылку на видео в ответе!"
    echo "Ответ от Replicate (output):"
    echo "$POLL_RESPONSE" | jq '.output'
    rm "$TEMP_IMAGE_FILE" # Удаляем временный файл при ошибке
    exit 1
  fi
  echo
  echo "=================================================="
  echo "ГОТОВО! Видео создано. Ссылку можно отправлять пользователю:"
  echo "$VIDEO_URL"
  echo "=================================================="

elif [[ "$PREDICTION_STATUS" == "failed" || "$PREDICTION_STATUS" == "canceled" ]]; then
  echo "ОШИБКА: Задача Replicate не удалась или была отменена."
  echo "Подробности ошибки:"
  echo "$POLL_RESPONSE" | jq '.error'
  rm "$TEMP_IMAGE_FILE" # Удаляем временный файл при ошибке
  exit 1
else
  echo "ОШИБКА: Неизвестный финальный статус: $PREDICTION_STATUS"
  echo "Полный ответ:"
  echo "$POLL_RESPONSE" | jq .
  rm "$TEMP_IMAGE_FILE" # Удаляем временный файл при ошибке
  exit 1
fi

# === Шаг 7: Уборка ===
echo
echo "--- Шаг 7: Уборка --- "
rm "$TEMP_IMAGE_FILE"
echo "Временный файл картинки удален."

echo
echo "Скрипт успешно завершен! ✨"

exit 0 