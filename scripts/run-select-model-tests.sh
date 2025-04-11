#!/bin/bash

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Запуск тестов интеграции SelectModelWizard с платежной системой${NC}"

# Остановка и удаление существующих контейнеров
echo -e "${YELLOW}🧹 Очистка предыдущих тестовых контейнеров...${NC}"
docker-compose -f docker-compose.test.yml down -v

# Сборка контейнеров
echo -e "${YELLOW}🔧 Сборка тестовых контейнеров...${NC}"
docker-compose -f docker-compose.test.yml build select-model-tests

# Запуск тестов
echo -e "${YELLOW}🚀 Запуск тестового контейнера...${NC}"
docker-compose -f docker-compose.test.yml up -d select-model-tests

# Вывод логов в режиме реального времени
echo -e "${YELLOW}📋 Вывод логов тестирования...${NC}"
docker logs -f select-model-tests

# Проверка статуса завершения контейнера
EXIT_CODE=$(docker inspect --format='{{.State.ExitCode}}' select-model-tests)

if [ "$EXIT_CODE" -eq 0 ]; then
  echo -e "${GREEN}✅ Тесты успешно пройдены!${NC}"
else
  echo -e "${RED}❌ Тесты завершились с ошибкой (код $EXIT_CODE)${NC}"
fi

# Остановка контейнеров
echo -e "${YELLOW}🛑 Остановка тестовых контейнеров...${NC}"
docker-compose -f docker-compose.test.yml down

exit $EXIT_CODE 