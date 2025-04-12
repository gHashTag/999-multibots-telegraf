#!/bin/bash

# Скрипт для запуска тестов Inngest

# Устанавливаем переменную окружения для тестов
export NODE_ENV=test
echo "🚀 Запуск тестов Inngest"

# Создаем директорию для логов, если ее нет
mkdir -p logs

# Текущая дата и время для имени файла логов
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="logs/inngest-tests-${TIMESTAMP}.log"

# Запускаем тесты и логируем вывод
npx tsx src/test-utils/scripts/test-inngest.ts | tee "$LOG_FILE"

# Проверяем результат выполнения тестов
TEST_RESULT=${PIPESTATUS[0]}

if [ $TEST_RESULT -eq 0 ]; then
  echo "✅ Тесты Inngest успешно выполнены"
  exit 0
else
  echo "❌ Ошибка при выполнении тестов Inngest (код: $TEST_RESULT)"
  echo "📝 Посмотрите логи для деталей: $LOG_FILE"
  exit $TEST_RESULT
fi 