#!/bin/bash

# Цветовые коды для эмоционального вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Путь к корневой директории скриптов
SCRIPTS_ROOT="/Users/playra/999-multibots-telegraf/scripts"

# Функция для эмоционального вывода
emotional_echo() {
    local emotion=$1
    local message=$2
    local color

    case $emotion in
        "happy")
            color=$GREEN
            echo -e "${color}😊 $message${NC}"
            ;;
        "sad")
            color=$RED
            echo -e "${color}😢 $message${NC}"
            ;;
        "excited")
            color=$BLUE
            echo -e "${color}🎉 $message${NC}"
            ;;
        "working")
            color=$YELLOW
            echo -e "${color}⚡ $message${NC}"
            ;;
        "thinking")
            color=$PURPLE
            echo -e "${color}🤔 $message${NC}"
            ;;
        "success")
            color=$CYAN
            echo -e "${color}✨ $message${NC}"
            ;;
    esac
}

# Функция для запуска скрипта
run_script() {
    local script_path=$1
    if [ -f "$script_path" ]; then
        emotional_echo "working" "Запускаю скрипт: $script_path"
        bash "$script_path"
        if [ $? -eq 0 ]; then
            emotional_echo "success" "Скрипт успешно выполнен!"
        else
            emotional_echo "sad" "Произошла ошибка при выполнении скрипта"
        fi
    else
        emotional_echo "sad" "Скрипт не найден: $script_path"
    fi
}

# Функция для отображения меню
show_menu() {
    echo -e "\n${PURPLE}🌈 Rainbow Bridge - Центр управления скриптами${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo "1. Системные скрипты"
    echo "2. Скрипты диагностики"
    echo "3. Скрипты обучения"
    echo "4. Скрипты автоматизации"
    echo "5. Проверка целостности"
    echo "6. Обновление метрик"
    echo "0. Выход"
    echo -e "${BLUE}========================================${NC}"
}

# Основной цикл
while true; do
    show_menu
    read -p "Выберите категорию (0-6): " choice

    case $choice in
        1)
            emotional_echo "thinking" "Выбраны системные скрипты"
            run_script "$SCRIPTS_ROOT/core/system/memory-bank-launcher.sh"
            ;;
        2)
            emotional_echo "thinking" "Выбраны скрипты диагностики"
            run_script "$SCRIPTS_ROOT/ai/diagnosis/system-diagnosis.sh"
            ;;
        3)
            emotional_echo "thinking" "Выбраны скрипты обучения"
            run_script "$SCRIPTS_ROOT/ai/learning/self-learning.sh"
            ;;
        4)
            emotional_echo "thinking" "Выбраны скрипты автоматизации"
            run_script "$SCRIPTS_ROOT/automation/auto-tasks.sh"
            ;;
        5)
            emotional_echo "thinking" "Запуск проверки целостности"
            run_script "$SCRIPTS_ROOT/core/integrity/check-integrity.sh"
            ;;
        6)
            emotional_echo "thinking" "Обновление метрик"
            run_script "$SCRIPTS_ROOT/core/metrics/update-metrics.sh"
            ;;
        0)
            emotional_echo "happy" "До свидания! Спасибо за использование Rainbow Bridge!"
            exit 0
            ;;
        *)
            emotional_echo "sad" "Неверный выбор. Пожалуйста, выберите от 0 до 6."
            ;;
    esac
done 