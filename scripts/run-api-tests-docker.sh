#!/bin/bash

# Скрипт для запуска тестов API в Docker

# Текущая дата и время для имени файла логов
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="logs/docker-api-tests-${TIMESTAMP}.log"

# Создаем директорию для логов, если она не существует
mkdir -p logs

echo "🚀 Запуск тестов API в Docker..."

# Запускаем тесты в контейнере
docker exec -it neuro-blogger-telegram-bot npm run test:api | tee "${LOG_FILE}"

# Проверяем результат выполнения команды 
# (PIPESTATUS[0] - результат первой команды в пайпе)
TEST_RESULT=${PIPESTATUS[0]}

if [ $TEST_RESULT -eq 0 ]; then
  echo "✅ Тесты API успешно выполнены в Docker"
  exit 0
else
  echo "❌ Ошибка при выполнении тестов API в Docker (код: $TEST_RESULT)"
  echo "📝 Посмотрите логи для деталей: ${LOG_FILE}"
  exit $TEST_RESULT
fi 