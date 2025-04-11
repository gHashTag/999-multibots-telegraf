#!/bin/bash

# Устанавливаем переменную окружения для тестов
export NODE_ENV=test
echo "🚀 Запуск тестов генерации видео из изображения"

# Создаем директорию для логов, если ее нет
mkdir -p logs

# Текущая дата и время для имени файла логов
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="logs/imageToVideo-tests-${TIMESTAMP}.log"

# Запускаем тесты и логируем вывод
npx tsx src/test-utils/runImageToVideoTests.ts | tee "$LOG_FILE"

# Проверяем результат выполнения тестов
TEST_RESULT=${PIPESTATUS[0]}

if [ $TEST_RESULT -eq 0 ]; then
  echo "✅ Тесты генерации видео из изображения успешно выполнены"
  exit 0
else
  echo "❌ Ошибка при выполнении тестов генерации видео из изображения (код: $TEST_RESULT)"
  echo "📝 Посмотрите логи для деталей: $LOG_FILE"
  exit $TEST_RESULT
fi 