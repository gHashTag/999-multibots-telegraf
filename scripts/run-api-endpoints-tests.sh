#!/bin/bash

# Скрипт для запуска тестов API эндпоинтов

# Устанавливаем переменные окружения
export NODE_ENV=test

# Выводим информацию о запуске
echo "🚀 Запуск тестов API эндпоинтов..."
echo "🚀 Starting API endpoints tests..."

# Запускаем тесты
npx ts-node -r tsconfig-paths/register src/test-utils/tests/api/apiEndpointTest.ts "$@"

# Получаем код возврата
EXIT_CODE=$?

# Выводим результат
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Тесты API эндпоинтов успешно пройдены"
  echo "✅ API endpoints tests completed successfully"
else
  echo "❌ Тесты API эндпоинтов не пройдены"
  echo "❌ API endpoints tests failed"
fi

# Возвращаем код возврата тестов
exit $EXIT_CODE 