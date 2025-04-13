#!/bin/bash
# Запуск всех тестов медиа-функций (нейрофото, текст-в-видео, изображение-в-видео)
# Автор: Claude AI
# Дата: $(date "+%d.%m.%Y")

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
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Переменные для подсчета итогов
TOTAL_TESTS=0
PASSED_TESTS=0
START_TIME=$(date +%s)

# Создаем заголовок
echo -e "\n${MAGENTA}🚀 КОМПЛЕКСНОЕ ТЕСТИРОВАНИЕ МЕДИА-ФУНКЦИЙ БОТА${NC}"
echo -e "${MAGENTA}==============================================${NC}\n"

# Функция для запуска тестов
run_test() {
  local test_script="$1"
  local test_name="$2"
  local test_icon="$3"
  local separator=$(printf '%*s' 48 '' | tr ' ' '=')
  local test_start_time=$(date +%s)
  
  echo -e "\n${CYAN}${separator}${NC}"
  echo -e "${CYAN}${test_icon} Тестирование ${test_name}...${NC}"
  echo -e "${CYAN}${separator}${NC}"
  
  cd "${TEST_DIR}" && node "${test_script}"
  local result=$?
  local test_end_time=$(date +%s)
  local test_duration=$((test_end_time - test_start_time))
  
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  
  if [ $result -eq 0 ]; then
    echo -e "\n${GREEN}✅ Тесты ${test_name} успешно выполнены${NC}"
    echo -e "${BLUE}⏱️ Время выполнения: ${test_duration} сек.${NC}\n"
    PASSED_TESTS=$((PASSED_TESTS + 1))
    return 0
  else
    echo -e "\n${RED}❌ Тесты ${test_name} завершились с ошибками${NC}"
    echo -e "${BLUE}⏱️ Время выполнения: ${test_duration} сек.${NC}\n"
    return 1
  fi
}

# Запускаем все тесты
run_test "simplest-test.js" "НейроФото (Flux)" "🖼️"
FLUX_RESULT=$?

run_test "simplest-test-neurophoto-v2.js" "НейроФото V2 (Flux Pro)" "🖼️✨"
FLUX_PRO_RESULT=$?

run_test "simplest-test-text-to-video.js" "Текст-в-Видео" "🎬📝"
TEXT_TO_VIDEO_RESULT=$?

run_test "simplest-test-image-to-video.js" "Изображение-в-Видео" "🎬🖼️"
IMAGE_TO_VIDEO_RESULT=$?

# Вычисляем общее время выполнения
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Выводим итоговый результат
separator=$(printf '%*s' 52 '' | tr ' ' '=')
echo -e "${YELLOW}${separator}${NC}"
echo -e "${YELLOW}📋 ИТОГОВЫЙ РЕЗУЛЬТАТ ТЕСТИРОВАНИЯ МЕДИА-ФУНКЦИЙ:${NC}"
echo -e "${YELLOW}${separator}${NC}"
echo -e "${CYAN}Всего наборов тестов: ${TOTAL_TESTS}${NC}"
echo -e "${GREEN}Успешно пройдено: ${PASSED_TESTS}${NC}"
echo -e "${RED}С ошибками: $((TOTAL_TESTS - PASSED_TESTS))${NC}"
echo -e "${BLUE}⏱️ Общее время выполнения: ${DURATION} сек.${NC}\n"

# Таблица результатов
echo -e "${MAGENTA}Результаты по функциональностям:${NC}"
echo -e "${CYAN}+----------------------------+----------+${NC}"
echo -e "${CYAN}| Функциональность           | Результат |${NC}"
echo -e "${CYAN}+----------------------------+----------+${NC}"

# Функция для вывода статуса
print_status() {
  local name="$1"
  local status="$2"
  local color="$3"
  printf "${CYAN}| %-26s |${color} %-8s ${CYAN}|${NC}\n" "$name" "$status"
}

# Выводим результаты по каждой функциональности
[ $FLUX_RESULT -eq 0 ] && print_status "НейроФото (Flux)" "УСПЕХ" "${GREEN}" || print_status "НейроФото (Flux)" "ОШИБКА" "${RED}"
[ $FLUX_PRO_RESULT -eq 0 ] && print_status "НейроФото V2 (Flux Pro)" "УСПЕХ" "${GREEN}" || print_status "НейроФото V2 (Flux Pro)" "ОШИБКА" "${RED}"
[ $TEXT_TO_VIDEO_RESULT -eq 0 ] && print_status "Текст-в-Видео" "УСПЕХ" "${GREEN}" || print_status "Текст-в-Видео" "ОШИБКА" "${RED}"
[ $IMAGE_TO_VIDEO_RESULT -eq 0 ] && print_status "Изображение-в-Видео" "УСПЕХ" "${GREEN}" || print_status "Изображение-в-Видео" "ОШИБКА" "${RED}"

echo -e "${CYAN}+----------------------------+----------+${NC}\n"

# Подведение итогов
if [ $FLUX_RESULT -eq 0 ] && [ $FLUX_PRO_RESULT -eq 0 ] && [ $TEXT_TO_VIDEO_RESULT -eq 0 ] && [ $IMAGE_TO_VIDEO_RESULT -eq 0 ]; then
  echo -e "${GREEN}✅✅ Все тесты медиа-функций успешно пройдены!${NC}\n"
  exit 0
else
  echo -e "${RED}❌ Обнаружены ошибки в тестах:${NC}"
  [ $FLUX_RESULT -ne 0 ] && echo -e "${RED}   - Тесты НейроФото (Flux) завершились с ошибками${NC}"
  [ $FLUX_PRO_RESULT -ne 0 ] && echo -e "${RED}   - Тесты НейроФото V2 (Flux Pro) завершились с ошибками${NC}"
  [ $TEXT_TO_VIDEO_RESULT -ne 0 ] && echo -e "${RED}   - Тесты Текст-в-Видео завершились с ошибками${NC}"
  [ $IMAGE_TO_VIDEO_RESULT -ne 0 ] && echo -e "${RED}   - Тесты Изображение-в-Видео завершились с ошибками${NC}"
  echo ""
  exit 1
fi 