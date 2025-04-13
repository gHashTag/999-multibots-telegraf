#!/bin/bash
# Запуск тестов только для сцены neuroPhotoScene (Flux)

echo "🖼 Запуск тестов нейрофото (Flux)"
echo "================================="

# Устанавливаем тестовое окружение
export TEST=true
export NODE_ENV=test

# Запускаем тесты
cd /Users/playom/999-multibots-telegraf/src/test-utils
node simplest-test.js

# Проверяем код выхода
if [ $? -eq 0 ]; then
  echo "✅ Тесты нейрофото успешно выполнены"
  exit 0
else
  echo "❌ Тесты нейрофото завершились с ошибками"
  exit 1
fi 