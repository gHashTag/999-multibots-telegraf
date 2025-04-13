#!/bin/bash
# Скрипт для запуска тестов функциональности Audio-to-Text

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Устанавливаем переменные окружения для тестового режима
export TEST=true
export NODE_ENV=test

# Заголовок
echo -e "${MAGENTA}=================================================${NC}"
echo -e "${MAGENTA}   🎙️ Тестирование Audio-to-Text функционала   ${NC}"
echo -e "${MAGENTA}=================================================${NC}"

# Текущий путь к директории
DIR="/Users/playom/999-multibots-telegraf/src/test-utils"

# Запускаем тест
echo -e "\n${CYAN}🧪 Запуск тестов Audio-to-Text...${NC}"
start_time=$(date +%s)

# Используем npx tsx для запуска TypeScript файла
npx tsx $DIR/simplest-test-audio-to-text.ts
test_result=$?

end_time=$(date +%s)
execution_time=$((end_time - start_time))

# Выводим результаты
echo -e "${MAGENTA}=================================================${NC}"
if [ $test_result -eq 0 ]; then
  echo -e "${GREEN}✅ Тесты Audio-to-Text успешно пройдены!${NC}"
else
  echo -e "${RED}❌ Тесты Audio-to-Text завершились с ошибками!${NC}"
fi
echo -e "${YELLOW}⏱️ Время выполнения: ${execution_time} секунд${NC}"
echo -e "${MAGENTA}=================================================${NC}"

# Выводим эмодзи в зависимости от результата
if [ $test_result -eq 0 ]; then
  echo -e "${GREEN}🎉 🎊 🥳  Все тесты пройдены успешно! 🥳 🎊 🎉${NC}"
else
  echo -e "${RED}😢 😢 😢  Обнаружены ошибки в тестах! 😢 😢 😢${NC}"
fi

exit $test_result 