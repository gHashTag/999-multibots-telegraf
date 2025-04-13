#!/bin/bash
# Запуск всех тестов нейрофото (обычная версия и V2)
# Автор: Claude AI
# Дата: $(date "+%d.%m.%Y")

# Устанавливаем тестовое окружение с дополнительной переменной
export TEST=true
export NODE_ENV=test
export RUNNING_IN_TEST_ENV=true
export SUPABASE_MOCK_ENABLED=true # Дополнительный флаг для активации моков
export DATABASE_MOCK=true # Еще один флаг

# Путь к папке с тестами
TEST_DIR="/Users/playom/999-multibots-telegraf/src/test-utils"

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Переменные для подсчета итогов
TOTAL_TESTS=0
PASSED_TESTS=0
START_TIME=$(date +%s)

# Создаем заголовок
echo -e "\n${CYAN}🧪 Запуск комплексного тестирования нейрофото${NC}"
echo -e "${CYAN}=============================================${NC}\n"

# Проверка окружения
echo -e "${MAGENTA}🛡️ Проверка окружения тестирования:${NC}"
echo -e "${BLUE}• NODE_ENV=${NODE_ENV}${NC}"
echo -e "${BLUE}• TEST=${TEST}${NC}"
echo -e "${BLUE}• RUNNING_IN_TEST_ENV=${RUNNING_IN_TEST_ENV}${NC}"
echo -e "${BLUE}• Тестовый режим суперклиента: ${SUPABASE_MOCK_ENABLED}${NC}"
echo -e "${BLUE}• Директория тестов: ${TEST_DIR}${NC}\n"

# Функция для запуска тестов
run_test() {
  local test_file=$1
  local test_name=$2
  
  echo -e "${CYAN}📋 Запускаем тесты для ${test_name}...${NC}"
  
  # Change directory to where the test files are located
  cd "${TEST_DIR}" || {
    echo -e "${RED}❌ Ошибка: Не удалось перейти в директорию с тестами${NC}"
    return 1
  }
  
  # Run the test
  node "${test_file}"
  local exit_code=$?
  
  # Increment total tests counter
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  
  # Check if the test was successful
  if [ $exit_code -eq 0 ]; then
    echo -e "${GREEN}✅ Тесты для ${test_name} успешно выполнены!${NC}\n"
    # Increment passed tests counter
    PASSED_TESTS=$((PASSED_TESTS + 1))
    return 0
  else
    echo -e "${RED}❌ Тесты для ${test_name} завершились с ошибками! (код ${exit_code})${NC}\n"
    return 1
  fi
}

# Проверяем наличие наших мок-файлов
echo -e "${MAGENTA}🔍 Проверка наличия мок-файлов:${NC}"
if [ -f "${TEST_DIR}/mocks/mockSupabase.ts" ]; then
  echo -e "${GREEN}✓ Найден файл мока для Supabase${NC}"
else
  echo -e "${RED}✗ Не найден файл мока для Supabase${NC}"
  echo -e "${YELLOW}⚠️ Тесты могут использовать реальное окружение!${NC}"
fi

# Запускаем оба набора тестов
run_test "simplest-test.js" "нейрофото стандартное (Flux)"
FLUX_RESULT=$?

run_test "simplest-test-neurophoto-v2.js" "нейрофото V2 (Flux Pro)"
FLUX_PRO_RESULT=$?

# Вычисляем общее время выполнения
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Выводим итоговый результат
separator=$(printf '%*s' 45 '' | tr ' ' '=')
echo -e "${YELLOW}${separator}${NC}"
echo -e "${YELLOW}📋 ИТОГОВЫЙ РЕЗУЛЬТАТ ТЕСТИРОВАНИЯ НЕЙРОФОТО:${NC}"
echo -e "${YELLOW}${separator}${NC}"
echo -e "${CYAN}Всего наборов тестов: ${TOTAL_TESTS}${NC}"
echo -e "${GREEN}Успешно пройдено: ${PASSED_TESTS}${NC}"
echo -e "${RED}С ошибками: $((TOTAL_TESTS - PASSED_TESTS))${NC}"
echo -e "${BLUE}⏱️ Общее время выполнения: ${DURATION} сек.${NC}\n"

if [ $FLUX_RESULT -eq 0 ] && [ $FLUX_PRO_RESULT -eq 0 ]; then
  echo -e "${GREEN}✅✅ Все тесты нейрофото успешно пройдены!${NC}\n"
  exit 0
else
  echo -e "${RED}❌ Обнаружены ошибки в тестах:${NC}"
  [ $FLUX_RESULT -ne 0 ] && echo -e "${RED}   - Тесты нейрофото (Flux) завершились с ошибками${NC}"
  [ $FLUX_PRO_RESULT -ne 0 ] && echo -e "${RED}   - Тесты нейрофото V2 (Flux Pro) завершились с ошибками${NC}"
  echo ""
  exit 1
fi 