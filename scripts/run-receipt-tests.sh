#!/bin/bash

# Запуск тестов платежных чеков с логированием
echo "🚀 Запуск тестов платежных чеков..."
TIMESTAMP=$(date +%Y%m%d%H%M%S)
LOG_FILE="logs/receipt-tests-${TIMESTAMP}.log"

mkdir -p logs

# Устанавливаем переменные окружения
export NODE_ENV=test
export ENABLE_TEST_MODE=true

# Запускаем тесты и сохраняем результат
node src/test-utils/payment/runPaymentReceiptTestsOnly.js | tee ${LOG_FILE}

# Проверка результата
if [ ${PIPESTATUS[0]} -eq 0 ]; then
  echo "✅ Тесты платежных чеков успешно выполнены"
  exit 0
else
  echo "❌ Тесты платежных чеков завершились с ошибками"
  echo "📊 Подробный лог можно найти в файле: ${LOG_FILE}"
  exit 1
fi 