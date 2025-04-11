#!/bin/bash

# Запуск теста простой генерации платежного чека с логированием
echo "🚀 Запуск теста простой генерации платежного чека..."
TIMESTAMP=$(date +%Y%m%d%H%M%S)
LOG_FILE="logs/simple-receipt-test-${TIMESTAMP}.log"

mkdir -p logs

# Устанавливаем переменные окружения
export NODE_ENV=test
export ENABLE_TEST_MODE=true

# Запускаем тест и сохраняем результат
node src/test-utils/payment/runSimpleReceiptTest.js | tee ${LOG_FILE}

# Проверка результата
if [ ${PIPESTATUS[0]} -eq 0 ]; then
  echo "✅ Тест простой генерации платежного чека успешно выполнен"
  exit 0
else
  echo "❌ Тест простой генерации платежного чека завершился с ошибками"
  echo "📊 Подробный лог можно найти в файле: ${LOG_FILE}"
  exit 1
fi 