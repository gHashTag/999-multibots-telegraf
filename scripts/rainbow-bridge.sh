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

# 📁 Пути
SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPTS_DIR/.." && pwd)"

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

# 🔧 Функция для установки прав доступа
setup_permissions() {
    echo -e "${BLUE}🔧 Настраиваю права доступа для скриптов...${NC}"
    
    # Находим все .sh файлы и делаем их исполняемыми
    find "$SCRIPTS_DIR" -type f -name "*.sh" -exec chmod +x {} \;
    
    echo -e "${GREEN}✅ Права доступа настроены${NC}"
}

# 📝 Функция для работы с файлами
file_ops() {
    local operation=$1
    shift
    
    "$SCRIPTS_DIR/core/system/fast-file-ops.sh" "$operation" "$@"
}

# 🎯 Основная функция
main() {
    case "$1" in
        "setup")
            setup_permissions
            ;;
        "file")
            shift
            file_ops "$@"
            ;;
        *)
            echo -e "${BLUE}ℹ️ Использование:${NC}"
            echo "  $0 setup - настроить права доступа"
            echo "  $0 file [read|append|update] [args] - операции с файлами"
            exit 1
            ;;
    esac
}

# Запускаем основную функцию
main "$@" 