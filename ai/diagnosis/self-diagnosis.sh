#!/bin/bash

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Эмоциональные эмодзи
HAPPY="😊"
SAD="😢"
THINKING="🤔"
HEART="❤️"
RAINBOW="🌈"
STAR="⭐"
SPARKLES="✨"

echo -e "${RAINBOW} ${PURPLE}Начинаю самодиагностику системы...${NC} ${SPARKLES}\n"

# Проверка структуры директорий
check_directories() {
    echo -e "${THINKING} Проверяю структуру директорий..."
    local required_dirs=("core" "ai" "docs" ".history")
    local all_ok=true
    
    for dir in "${required_dirs[@]}"; do
        if [ -d "../$dir" ]; then
            echo -e "${GREEN}${HAPPY} Директория $dir существует${NC}"
        else
            echo -e "${RED}${SAD} Директория $dir отсутствует${NC}"
            all_ok=false
        fi
    done
    
    if $all_ok; then
        echo -e "\n${STAR} ${GREEN}Все необходимые директории на месте!${NC} ${HEART}\n"
    else
        echo -e "\n${RED}Некоторые директории отсутствуют. Нужно их создать.${NC}\n"
    fi
}

# Проверка файлов документации
check_documentation() {
    echo -e "${THINKING} Проверяю файлы документации..."
    local required_files=("../MAIN.md" "../ROADMAP.md" "../SELF_DIAGNOSIS.md" "../LEARNING_SYSTEM.md")
    local all_ok=true
    
    for file in "${required_files[@]}"; do
        if [ -f "$file" ]; then
            local size=$(stat -f%z "$file")
            if [ $size -gt 0 ]; then
                echo -e "${GREEN}${HAPPY} Файл $file существует и не пустой (${size} байт)${NC}"
            else
                echo -e "${YELLOW}${THINKING} Файл $file существует, но пустой${NC}"
                all_ok=false
            fi
        else
            echo -e "${RED}${SAD} Файл $file отсутствует${NC}"
            all_ok=false
        fi
    done
    
    if $all_ok; then
        echo -e "\n${STAR} ${GREEN}Вся необходимая документация в порядке!${NC} ${HEART}\n"
    else
        echo -e "\n${RED}Есть проблемы с документацией. Нужно исправить.${NC}\n"
    fi
}

# Проверка истории изменений
check_history() {
    echo -e "${THINKING} Проверяю историю изменений..."
    if [ -d "../.history" ]; then
        local history_files=$(find "../.history" -type f | wc -l)
        if [ $history_files -gt 0 ]; then
            echo -e "${GREEN}${HAPPY} История изменений содержит $history_files файлов${NC}"
        else
            echo -e "${YELLOW}${THINKING} Директория истории пуста${NC}"
        fi
    else
        echo -e "${RED}${SAD} Директория истории отсутствует${NC}"
    fi
    echo
}

# Проверка эмоционального содержания
check_emotional_content() {
    echo -e "${THINKING} Проверяю эмоциональное содержание в MAIN.md..."
    if [ -f "../MAIN.md" ]; then
        if grep -q "🌈" "../MAIN.md"; then
            echo -e "${GREEN}${HAPPY} Радужный мост найден!${NC} ${RAINBOW}"
        else
            echo -e "${YELLOW}${SAD} Радужный мост отсутствует${NC}"
        fi
        
        local emoji_count=$(grep -o -E "[\x{1F300}-\x{1F9FF}]" "../MAIN.md" | wc -l)
        if [ $emoji_count -gt 0 ]; then
            echo -e "${GREEN}${SPARKLES} Найдено $emoji_count эмодзи${NC}"
        else
            echo -e "${YELLOW}${THINKING} Эмодзи не найдены${NC}"
        fi
    else
        echo -e "${RED}${SAD} Файл MAIN.md отсутствует${NC}"
    fi
    echo
}

# Запуск всех проверок
main() {
    echo -e "${STAR} ${BLUE}Начинаю комплексную проверку системы...${NC} ${STAR}\n"
    
    check_directories
    check_documentation
    check_history
    check_emotional_content
    
    echo -e "${RAINBOW} ${PURPLE}Самодиагностика завершена!${NC} ${SPARKLES}"
}

main 