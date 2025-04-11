#!/bin/bash

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Запуск тестов амбассадорских уведомлений...${NC}"

# Проверка, запущен ли Docker
docker ps > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Docker не запущен. Пожалуйста, запустите Docker.${NC}"
  exit 1
fi

# Проверка, существует ли контейнер
docker-compose -f docker-compose.test.yml ps | grep neuro-blogger-telegram-bot-test > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo -e "${YELLOW}⚠️ Тестовый контейнер не запущен. Запускаем...${NC}"
  docker-compose -f docker-compose.test.yml up -d
fi

# Запуск тестов внутри контейнера
echo -e "${BLUE}🔍 Выполнение тестов амбассадорских уведомлений...${NC}"
docker exec neuro-blogger-telegram-bot-test npm run test:ambassador | cat

# Проверка статуса выполнения
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Тесты амбассадорских уведомлений успешно завершены!${NC}"
  exit 0
else
  echo -e "${RED}❌ Тесты амбассадорских уведомлений завершились с ошибками.${NC}"
  exit 1
fi 