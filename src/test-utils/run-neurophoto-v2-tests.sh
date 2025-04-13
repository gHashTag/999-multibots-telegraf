#!/bin/bash
# Запуск тестов только для сцены neuroPhotoWizardV2 (Flux Pro)

echo "🖼✨ Запуск тестов нейрофото V2 (Flux Pro)"
echo "=========================================="

# Устанавливаем тестовое окружение
export TEST=true
export NODE_ENV=test

# Запускаем тесты
cd /Users/playom/999-multibots-telegraf/src/test-utils
node simplest-test-neurophoto-v2.js

# Проверяем код выхода
if [ $? -eq 0 ]; then
  echo "✅ Тесты нейрофото V2 успешно выполнены"
  exit 0
else
  echo "❌ Тесты нейрофото V2 завершились с ошибками"
  exit 1
fi 