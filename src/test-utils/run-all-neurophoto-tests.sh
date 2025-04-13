#!/bin/bash
# Запуск всех тестов нейрофото (как обычного, так и V2)

echo "🧪 Запуск комплексного тестирования нейрофото"
echo "=============================================="

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

# 1. Запускаем тесты обычного нейрофото (Flux)
echo -e "\n🔍 Тестирование нейрофото стандартное (Flux)..."
$DIR/run-neurophoto-tests.sh
count_results $?

# 2. Запускаем тесты нейрофото V2 (Flux Pro)
echo -e "\n🔍 Тестирование нейрофото V2 (Flux Pro)..."
$DIR/run-neurophoto-v2-tests.sh
count_results $?

# Выводим общую статистику
echo -e "\n📊 Общие результаты тестирования нейрофото:"
echo "Всего наборов тестов: $TOTAL_TESTS"
echo "Успешно пройдено: $PASSED_TESTS"
echo "С ошибками: $FAILED_TESTS"

# Итоговый статус
if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "\n✅ Все тесты нейрофото успешно пройдены!"
  exit 0
else
  echo -e "\n❌ Обнаружены ошибки в тестах нейрофото. Необходимо исправление."
  exit 1
fi 