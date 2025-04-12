#!/bin/bash

# Устанавливаем окружение для тестов
export NODE_ENV=test

# Текущая дата и время для логов
TIMESTAMP=$(date "+%Y-%m-%d_%H-%M-%S")
LOGS_DIR="logs"
LOG_FILE="$LOGS_DIR/ambassador-tests-$TIMESTAMP.log"

# Создаем директорию для логов, если она не существует
mkdir -p $LOGS_DIR

echo "🚀 Запуск тестов Ambassador..."

# Запускаем тесты и логируем вывод
npm run test:ambassador | tee $LOG_FILE

# Проверяем результат тестов
if [ ${PIPESTATUS[0]} -eq 0 ]; then
  echo "✅ Тесты Ambassador успешно выполнены"
  exit 0
else
  echo "❌ Тесты Ambassador завершились с ошибками. См. логи: $LOG_FILE"
  exit 1
fi 