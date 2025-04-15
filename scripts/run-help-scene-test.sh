#!/bin/bash

# Скрипт для запуска теста helpScene в собственном фреймворке проекта

echo "🧪 Запуск теста helpScene..."

# Устанавливаем NODE_ENV=test
export NODE_ENV=test

# Запускаем тест через tsx с tsconfig-paths для корректного разрешения алиасов
npx tsx \
  -r tsconfig-paths/register \
  src/test-utils/tests/scenes/helpScene.test.ts

# Сохраняем код выхода
EXIT_CODE=$?

# Выводим результат в зависимости от кода выхода
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Тест helpScene успешно завершен"
else
  echo "❌ Тест helpScene завершился с ошибкой $EXIT_CODE"
fi

exit $EXIT_CODE 