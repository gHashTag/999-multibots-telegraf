#!/bin/bash

# Тест Google Nano Banana через Replicate API
# Использует изображение пользователя и трансформирует его в стиле персонажа

REPLICATE_API_TOKEN=$(grep REPLICATE_API_TOKEN .env | cut -d '=' -f2)

echo "🎨 Тестируем Google Nano Banana API..."
echo "================================================"

# Создаем prediction
RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "prompt": "Transform person into mighty Russian warrior Ilya Muromets. Ancient Russian armor with chainmail and helmet. Powerful build. Holding massive sword and shield. Epic heroic pose. Russian steppe landscape background. Dramatic storm clouds. Heroic lighting with strong contrasts. Cinematic portrait, professional photography.",
      "image_input": [
        "https://api.telegram.org/file/bot7313269542:AAG6NLu6NRSblDvWhd2-M26auR1BLNZiLoU/photos/file_6.jpg"
      ]
    }
  }' \
  https://api.replicate.com/v1/models/google/nano-banana/predictions)

echo "Response from Replicate:"
echo "$RESPONSE" | jq '.'

# Извлекаем ID предсказания
PREDICTION_ID=$(echo "$RESPONSE" | jq -r '.id')

if [ "$PREDICTION_ID" = "null" ] || [ -z "$PREDICTION_ID" ]; then
  echo "❌ Ошибка: не удалось создать prediction"
  echo "Полный ответ:"
  echo "$RESPONSE"
  exit 1
fi

echo ""
echo "✅ Prediction создан с ID: $PREDICTION_ID"
echo "⏳ Ожидаем результат (это может занять 10-30 секунд)..."

# Проверяем статус каждые 2 секунды
for i in {1..30}; do
  sleep 2
  
  STATUS_RESPONSE=$(curl -s \
    -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
    "https://api.replicate.com/v1/predictions/$PREDICTION_ID")
  
  STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.status')
  
  echo "Статус: $STATUS"
  
  if [ "$STATUS" = "succeeded" ]; then
    echo ""
    echo "✅ Генерация завершена!"
    OUTPUT=$(echo "$STATUS_RESPONSE" | jq -r '.output')
    echo "📸 URL изображения: $OUTPUT"
    
    # Скачиваем изображение
    if [ ! -z "$OUTPUT" ] && [ "$OUTPUT" != "null" ]; then
      echo "⬇️ Скачиваем изображение..."
      curl -s "$OUTPUT" -o "test-nano-banana-result.jpg"
      echo "✅ Изображение сохранено как test-nano-banana-result.jpg"
      
      # Открываем изображение (на macOS)
      if command -v open &> /dev/null; then
        open test-nano-banana-result.jpg
      fi
    fi
    
    break
  elif [ "$STATUS" = "failed" ]; then
    echo ""
    echo "❌ Генерация не удалась"
    echo "Ошибка:"
    echo "$STATUS_RESPONSE" | jq '.error'
    exit 1
  fi
done

echo ""
echo "================================================"
echo "Тест завершен!"