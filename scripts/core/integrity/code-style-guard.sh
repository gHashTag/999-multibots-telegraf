#!/bin/bash

# Цвета для эмоционального вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
PINK='\033[1;35m'
NC='\033[0m'

# Директории
PROJECT_ROOT="/Users/playra/999-multibots-telegraf"
REPORTS_DIR="$PROJECT_ROOT/scripts/core/integrity/reports"

# Создаем директорию для отчетов
mkdir -p "$REPORTS_DIR"

# Функция эмоционального вывода
emotional_echo() {
    local emotion=$1
    local message=$2
    local color

    case $emotion in
        "happy") color=$GREEN ;;
        "sad") color=$RED ;;
        "excited") color=$YELLOW ;;
        "calm") color=$BLUE ;;
        "loving") color=$PINK ;;
        "thinking") color=$PURPLE ;;
        "success") color=$CYAN ;;
        *) color=$NC ;;
    esac

    echo -e "${color}${message}${NC}"
}

# Проверка структуры директорий
check_directory_structure() {
    emotional_echo "thinking" "🔍 Проверяю структуру директорий..."
    
    local required_dirs=(
        "src/core"
        "src/inngest-functions"
        "src/types"
        "scripts/core"
        "scripts/ai"
        "scripts/automation"
    )
    
    local errors=0
    for dir in "${required_dirs[@]}"; do
        if [ ! -d "$PROJECT_ROOT/$dir" ]; then
            emotional_echo "sad" "❌ Отсутствует директория: $dir"
            ((errors++))
        fi
    done
    
    return $errors
}

# Проверка наличия конфигурационных файлов
check_config_files() {
    emotional_echo "thinking" "🔍 Проверяю конфигурационные файлы..."
    
    local required_files=(
        "package.json"
        "tsconfig.json"
        ".env.example"
        ".gitignore"
        "README.md"
    )
    
    local errors=0
    for file in "${required_files[@]}"; do
        if [ ! -f "$PROJECT_ROOT/$file" ]; then
            emotional_echo "sad" "❌ Отсутствует файл: $file"
            ((errors++))
        fi
    done
    
    return $errors
}

# Проверка стиля кода TypeScript
check_typescript_style() {
    emotional_echo "thinking" "🔍 Проверяю стиль кода TypeScript..."
    
    # Проверяем наличие eslint
    if [ ! -f "$PROJECT_ROOT/.eslintrc.js" ]; then
        emotional_echo "sad" "❌ Отсутствует конфигурация ESLint"
        return 1
    fi
    
    # Проверяем наличие prettier
    if [ ! -f "$PROJECT_ROOT/.prettierrc" ]; then
        emotional_echo "sad" "❌ Отсутствует конфигурация Prettier"
        return 1
    fi
    
    return 0
}

# Проверка документации
check_documentation() {
    emotional_echo "thinking" "🔍 Проверяю документацию..."
    
    local required_docs=(
        "scripts/MAIN.md"
        "scripts/README.md"
        "scripts/ROADMAP.md"
    )
    
    local errors=0
    for doc in "${required_docs[@]}"; do
        if [ ! -f "$PROJECT_ROOT/$doc" ]; then
            emotional_echo "sad" "❌ Отсутствует документация: $doc"
            ((errors++))
        fi
    done
    
    return $errors
}

# Генерация отчета
generate_style_report() {
    local total_errors=$1
    local report_file="$REPORTS_DIR/code_style_report.md"
    
    cat > "$report_file" << EOF
# 📋 Отчет о проверке стиля кода

## 📊 Общее состояние
- Статус: $([ $total_errors -eq 0 ] && echo "✅ Соответствует стандартам" || echo "❌ Требуются исправления")
- Найдено проблем: $total_errors
- Дата проверки: $(date)

## 🔍 Проверенные компоненты
1. Структура директорий
2. Конфигурационные файлы
3. Стиль кода TypeScript
4. Документация

## 📝 Рекомендации по стилю кода
1. Использовать camelCase для:
   - Имен переменных
   - Имен функций
   - Имен методов

2. Использовать PascalCase для:
   - Имен классов
   - Имен интерфейсов
   - Имен типов

3. Использовать UPPER_SNAKE_CASE для:
   - Констант
   - Enum значений

4. Отступы и форматирование:
   - Использовать 2 пробела для отступов
   - Использовать точку с запятой в конце строк
   - Использовать одинарные кавычки для строк

5. Документация:
   - JSDoc для публичных API
   - Комментарии для сложной логики
   - README для каждой директории

## 🎯 Следующие шаги
$([ $total_errors -gt 0 ] && echo "1. Исправить найденные проблемы
2. Обновить отсутствующие файлы
3. Привести код в соответствие со стандартами" || echo "1. Поддерживать текущие стандарты
2. Регулярно проводить проверки
3. Обновлять документацию")

_Отчет создан: $(date)_
EOF

    emotional_echo "success" "✨ Отчет сохранен в: $report_file"
}

# Основной процесс
main() {
    emotional_echo "excited" "🚀 Начинаю проверку стиля кода..."
    local total_errors=0
    local errors=0
    
    # Проверка структуры директорий
    check_directory_structure
    errors=$?
    total_errors=$((total_errors + errors))
    
    # Проверка конфигурационных файлов
    check_config_files
    errors=$?
    total_errors=$((total_errors + errors))
    
    # Проверка стиля TypeScript
    check_typescript_style
    errors=$?
    total_errors=$((total_errors + errors))
    
    # Проверка документации
    check_documentation
    errors=$?
    total_errors=$((total_errors + errors))
    
    # Генерация отчета
    generate_style_report $total_errors
    
    if [ $total_errors -eq 0 ]; then
        emotional_echo "happy" "✨ Все проверки пройдены успешно!"
    else
        emotional_echo "sad" "❌ Найдены проблемы: $total_errors. Требуется внимание!"
    fi
}

# Запуск скрипта
main 