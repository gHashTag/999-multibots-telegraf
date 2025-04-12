#!/bin/bash

# Скрипт для запуска тестов API

# Устанавливаем переменную окружения для тестов
export NODE_ENV=test
echo "🚀 Запуск тестов API"

# Создаем директорию для логов, если ее нет
mkdir -p logs

# Текущая дата и время для имени файла логов
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="logs/api-tests-${TIMESTAMP}.log"

# Определяем флаги для запуска
DETAILED_FLAG=""
REPORT_FLAG=""

# Проверяем аргументы командной строки
for arg in "$@"
do
  case $arg in
    --detailed)
      DETAILED_FLAG="--detailed"
      ;;
    --report)
      REPORT_FLAG="--report"
      ;;
    *)
      # Неизвестный аргумент
      ;;
  esac
done

# Запускаем тесты и логируем вывод
npx tsx src/test-utils/scripts/test-api.ts $DETAILED_FLAG $REPORT_FLAG | tee "$LOG_FILE"

# Проверяем результат выполнения тестов
TEST_RESULT=${PIPESTATUS[0]}

if [ $TEST_RESULT -eq 0 ]; then
  echo "✅ Тесты API успешно выполнены"
  exit 0
else
  echo "❌ Ошибка при выполнении тестов API (код: $TEST_RESULT)"
  echo "📝 Посмотрите логи для деталей: $LOG_FILE"
  exit $TEST_RESULT
fi 