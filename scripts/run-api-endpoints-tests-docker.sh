#!/bin/bash

# Скрипт для запуска тестов API эндпоинтов в Docker

# Определяем цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Выводим информацию о запуске
echo -e "${BLUE}🚀 Запуск тестов API эндпоинтов в Docker...${NC}"
echo -e "${BLUE}🚀 Starting API endpoints tests in Docker...${NC}"

# Имя контейнера для тестов
CONTAINER_NAME="neuro-blogger-telegram-bot-test"

# Сборка контейнера для тестов
echo -e "${YELLOW}🔧 Сборка тестового контейнера...${NC}"
docker-compose -f docker-compose.test.yml build

# Запуск контейнера для тестов
echo -e "${YELLOW}🔄 Запуск тестового контейнера...${NC}"
docker-compose -f docker-compose.test.yml up -d

# Ожидание запуска контейнера
echo -e "${YELLOW}⏳ Ожидание запуска контейнера...${NC}"
sleep 5

# Запуск тестов API эндпоинтов в контейнере
echo -e "${YELLOW}🧪 Запуск тестов API эндпоинтов...${NC}"
docker exec $CONTAINER_NAME bash -c "npm run test:api:endpoints"

# Получаем код возврата
EXIT_CODE=$?

# Вывод логов для диагностики в случае ошибки
if [ $EXIT_CODE -ne 0 ]; then
  echo -e "${RED}❌ Тесты не пройдены. Вывод логов для диагностики:${NC}"
  docker logs $CONTAINER_NAME | tail -n 50
fi

# Остановка и удаление контейнера
echo -e "${YELLOW}🔄 Остановка и удаление тестового контейнера...${NC}"
docker-compose -f docker-compose.test.yml down -v

# Выводим результат
if [ $EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}✅ Тесты API эндпоинтов успешно пройдены${NC}"
  echo -e "${GREEN}✅ API endpoints tests completed successfully${NC}"
else
  echo -e "${RED}❌ Тесты API эндпоинтов не пройдены${NC}"
  echo -e "${RED}❌ API endpoints tests failed${NC}"
fi

# Возвращаем код возврата тестов
exit $EXIT_CODE 