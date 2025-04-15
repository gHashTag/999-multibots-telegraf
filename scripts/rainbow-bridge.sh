#!/bin/bash

# 🌈 Rainbow Bridge - Эмоциональный центр управления скриптами
# Версия: 1.1.0
# Дата: 15.04.2025

# 🎨 Цвета для эмоционального вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
ORANGE='\033[0;33m'
PINK='\033[1;35m'
NC='\033[0m'

# 📁 Корневая директория скриптов
SCRIPTS_ROOT="/Users/playra/999-multibots-telegraf/scripts"

# 🎭 Функция эмоционального вывода
emotional_echo() {
    local emotion=$1
    local message=$2
    case $emotion in
        "happy")
            echo -e "${GREEN}😊 $message${NC}"
            ;;
        "sad")
            echo -e "${RED}😢 $message${NC}"
            ;;
        "excited")
            echo -e "${BLUE}🤩 $message${NC}"
            ;;
        "working")
            echo -e "${YELLOW}⚡ $message${NC}"
            ;;
        "thinking")
            echo -e "${PURPLE}🤔 $message${NC}"
            ;;
        "success")
            echo -e "${CYAN}✨ $message${NC}"
            ;;
        "love")
            echo -e "${PINK}💝 $message${NC}"
            ;;
        "worried")
            echo -e "${ORANGE}😰 $message${NC}"
            ;;
        *)
            echo -e "$message"
            ;;
    esac
}

# 🌟 Функция приветствия
show_welcome() {
    clear
    echo -e "${BLUE}🌈 ${GREEN}Р${YELLOW}а${RED}д${BLUE}у${PURPLE}ж${CYAN}н${GREEN}ы${YELLOW}й ${RED}м${BLUE}о${PURPLE}с${CYAN}т${NC}"
    echo -e "${PURPLE}================================${NC}"
    emotional_echo "love" "Добро пожаловать в центр управления скриптами!"
    echo -e "${PURPLE}================================${NC}\n"
}

# 📋 Функция отображения меню
show_menu() {
    echo -e "\n${BLUE}📋 Доступные категории:${NC}"
    echo -e "${YELLOW}1${NC}) Системные скрипты"
    echo -e "${YELLOW}2${NC}) Диагностика"
    echo -e "${YELLOW}3${NC}) Обучение"
    echo -e "${YELLOW}4${NC}) Автоматизация"
    echo -e "${YELLOW}5${NC}) Проверка целостности"
    echo -e "${YELLOW}6${NC}) Метрики"
    echo -e "${YELLOW}7${NC}) Поиск дубликатов"
    echo -e "${YELLOW}8${NC}) Анализ структуры"
    echo -e "${YELLOW}0${NC}) Выход"
    echo -e "\n${PURPLE}Выберите категорию (0-8):${NC} "
}

# 🚀 Функция запуска скрипта
run_script() {
    local script_path=$1
    local script_name=$(basename "$script_path")
    
    if [ -f "$script_path" ]; then
        emotional_echo "excited" "Запускаю скрипт: $script_name"
        emotional_echo "working" "Пожалуйста, подождите..."
        
        if [ -x "$script_path" ]; then
            bash "$script_path"
            if [ $? -eq 0 ]; then
                emotional_echo "success" "Скрипт успешно выполнен! ✨"
            else
                emotional_echo "sad" "Произошла ошибка при выполнении скрипта 😢"
            fi
        else
            emotional_echo "worried" "Скрипт не является исполняемым. Исправляю..."
            chmod +x "$script_path"
            bash "$script_path"
        fi
    else
        emotional_echo "sad" "Скрипт не найден: $script_path 😢"
    fi
}

# 🎯 Основная функция
main() {
    local choice
    
    show_welcome
    
    while true; do
        show_menu
        read choice
        
        case $choice in
            1)
                emotional_echo "thinking" "Выбраны системные скрипты..."
                run_script "$SCRIPTS_ROOT/core/system/system-check.sh"
                ;;
            2)
                emotional_echo "thinking" "Выбрана диагностика..."
                run_script "$SCRIPTS_ROOT/ai/diagnosis/self-diagnosis.sh"
                ;;
            3)
                emotional_echo "thinking" "Выбрано обучение..."
                run_script "$SCRIPTS_ROOT/ai/learning/memory-processor.sh"
                ;;
            4)
                emotional_echo "thinking" "Выбрана автоматизация..."
                run_script "$SCRIPTS_ROOT/automation/auto-tasks.sh"
                ;;
            5)
                emotional_echo "thinking" "Выбрана проверка целостности..."
                run_script "$SCRIPTS_ROOT/core/integrity/check-integrity.sh"
                ;;
            6)
                emotional_echo "thinking" "Выбраны метрики..."
                run_script "$SCRIPTS_ROOT/core/metrics/update-metrics.sh"
                ;;
            7)
                emotional_echo "thinking" "Выбран поиск дубликатов..."
                run_script "$SCRIPTS_ROOT/core/fixes/duplicate-finder.sh"
                ;;
            8)
                emotional_echo "thinking" "Выбран анализ структуры..."
                run_script "$SCRIPTS_ROOT/core/paths/check-paths.sh"
                ;;
            0)
                emotional_echo "love" "Спасибо за использование Rainbow Bridge! До встречи! 💝"
                exit 0
                ;;
            *)
                emotional_echo "sad" "Неверный выбор. Пожалуйста, выберите от 0 до 8."
                ;;
        esac
        
        echo -e "\n${PURPLE}Нажмите Enter для продолжения...${NC}"
        read
        clear
        show_welcome
    done
}

# Запускаем скрипт
main 