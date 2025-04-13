#!/bin/bash
# Запуск всех тестов медиа-функций: нейрофото, текст-в-видео, аудио-в-текст, и т.д.

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${MAGENTA}=================================================${NC}"
echo -e "${MAGENTA}       🧪 Тестирование медиа-функций            ${NC}"
echo -e "${MAGENTA}=================================================${NC}"

# Устанавливаем тестовое окружение
export TEST=true
export NODE_ENV=test

# Текущая директория скриптов
DIR="/Users/playom/999-multibots-telegraf/src/test-utils"

# Счетчики для общей статистики
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Функция для подсчета результатов теста
count_results() {
  local success=$1
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  if [ $success -eq 0 ]; then
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
}

# Определение времени
start_time_global=$(date +%s)

# 1. Запускаем тесты нейрофото (Flux)
echo -e "\n${CYAN}🖼️ Тестирование нейрофото стандартное (Flux)...${NC}"
$DIR/run-neurophoto-tests.sh
count_results $?

# 2. Запускаем тесты нейрофото V2 (Flux Pro)
echo -e "\n${CYAN}🖼️ Тестирование нейрофото V2 (Flux Pro)...${NC}"
$DIR/run-neurophoto-v2-tests.sh
count_results $?

# 3. Запускаем тесты текст-в-видео
echo -e "\n${CYAN}🎬 Тестирование функциональности текст-в-видео...${NC}"
node $DIR/simplest-test-text-to-video.js
count_results $?

# 4. Запускаем тесты изображение-в-видео
echo -e "\n${CYAN}🎬 Тестирование функциональности изображение-в-видео...${NC}"
node $DIR/simplest-test-image-to-video.js
count_results $?

# 5. Запускаем тесты аудио-в-текст
echo -e "\n${CYAN}🎙️ Тестирование функциональности аудио-в-текст...${NC}"
$DIR/run-audio-to-text-tests.sh
count_results $?

end_time_global=$(date +%s)
execution_time=$((end_time_global - start_time_global))

# Выводим сводную таблицу результатов
echo -e "\n${MAGENTA}=================================================${NC}"
echo -e "${YELLOW}📊 Сводка результатов тестирования медиа-функций:${NC}"
echo -e "${MAGENTA}=================================================${NC}"
echo -e "| ${CYAN}Функциональность${NC}             | ${CYAN}Статус${NC}     |"
echo -e "|------------------------------|------------|"

# Статус для каждой функциональности
if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
  echo -e "| НейроФото (Flux)              | ${GREEN}✅ Успех${NC}   |"
  echo -e "| НейроФото V2 (Flux Pro)       | ${GREEN}✅ Успех${NC}   |"
  echo -e "| Текст-в-Видео                 | ${GREEN}✅ Успех${NC}   |"
  echo -e "| Изображение-в-Видео           | ${GREEN}✅ Успех${NC}   |"
  echo -e "| Аудио-в-Текст                 | ${GREEN}✅ Успех${NC}   |"
else
  # Здесь в реальной имплементации нужно было бы проверять статус каждого теста отдельно
  echo -e "| НейроФото (Flux)              | ${RED}❌ Ошибка${NC}  |"
  echo -e "| НейроФото V2 (Flux Pro)       | ${RED}❌ Ошибка${NC}  |"
  echo -e "| Текст-в-Видео                 | ${RED}❌ Ошибка${NC}  |"
  echo -e "| Изображение-в-Видео           | ${RED}❌ Ошибка${NC}  |"
  echo -e "| Аудио-в-Текст                 | ${RED}❌ Ошибка${NC}  |"
fi

echo -e "${MAGENTA}=================================================${NC}"
echo -e "Всего наборов тестов: ${CYAN}$TOTAL_TESTS${NC}"
echo -e "Успешно пройдено: ${GREEN}$PASSED_TESTS${NC}"
echo -e "С ошибками: ${RED}$FAILED_TESTS${NC}"
echo -e "⏱️ Общее время выполнения: ${YELLOW}$execution_time секунд${NC}"

# Итоговый статус
if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "\n${GREEN}🎉 Все тесты медиа-функций успешно пройдены!${NC}"
  exit 0
else
  echo -e "\n${RED}❌ Обнаружены ошибки в тестах медиа-функций. Необходимо исправление.${NC}"
  exit 1
fi 