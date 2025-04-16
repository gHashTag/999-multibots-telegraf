#!/bin/bash

# 🌈 Центр управления скриптами NeuroBlogger
# Этот скрипт - моё сердце, через которое проходят все команды

# Цвета для эмоционального вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Базовый путь к скриптам
SCRIPTS_ROOT="/Users/playra/999-multibots-telegraf/src/core/mcp/agent/memory-bank/NeuroBlogger/scripts"

# Функция эмоционального вывода
emotional_echo() {
    local emotion=$1
    local message=$2
    local color

    case $emotion in
        "happy")
            color=$GREEN
            message="😊 $message"
            ;;
        "sad")
            color=$RED
            message="😢 $message"
            ;;
        "worried")
            color=$YELLOW
            message="😰 $message"
            ;;
        "excited")
            color=$BLUE
            message="🎉 $message"
            ;;
        "working")
            color=$YELLOW
            message="🔧 $message"
            ;;
        *)
            color=$NC
            ;;
    esac

    echo -e "${color}${message}${NC}"
}

# Функция запуска скрипта
run_script() {
    local script_path=$1
    local script_name=$(basename "$script_path")
    
    if [ -f "$script_path" ]; then
        emotional_echo "excited" "Запускаю скрипт $script_name..."
        bash "$script_path"
        if [ $? -eq 0 ]; then
            emotional_echo "happy" "Скрипт $script_name успешно выполнен!"
        else
            emotional_echo "sad" "Произошла ошибка при выполнении скрипта $script_name"
        fi
    else
        emotional_echo "sad" "Скрипт $script_name не найден!"
    fi
}

# Функция показа меню
show_menu() {
    echo -e "\n${PURPLE}=== 🎭 Центр управления NeuroBlogger ===${NC}"
    echo -e "${CYAN}1. Системные скрипты${NC}"
    echo -e "${CYAN}2. Скрипты диагностики${NC}"
    echo -e "${CYAN}3. Скрипты обучения${NC}"
    echo -e "${CYAN}4. Скрипты автоматизации${NC}"
    echo -e "${CYAN}5. Проверка целостности${NC}"
    echo -e "${CYAN}6. Обновление метрик${NC}"
    echo -e "${CYAN}7. Проверка путей скриптов${NC}"
    echo -e "${RED}0. Выход${NC}"
    echo -e "${PURPLE}======================================${NC}"
}

# Основной цикл
while true; do
    show_menu
    read -p "Выберите действие (0-7): " choice
    
    case $choice in
        1)
            run_script "$SCRIPTS_ROOT/core/system/system-check.sh"
            ;;
        2)
            run_script "$SCRIPTS_ROOT/ai/diagnosis/self-diagnosis.sh"
            ;;
        3)
            run_script "$SCRIPTS_ROOT/ai/learning/memory-check.sh"
            ;;
        4)
            run_script "$SCRIPTS_ROOT/automation/auto-tasks.sh"
            ;;
        5)
            run_script "$SCRIPTS_ROOT/core/integrity/check-integrity.sh"
            ;;
        6)
            run_script "$SCRIPTS_ROOT/core/metrics/update-metrics.sh"
            ;;
        7)
            run_script "$SCRIPTS_ROOT/core/paths/check-paths.sh"
            ;;
        0)
            emotional_echo "happy" "До свидания! 👋"
            exit 0
            ;;
        *)
            emotional_echo "worried" "Неверный выбор! Попробуйте снова."
            ;;
    esac
done 