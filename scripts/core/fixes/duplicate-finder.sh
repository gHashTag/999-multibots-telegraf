#!/bin/bash

# 🎨 Цвета для эмоционального вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
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
        "worried")
            echo -e "${YELLOW}😰 $message${NC}"
            ;;
        "excited")
            echo -e "${BLUE}🤩 $message${NC}"
            ;;
        "working")
            echo -e "${CYAN}🔧 $message${NC}"
            ;;
        "thinking")
            echo -e "${PURPLE}🤔 $message${NC}"
            ;;
    esac
}

# 🔍 Функция поиска дубликатов по имени
find_name_duplicates() {
    emotional_echo "working" "Ищу дубликаты по имени файла..."
    
    find "$SCRIPTS_ROOT" -type f -name "*.sh" | awk -F'/' '{print $NF}' | sort | uniq -d | while read -r filename; do
        emotional_echo "worried" "Найден дубликат: $filename"
        find "$SCRIPTS_ROOT" -type f -name "$filename" -exec echo "  - {}" \;
    done
}

# 📊 Функция анализа содержимого файлов
analyze_content_duplicates() {
    emotional_echo "working" "Анализирую содержимое файлов..."
    
    # Создаем временную директорию для хешей
    temp_dir=$(mktemp -d)
    
    # Для каждого файла .sh
    find "$SCRIPTS_ROOT" -type f -name "*.sh" | while read -r file; do
        # Получаем хеш содержимого (игнорируя комментарии и пустые строки)
        hash=$(grep -v '^[[:space:]]*#' "$file" | grep -v '^[[:space:]]*$' | md5sum | cut -d' ' -f1)
        echo "$file" >> "$temp_dir/$hash"
    done
    
    # Проверяем файлы с одинаковым хешем
    for hash_file in "$temp_dir"/*; do
        if [ $(wc -l < "$hash_file") -gt 1 ]; then
            emotional_echo "sad" "Найдены файлы с похожим содержимым:"
            cat "$hash_file" | while read -r file; do
                echo "  - $file"
            done
            echo
        fi
    done
    
    # Очищаем временную директорию
    rm -rf "$temp_dir"
}

# 🔄 Функция анализа похожих функций
analyze_similar_functions() {
    emotional_echo "working" "Анализирую похожие функции..."
    
    # Создаем временный файл для функций
    temp_file=$(mktemp)
    
    # Извлекаем все функции из всех файлов
    find "$SCRIPTS_ROOT" -type f -name "*.sh" | while read -r file; do
        awk '/^[[:space:]]*function[[:space:]]+[a-zA-Z_][a-zA-Z0-9_]*[[:space:]]*\(\)/ || /^[[:space:]]*[a-zA-Z_][a-zA-Z0-9_]*[[:space:]]*\(\)/ {
            gsub(/^[[:space:]]*function[[:space:]]+/, "")
            gsub(/[[:space:]]*\(\).*$/, "")
            print $0 "\t" FILENAME
        }' "$file" >> "$temp_file"
    done
    
    # Анализируем похожие имена функций
    emotional_echo "thinking" "Проверяю похожие имена функций..."
    sort "$temp_file" | while read -r line; do
        func_name=$(echo "$line" | cut -f1)
        file_name=$(echo "$line" | cut -f2)
        
        # Ищем похожие функции (с расстоянием Левенштейна <= 2)
        grep -v "$line" "$temp_file" | while read -r other_line; do
            other_func=$(echo "$other_line" | cut -f1)
            other_file=$(echo "$other_line" | cut -f2)
            
            # Простая проверка на схожесть (можно улучшить)
            if [ "${func_name%_*}" = "${other_func%_*}" ] || [ "${func_name#*_}" = "${other_func#*_}" ]; then
                emotional_echo "worried" "Похожие функции найдены:"
                echo "  - $func_name в $file_name"
                echo "  - $other_func в $other_file"
                echo
            fi
        done
    done
    
    # Очищаем временный файл
    rm -f "$temp_file"
}

# 📝 Функция создания отчета
generate_report() {
    emotional_echo "excited" "Создаю отчет о дубликатах..."
    
    report_file="$SCRIPTS_ROOT/duplicate_analysis_report.md"
    
    # Создаем отчет
    cat > "$report_file" << EOF
# 📊 Отчет об анализе дубликатов

## 🔍 Дубликаты по имени файла
\`\`\`
$(find_name_duplicates 2>&1)
\`\`\`

## 📑 Файлы с похожим содержимым
\`\`\`
$(analyze_content_duplicates 2>&1)
\`\`\`

## 🔄 Похожие функции
\`\`\`
$(analyze_similar_functions 2>&1)
\`\`\`

## 📈 Рекомендации
1. Объединить дублирующиеся файлы в один
2. Создать общие утилиты для похожих функций
3. Стандартизировать названия функций
4. Обновить структуру директорий

_Отчет создан: $(date)_
EOF
    
    emotional_echo "happy" "Отчет создан: $report_file"
}

# 🚀 Основная функция
main() {
    emotional_echo "excited" "Начинаю анализ дубликатов..."
    
    find_name_duplicates
    echo
    analyze_content_duplicates
    echo
    analyze_similar_functions
    echo
    generate_report
    
    emotional_echo "happy" "Анализ завершен! 🎉"
}

# Запускаем скрипт
main 