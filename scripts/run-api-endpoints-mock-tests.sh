#!/bin/bash

# Скрипт для запуска тестов API эндпоинтов с моками

# Устанавливаем переменные окружения
export NODE_ENV=test

# Выводим информацию о запуске
echo "🚀 Запуск тестов API эндпоинтов с моками..."
echo "🚀 Starting API endpoints tests with mocks..."

# Запускаем тесты с передачей дополнительных аргументов для отчета
VERBOSE=true LOG_LEVEL=info npx ts-node -r tsconfig-paths/register src/test-utils/tests/api/apiEndpointTestMock.ts "$@"

# Получаем код возврата
EXIT_CODE=$?

# Выводим результат
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Тесты API эндпоинтов с моками успешно пройдены"
  echo "✅ API endpoints tests with mocks completed successfully"
else
  echo "❌ Тесты API эндпоинтов с моками не пройдены"
  echo "❌ API endpoints tests with mocks failed"
fi

# Возвращаем код возврата тестов
exit $EXIT_CODE 