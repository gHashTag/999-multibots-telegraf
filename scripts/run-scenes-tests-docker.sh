#!/bin/bash

# Скрипт для запуска тестов сцен в Docker

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🐳 Запуск тестов сцен в Docker...${NC}"

# Проверяем, запущен ли Docker
docker info > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Docker не запущен! Пожалуйста, запустите Docker и повторите попытку.${NC}"
  exit 1
fi

# Проверяем, есть ли docker-compose.test.yml
if [ ! -f "docker-compose.test.yml" ]; then
  echo -e "${RED}❌ Файл docker-compose.test.yml не найден!${NC}"
  exit 1
fi

# Запускаем контейнеры и ждем их готовности
echo -e "${YELLOW}🚀 Запуск тестовых контейнеров...${NC}"
docker compose -f docker-compose.test.yml up -d --wait

# Проверяем, запустились ли контейнеры
if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Не удалось запустить контейнеры!${NC}"
  docker compose -f docker-compose.test.yml down -v --remove-orphans
  exit 1
fi

echo -e "${GREEN}✅ Тестовые контейнеры запущены!${NC}"

# Запускаем тесты сцен в контейнере
echo -e "${YELLOW}🧪 Запуск тестов сцен...${NC}"
docker compose -f docker-compose.test.yml exec bot-test npx ts-node -r tsconfig-paths/register src/test-utils/runScenesTests.v2.ts

# Сохраняем код возврата тестов
TEST_EXIT_CODE=$?

# Выводим результаты
if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}✅ Тесты сцен успешно пройдены!${NC}"
else
  echo -e "${RED}❌ Тесты сцен завершились с ошибками!${NC}"
fi

# Останавливаем контейнеры
echo -e "${YELLOW}🛑 Останавливаем тестовые контейнеры...${NC}"
docker compose -f docker-compose.test.yml down -v --remove-orphans

echo -e "${BLUE}🏁 Тестирование завершено!${NC}"

# Возвращаем код, который вернули тесты
exit $TEST_EXIT_CODE 