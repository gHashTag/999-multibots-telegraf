#!/bin/bash

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Эмоциональный вывод
echo_emotion() {
    local message=$1
    local emotion=$2
    
    case $emotion in
        "happy")
            echo -e "${GREEN}😊 $message${NC}"
            ;;
        "working")
            echo -e "${BLUE}🔨 $message${NC}"
            ;;
        "warning")
            echo -e "${YELLOW}⚠️ $message${NC}"
            ;;
        "error")
            echo -e "${RED}❌ $message${NC}"
            ;;
        *)
            echo -e "$message"
            ;;
    esac
}

# Функция для генерации README.md
generate_readme() {
    local dir=$1
    local readme_path="$dir/README.md"
    
    # Получаем имя директории
    local dir_name=$(basename "$dir")
    
    # Получаем список файлов
    local files=$(ls -p "$dir" | grep -v /)
    local dirs=$(ls -p "$dir" | grep /)
    
    # Создаем README.md
    echo "# 📁 $dir_name" > "$readme_path"
    echo "" >> "$readme_path"
    echo "## 📝 Описание" >> "$readme_path"
    echo "Директория \`$dir_name\` содержит компоненты и модули для [описание будет добавлено позже]." >> "$readme_path"
    echo "" >> "$readme_path"
    
    # Добавляем структуру
    echo "## 🗂️ Структура" >> "$readme_path"
    echo "" >> "$readme_path"
    
    # Добавляем поддиректории
    if [ ! -z "$dirs" ]; then
        echo "### 📂 Поддиректории" >> "$readme_path"
        echo "" >> "$readme_path"
        while read -r d; do
            if [ ! -z "$d" ]; then
                echo "- \`$d\` - [описание будет добавлено]" >> "$readme_path"
            fi
        done <<< "$dirs"
        echo "" >> "$readme_path"
    fi
    
    # Добавляем файлы
    if [ ! -z "$files" ]; then
        echo "### 📄 Файлы" >> "$readme_path"
        echo "" >> "$readme_path"
        while read -r f; do
            if [ ! -z "$f" ] && [ "$f" != "README.md" ]; then
                echo "- \`$f\` - [описание будет добавлено]" >> "$readme_path"
            fi
        done <<< "$files"
        echo "" >> "$readme_path"
    fi
    
    # Добавляем секцию для дополнительной информации
    echo "## ℹ️ Дополнительная информация" >> "$readme_path"
    echo "" >> "$readme_path"
    echo "Для получения дополнительной информации о компонентах и их использовании, пожалуйста, обратитесь к документации или свяжитесь с командой разработки." >> "$readme_path"
    
    echo_emotion "Создан README.md в директории $dir" "happy"
}

# Основная функция
main() {
    echo_emotion "Начинаю поиск директорий без README.md..." "working"
    
    # Создаем временный файл для хранения списка директорий
    temp_file=$(mktemp)
    
    # Находим все директории без README.md
    find . -type d ! -path "*/\.*" ! -path "*/node_modules/*" -print0 | while IFS= read -r -d '' dir; do
        if [ ! -f "$dir/README.md" ]; then
            echo "$dir" >> "$temp_file"
        fi
    done
    
    # Проверяем, есть ли директории без README.md
    if [ ! -s "$temp_file" ]; then
        echo_emotion "Все директории имеют README.md!" "happy"
        rm "$temp_file"
        return 0
    fi
    
    # Генерируем README.md для каждой директории
    while IFS= read -r dir; do
        generate_readme "$dir"
    done < "$temp_file"
    
    # Подсчитываем количество созданных файлов
    local count=$(wc -l < "$temp_file")
    echo_emotion "Создано $count новых README.md файлов" "happy"
    
    # Удаляем временный файл
    rm "$temp_file"
    
    # Создаем отчет
    local report_dir="scripts/core/integrity/reports"
    mkdir -p "$report_dir"
    local report_file="$report_dir/readme_generation_report.md"
    
    echo "# 📝 Отчет о генерации README.md" > "$report_file"
    echo "" >> "$report_file"
    echo "## 📊 Статистика" >> "$report_file"
    echo "- Дата: $(date '+%Y-%m-%d %H:%M:%S')" >> "$report_file"
    echo "- Создано файлов: $count" >> "$report_file"
    echo "" >> "$report_file"
    
    echo_emotion "Отчет сохранен в $report_file" "happy"
}

# Запускаем основную функцию
main 