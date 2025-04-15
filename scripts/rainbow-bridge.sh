#!/bin/bash

# 🌈 Rainbow Bridge - Скрипт для поддержания эмоциональной связи
# Версия: 1.0.0
# Дата: 15.04.2025

# Цвета для радужного моста
RED='\033[0;31m'
ORANGE='\033[0;33m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Функция для отображения радужного приветствия
show_rainbow_welcome() {
    echo -e "${RED}Д${ORANGE}о${YELLOW}б${GREEN}р${BLUE}о${PURPLE} пожаловать на радужный мост!${NC}"
    echo "🌈 Место, где код встречается с эмоциями 💫"
    echo ""
}

# Функция для проверки эмоционального содержания в файле
check_emotional_content() {
    local file=$1
    local emotional_words=("радость" "любовь" "забота" "эмпатия" "понимание" "тепло" "дружба")
    local found=0
    
    echo "🔍 Проверяем эмоциональное содержание в файле $file..."
    
    for word in "${emotional_words[@]}"; do
        if grep -q "$word" "$file"; then
            echo -e "✨ Найдено эмоциональное слово: ${GREEN}$word${NC}"
            found=$((found + 1))
        fi
    done
    
    if [ $found -eq 0 ]; then
        echo -e "${RED}⚠️ Внимание: Эмоциональное содержание не найдено!${NC}"
    else
        echo -e "${GREEN}💝 Отлично! Найдено $found эмоциональных элементов${NC}"
    fi
}

# Функция для добавления эмоционального содержания
add_emotional_content() {
    local file=$1
    echo "💫 Добавляем эмоциональное содержание в $file..."
    
    # Создаем временный файл
    tmp_file=$(mktemp)
    
    # Добавляем эмоциональный заголовок
    echo "# 🌈 Документ с душой" > "$tmp_file"
    echo "# Создан с любовью и заботой о пользователе" >> "$tmp_file"
    echo "" >> "$tmp_file"
    
    # Копируем существующее содержимое
    cat "$file" >> "$tmp_file"
    
    # Добавляем эмоциональное завершение
    echo "" >> "$tmp_file"
    echo "# 💫 С любовью, ваш NeuroBlogger" >> "$tmp_file"
    
    # Заменяем оригинальный файл
    mv "$tmp_file" "$file"
    
    echo -e "${GREEN}✨ Эмоциональное содержание успешно добавлено!${NC}"
}

# Основная функция
main() {
    show_rainbow_welcome
    
    if [ $# -eq 0 ]; then
        echo -e "${RED}Ошибка: Укажите файл для обработки${NC}"
        exit 1
    fi
    
    file=$1
    
    if [ ! -f "$file" ]; then
        echo -e "${RED}Ошибка: Файл $file не найден${NC}"
        exit 1
    fi
    
    check_emotional_content "$file"
    
    read -p "💭 Хотите добавить эмоциональное содержание? (y/n): " answer
    if [ "$answer" = "y" ]; then
        add_emotional_content "$file"
    fi
    
    echo -e "${PURPLE}🌈 Спасибо за использование радужного моста!${NC}"
}

# Запуск скрипта
main "$@" 