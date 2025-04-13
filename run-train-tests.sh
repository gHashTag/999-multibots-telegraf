#!/bin/bash
# Запуск тестов для функциональности тренировки моделей

# Устанавливаем тестовое окружение
export TEST=true
export NODE_ENV=test

# Путь к папке с тестами
TEST_DIR="/Users/playom/999-multibots-telegraf/src/test-utils"

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Выводим заголовок
echo -e "\n${MAGENTA}🧠 ТЕСТИРОВАНИЕ ФУНКЦИОНАЛЬНОСТИ ТРЕНИРОВКИ МОДЕЛЕЙ${NC}"
echo -e "${MAGENTA}=================================================${NC}\n"

# Засекаем время начала
START_TIME=$(date +%s)

# Запускаем скрипт тестирования
cd "${TEST_DIR}" && node simplest-test-train-model.js
TEST_RESULT=$?

# Считаем время выполнения
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Выводим результат
if [ $TEST_RESULT -eq 0 ]; then
  echo -e "\n${GREEN}✅ Тесты тренировки моделей успешно выполнены!${NC}"
  echo -e "${BLUE}⏱️ Время выполнения: ${DURATION} сек.${NC}\n"
  exit 0
else
  echo -e "\n${RED}❌ Тесты тренировки моделей завершились с ошибками!${NC}"
  echo -e "${BLUE}⏱️ Время выполнения: ${DURATION} сек.${NC}\n"
  exit 1
fi 