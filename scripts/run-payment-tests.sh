#!/bin/bash

# Запуск тестов платежной системы с логированием
echo "🚀 Запуск тестов платежной системы..."
TIMESTAMP=$(date +%Y%m%d%H%M%S)
LOG_FILE="logs/payment-tests-${TIMESTAMP}.log"

mkdir -p logs

# Устанавливаем переменные окружения
export NODE_ENV=test
export ENABLE_TEST_MODE=true

# Запускаем тесты и сохраняем результат
node src/test-utils/payment/runPaymentTests.js | tee ${LOG_FILE}

# Проверка результата
if [ ${PIPESTATUS[0]} -eq 0 ]; then
  echo "✅ Тесты платежной системы успешно выполнены"
  exit 0
else
  echo "❌ Тесты платежной системы завершились с ошибками"
  echo "📊 Подробный лог можно найти в файле: ${LOG_FILE}"
  exit 1
fi 