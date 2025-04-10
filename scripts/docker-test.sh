#!/bin/bash

# Скрипт для подготовки и запуска тестов в Docker

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Запуск тестов платежного процессора${NC}"

# Перед запуском Docker убиваем процессы на тестовых портах
echo -e "${YELLOW}⏳ Освобождение портов для тестов...${NC}"
node scripts/kill-port.js 2999 3001

# Запуск тестового окружения
echo -e "${YELLOW}⏳ Запуск Docker Compose...${NC}"
docker-compose -f docker-compose.test.yml down
docker-compose -f docker-compose.test.yml up --build -d

# Ожидание запуска контейнеров
echo -e "${YELLOW}⏳ Ожидание запуска контейнеров...${NC}"
sleep 5

# Проверка логов
echo -e "${BLUE}📋 Вывод логов контейнера...${NC}"
docker logs -f neuro-blogger-telegram-bot-test

# Проверка статуса выполнения
TEST_STATUS=$(docker inspect --format='{{.State.ExitCode}}' neuro-blogger-telegram-bot-test)

# Вывод результатов
if [ "$TEST_STATUS" -eq 0 ]; then
  echo -e "${GREEN}✅ Тест успешно пройден!${NC}"
else
  echo -e "${RED}❌ Тест завершился с ошибкой. Код выхода: $TEST_STATUS${NC}"
fi

# Остановка контейнеров
echo -e "${YELLOW}⏳ Остановка тестового окружения...${NC}"
docker-compose -f docker-compose.test.yml down

exit $TEST_STATUS 