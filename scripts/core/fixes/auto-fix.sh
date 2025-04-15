#!/bin/bash

# ANSI color codes for emotional output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Emojis for feedback
HEART="❤️"
CHECK="✅"
WARNING="⚠️"
ERROR="❌"
SPARKLES="✨"
WRENCH="🔧"
ROCKET="🚀"
RAINBOW="🌈"

echo -e "${PURPLE}${RAINBOW} Привет! Я твой эмоциональный помощник по автоматическому исправлению! ${RAINBOW}${NC}"
echo -e "${CYAN}Давай проверим и исправим все, что нужно...${NC}\n"

# Function for emotional echo
emotional_echo() {
    local type=$1
    local message=$2
    
    case $type in
        "success")
            echo -e "${GREEN}${CHECK} ${message} ${HEART}${NC}"
            ;;
        "warning")
            echo -e "${YELLOW}${WARNING} ${message}${NC}"
            ;;
        "error")
            echo -e "${RED}${ERROR} ${message}${NC}"
            ;;
        "info")
            echo -e "${BLUE}${SPARKLES} ${message}${NC}"
            ;;
        "fix")
            echo -e "${PURPLE}${WRENCH} ${message}${NC}"
            ;;
    esac
}

# Check node_modules
check_node_modules() {
    if [ ! -d "node_modules" ]; then
        emotional_echo "warning" "node_modules не найдены!"
        emotional_echo "fix" "Устанавливаю зависимости..."
        npm install
        if [ $? -eq 0 ]; then
            emotional_echo "success" "Зависимости успешно установлены!"
        else
            emotional_echo "error" "Ошибка при установке зависимостей"
            return 1
        fi
    else
        emotional_echo "success" "node_modules в порядке!"
    fi
}

# Fix file permissions
fix_permissions() {
    emotional_echo "info" "Проверяю права доступа к файлам..."
    find . -type f -name "*.sh" -exec chmod +x {} \;
    find . -type d -exec chmod 755 {} \;
    find . -type f -exec chmod 644 {} \;
    emotional_echo "success" "Права доступа исправлены!"
}

# Check and create directories
check_directories() {
    local dirs=("src" "scripts" "config" "logs")
    
    for dir in "${dirs[@]}"; do
        if [ ! -d "$dir" ]; then
            emotional_echo "warning" "Директория $dir не найдена"
            emotional_echo "fix" "Создаю директорию $dir..."
            mkdir -p "$dir"
            emotional_echo "success" "Директория $dir создана!"
        else
            emotional_echo "success" "Директория $dir существует"
        fi
    done
}

# Check config files
check_config() {
    if [ ! -f "config/default.json" ]; then
        emotional_echo "warning" "Файл конфигурации не найден"
        emotional_echo "fix" "Создаю файл конфигурации по умолчанию..."
        mkdir -p config
        echo '{"environment": "development"}' > config/default.json
        emotional_echo "success" "Файл конфигурации создан!"
    else
        emotional_echo "success" "Файл конфигурации существует"
    fi
}

# Clean temp files
clean_temp() {
    emotional_echo "info" "Очищаю временные файлы..."
    find . -type f -name "*.tmp" -delete
    find . -type f -name "*.log" -size +10M -delete
    emotional_echo "success" "Временные файлы очищены!"
}

# Main function
main() {
    emotional_echo "info" "Начинаю процесс автоматического исправления... ${ROCKET}"
    
    check_node_modules
    fix_permissions
    check_directories
    check_config
    clean_temp
    
    emotional_echo "success" "Все исправления завершены! Проект в отличном состоянии! ${RAINBOW}"
}

# Run main function
main 