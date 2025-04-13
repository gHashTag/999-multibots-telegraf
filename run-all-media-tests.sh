#!/bin/bash

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Функция для вывода заголовков
print_header() {
    echo -e "\n${BLUE}==========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}==========================================${NC}\n"
}

# Функция для запуска тестов с замером времени выполнения
run_test() {
    local test_name=$1
    local test_command=$2
    local description=$3
    
    echo -e "${YELLOW}🧪 Запуск тестов для $description...${NC}"
    
    # Замеряем время выполнения
    start_time=$(date +%s)
    
    # Запускаем тест
    eval $test_command
    
    # Проверяем статус выполнения
    if [ $? -eq 0 ]; then
        end_time=$(date +%s)
        execution_time=$((end_time - start_time))
        echo -e "${GREEN}✅ Тесты для $description успешно пройдены! Время выполнения: ${execution_time}s${NC}"
        # Возвращаем результат в формате: название:успех:время
        echo "$test_name:success:$execution_time"
    else
        end_time=$(date +%s)
        execution_time=$((end_time - start_time))
        echo -e "${RED}❌ Тесты для $description завершились с ошибкой! Время выполнения: ${execution_time}s${NC}"
        # Возвращаем результат в формате: название:ошибка:время
        echo "$test_name:error:$execution_time"
    fi
}

print_header "🌟 Начало комплексного тестирования медиа-функций"

# Массив для хранения результатов тестов
declare -a test_results

# Запуск тестов для NeuroPhoto (Flux)
np_result=$(run_test "NeuroPhoto" "cd /Users/playom/999-multibots-telegraf/src/test-utils && node simplest-test.js" "NeuroPhoto (Flux)")
test_results+=("$np_result")

# Запуск тестов для NeuroPhoto V2 (Flux Pro)
np2_result=$(run_test "NeuroPhoto V2" "cd /Users/playom/999-multibots-telegraf/src/test-utils && node simplest-test-neurophoto-v2.js" "NeuroPhoto V2 (Flux Pro)")
test_results+=("$np2_result")

# Запуск тестов для Text-to-Video
ttv_result=$(run_test "TextToVideo" "cd /Users/playom/999-multibots-telegraf/src/test-utils && node simplest-test-text-to-video.js" "Text-to-Video")
test_results+=("$ttv_result")

# Запуск тестов для Change Audio
audio_result=$(run_test "ChangeAudio" "cd /Users/playom/999-multibots-telegraf/src/test-utils && node simplest-test-change-audio.js" "Change Audio")
test_results+=("$audio_result")

# Отображение сводки результатов
print_header "📊 Сводка результатов тестирования медиа-функций"

# Заголовок таблицы
echo -e "${CYAN}Функциональность\tСтатус\t\tВремя выполнения${NC}"
echo -e "${CYAN}-----------------------------------------------------${NC}"

# Флаг для отслеживания общего результата
all_tests_passed=true

# Вывод результатов в виде таблицы
for result in "${test_results[@]}"; do
    # Разбиваем строку результата на части
    IFS=':' read -r name status time <<< "$result"
    
    # Определяем цвет и символ статуса
    if [ "$status" == "success" ]; then
        status_color=$GREEN
        status_text="✅ УСПЕХ"
    else
        status_color=$RED
        status_text="❌ ОШИБКА"
        all_tests_passed=false
    fi
    
    # Выводим строку таблицы
    echo -e "${MAGENTA}$name${NC}\t\t${status_color}$status_text${NC}\t${YELLOW}${time}s${NC}"
done

echo -e "${CYAN}-----------------------------------------------------${NC}"

# Вывод общего результата
if [ "$all_tests_passed" = true ]; then
    echo -e "\n${GREEN}🎉 ВСЕ ТЕСТЫ УСПЕШНО ПРОЙДЕНЫ! 🎉${NC}"
    exit 0
else
    echo -e "\n${RED}❌ ОБНАРУЖЕНЫ ОШИБКИ В ТЕСТАХ! ❌${NC}"
    exit 1
fi 