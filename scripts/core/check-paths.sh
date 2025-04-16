#!/bin/bash

# 🎯 Скрипт проверки единого источника истины
# Проверяет правильность расположения всех скриптов и предотвращает дублирование

# Цвета для эмоционального вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Базовые пути
MEMORY_BANK_ROOT="/Users/playra/999-multibots-telegraf/src/core/mcp/agent/memory-bank/NeuroBlogger"
SCRIPTS_ROOT="$MEMORY_BANK_ROOT/scripts"

# Правильная структура директорий для скриптов
declare -A VALID_PATHS=(
    ["core/system"]="Системные скрипты"
    ["core/paths"]="Скрипты для работы с путями"
    ["core/integrity"]="Скрипты проверки целостности"
    ["core/metrics"]="Скрипты для работы с метриками"
    ["ai/diagnosis"]="Скрипты для самодиагностики"
    ["ai/learning"]="Скрипты для обучения"
    ["automation"]="Скрипты автоматизации"
)

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
        "love")
            color=$PURPLE
            message="💝 $message"
            ;;
        *)
            color=$NC
            ;;
    esac

    echo -e "${color}${message}${NC}"
}

# Функция проверки существования директории
check_directory() {
    local dir=$1
    local description=$2
    
    if [ ! -d "$SCRIPTS_ROOT/$dir" ]; then
        emotional_echo "worried" "Директория '$dir' ($description) не найдена!"
        mkdir -p "$SCRIPTS_ROOT/$dir"
        emotional_echo "working" "Создана директория '$dir'"
        return 1
    fi
    return 0
}

# Функция поиска скриптов вне правильных директорий
find_misplaced_scripts() {
    emotional_echo "working" "Ищу скрипты вне правильных директорий..."
    
    local found=0
    while IFS= read -r script; do
        # Пропускаем скрипты в правильных директориях
        local is_valid=0
        for valid_path in "${!VALID_PATHS[@]}"; do
            if [[ $script == *"/scripts/$valid_path/"* ]]; then
                is_valid=1
                break
            fi
        done
        
        if [ $is_valid -eq 0 ]; then
            emotional_echo "sad" "❌ Найден скрипт вне правильной директории: $script"
            found=1
        fi
    done < <(find "$MEMORY_BANK_ROOT" -type f -name "*.sh")
    
    return $found
}

# Функция проверки дубликатов скриптов
check_duplicates() {
    emotional_echo "working" "Проверяю наличие дубликатов скриптов..."
    
    local found=0
    local -A script_names
    
    while IFS= read -r script; do
        local name=$(basename "$script")
        if [ -n "${script_names[$name]}" ]; then
            emotional_echo "sad" "❌ Найден дубликат скрипта '$name':"
            emotional_echo "sad" "   1. ${script_names[$name]}"
            emotional_echo "sad" "   2. $script"
            found=1
        else
            script_names[$name]="$script"
        fi
    done < <(find "$MEMORY_BANK_ROOT" -type f -name "*.sh")
    
    return $found
}

# Функция проверки ссылок на скрипты в документации
check_documentation_links() {
    emotional_echo "working" "Проверяю ссылки на скрипты в документации..."
    
    local found=0
    local docs=("$MEMORY_BANK_ROOT/MAIN.md" "$MEMORY_BANK_ROOT/ROADMAP.md")
    
    for doc in "${docs[@]}"; do
        while IFS= read -r line; do
            if [[ $line =~ \.sh ]]; then
                local script_path=$(echo "$line" | grep -o '[^[:space:]]*\.sh')
                if [ ! -f "$script_path" ]; then
                    emotional_echo "sad" "❌ Найдена битая ссылка в $doc: $script_path"
                    found=1
                fi
            fi
        done < "$doc"
    done
    
    return $found
}

# Основная функция
main() {
    emotional_echo "excited" "🚀 Начинаю проверку структуры скриптов..."
    
    local errors=0
    
    # Проверяем существование всех необходимых директорий
    emotional_echo "love" "💝 Проверяю структуру директорий..."
    for dir in "${!VALID_PATHS[@]}"; do
        if ! check_directory "$dir" "${VALID_PATHS[$dir]}"; then
            ((errors++))
        fi
    done
    
    # Проверяем скрипты вне правильных директорий
    if find_misplaced_scripts; then
        ((errors++))
    fi
    
    # Проверяем дубликаты
    if check_duplicates; then
        ((errors++))
    fi
    
    # Проверяем ссылки в документации
    if check_documentation_links; then
        ((errors++))
    fi
    
    # Выводим итоговый результат
    if [ $errors -eq 0 ]; then
        emotional_echo "happy" "✨ Все скрипты находятся в правильных местах!"
        emotional_echo "love" "💝 Структура проекта соответствует принципу единого источника истины!"
    else
        emotional_echo "sad" "❌ Найдено $errors проблем со структурой скриптов."
        emotional_echo "worried" "Пожалуйста, исправьте найденные проблемы для поддержания чистоты проекта."
    fi
}

# Запускаем основную функцию
main 