#!/bin/bash

# Скрипт для запуска API тестов в Docker
#
# Использование: 
#   npm run docker:test:api
#   или
#   bash scripts/run-api-tests-docker.sh
#
# Опции:
#   --detailed - запустить детальное тестирование
#   --report - сгенерировать отчет о тестировании
#   --output=FILE - сохранить отчет в файл

# Устанавливаем переменные
IMAGE_NAME="neuro-blogger-api-test"
CONTAINER_NAME="neuro-blogger-api-test-run"
TEST_COMMAND="npm run test:api"

# Проверяем опции командной строки
if [[ "$*" == *"--detailed"* ]]; then
  TEST_COMMAND="npm run test:api:detailed"
fi

if [[ "$*" == *"--report"* ]]; then
  TEST_COMMAND="$TEST_COMMAND -- --report"
fi

for arg in "$@"; do
  if [[ $arg == --output=* ]]; then
    OUTPUT_FILE="${arg#*=}"
    TEST_COMMAND="$TEST_COMMAND -- $arg"
  fi
done

echo "🚀 Запускаем API тесты в Docker..."
echo "📋 Команда: $TEST_COMMAND"

# Создаем временный Dockerfile для тестов
cat > Dockerfile.api-test << EOF
FROM node:18-alpine

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci

# Копируем исходный код
COPY . .

# Устанавливаем переменные окружения для тестов
ENV NODE_ENV=test
ENV API_URL=http://host.docker.internal:2999

# Запускаем тесты
CMD $TEST_COMMAND
EOF

# Строим Docker-образ
docker build -t $IMAGE_NAME -f Dockerfile.api-test .

# Удаляем существующий контейнер, если он есть
docker rm -f $CONTAINER_NAME 2>/dev/null || true

# Запускаем тест в Docker
docker run \
  --name $CONTAINER_NAME \
  --network host \
  -e "API_URL=http://localhost:2999" \
  -v $(pwd)/logs:/app/logs \
  $IMAGE_NAME

# Получаем код выхода контейнера
EXIT_CODE=$(docker inspect $CONTAINER_NAME --format='{{.State.ExitCode}}')

# Выводим логи контейнера
echo "📝 Логи теста API:"
docker logs $CONTAINER_NAME

# Очищаем контейнер и временный Dockerfile
docker rm $CONTAINER_NAME
rm Dockerfile.api-test

# Если был указан файл для отчета, проверяем его наличие
if [[ -n "$OUTPUT_FILE" && -f "$OUTPUT_FILE" ]]; then
  echo "📄 Отчет сохранен в файл: $OUTPUT_FILE"
  cat "$OUTPUT_FILE"
fi

# Выводим итоговый результат
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Тесты API успешно пройдены!"
  exit 0
else
  echo "❌ Тесты API завершились с ошибками! Код выхода: $EXIT_CODE"
  exit $EXIT_CODE
fi 