#!/bin/bash

# Скрипт для запуска всех тестов сцен в собственном фреймворке проекта

echo "🧪 Запуск тестов всех сцен..."

# Устанавливаем NODE_ENV=test
export NODE_ENV=test

# Запускаем тесты через tsx с tsconfig-paths для корректного разрешения алиасов
npx tsx \
  -r tsconfig-paths/register \
  src/test-utils/runScenesTests.ts

# Сохраняем код выхода
EXIT_CODE=$?

# Выводим результат в зависимости от кода выхода
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Все тесты сцен успешно завершены"
else
  echo "❌ Тесты сцен завершились с ошибкой $EXIT_CODE"
fi

exit $EXIT_CODE 