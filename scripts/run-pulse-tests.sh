#!/bin/bash

# Имя скрипта для логов
SCRIPT_NAME="run-pulse-tests.sh"

# Создаем директорию для логов, если не существует
mkdir -p logs

# Текущая дата и время для имени файла лога
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
LOG_FILE="logs/pulse-tests-$TIMESTAMP.log"

echo "🚀 Запуск тестов интеграции Pulse..."
echo "📝 Логи записываются в $LOG_FILE"

# Устанавливаем переменную окружения NODE_ENV в значение 'test'
NODE_ENV=test npx tsx src/test-utils/runPulseIntegrationTests.ts | tee -a "$LOG_FILE"

# Проверяем результат выполнения
RESULT=${PIPESTATUS[0]}

if [ $RESULT -eq 0 ]; then
  echo "✅ Тесты интеграции Pulse успешно выполнены"
  exit 0
else
  echo "❌ Тесты интеграции Pulse завершились с ошибкой"
  exit 1
fi 