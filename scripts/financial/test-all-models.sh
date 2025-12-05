#!/bin/bash

# Тест всех моделей пользователя
# Использует API диагностики для получения моделей и тестирования

TELEGRAM_ID="144022504"
API_URL="http://188.137.250.69:3001/api/diagnostic/models/$TELEGRAM_ID"

echo "🧪 ТЕСТИРОВАНИЕ ВСЕХ МОДЕЛЕЙ ПОЛЬЗОВАТЕЛЯ $TELEGRAM_ID"
echo "=================================================="
echo ""

# Получаем список всех моделей
echo "📋 Получение списка моделей..."
MODELS_JSON=$(curl -s "$API_URL" 2>/dev/null)

if [ -z "$MODELS_JSON" ]; then
    echo "❌ Не удалось получить данные с API"
    echo "Проверьте доступность сервера: $API_URL"
    exit 1
fi

echo "✅ Данные получены"
echo ""
echo "📊 СТАТИСТИКА:"
echo "$MODELS_JSON" | jq -r '.total_models as $total | .replicate_models_count as $rep | .other_models_count as $other | "Всего моделей: \($total)\nReplicate: \($rep)\nДругие: \($other)"' 2>/dev/null || echo "$MODELS_JSON"
echo ""

# Получаем Replicate модели
echo "🔄 REPLICATE МОДЕЛИ:"
echo "$MODELS_JSON" | jq -r '.replicate_models[] | "  - \(.model_name) (\(.api)) - \(.model_url[0:50])..."' 2>/dev/null
echo ""

# Получаем другие модели
echo "🎭 ДРУГИЕ МОДЕЛИ:"
echo "$MODELS_JSON" | jq -r '.other_models[] | "  - \(.model_name) (\(.api)) - \(.model_url[0:50])..."' 2>/dev/null
echo ""

echo "✅ Анализ завершен!"
echo ""
echo "💡 Для детального тестирования генерации:"
echo "   Используйте бот в Telegram с промптом для вашей модели"
echo ""
echo "🔍 Для проверки логов используйте:"
echo "   /check или ssh на сервер для просмотра Docker logs"
