#!/bin/bash
# Скрипт для запуска ESM-версии теста helpScene

set -e
echo "📋 Запуск ESM-версии теста для helpScene..."

# Устанавливаем переменные окружения для теста
export NODE_ENV=test

# Запускаем тест через node (не через ts-node)
node src/test-utils/tests/scenes/helpScene.test.mjs

# Проверяем код выхода
if [ $? -eq 0 ]; then
  echo "✅ Тест успешно завершен"
  exit 0
else
  echo "❌ Тест завершен с ошибками"
  exit 1
fi 