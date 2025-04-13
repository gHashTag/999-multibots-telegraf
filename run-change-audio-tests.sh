#!/bin/bash

echo "Запускаем тесты для сцены Change Audio..."
export TEST=true
export NODE_ENV=test

cd /Users/playom/999-multibots-telegraf/src/test-utils

# Run the test directly
node simplest-test-change-audio.js

# Check exit code
if [ $? -eq 0 ]; then
  echo "✅ Тесты успешно пройдены!"
  exit 0
else
  echo "❌ Тесты завершились с ошибками."
  exit 1
fi
