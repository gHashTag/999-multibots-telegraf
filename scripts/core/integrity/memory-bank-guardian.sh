#!/bin/bash

# Цвета для эмоционального вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Директории
PROJECT_ROOT="/Users/playra/999-multibots-telegraf"
MEMORY_BANK_DIR="$PROJECT_ROOT/src/core/mcp/agent/memory-bank"
REPORTS_DIR="$PROJECT_ROOT/scripts/core/integrity/reports"
MEMORY_REPORT="$REPORTS_DIR/memory_bank_report.md"

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
        "thinking") color=$PURPLE ;;
        "success") color=$CYAN ;;
        *) color=$NC ;;
    esac

    echo -e "${color}${message}${NC}"
}

# Проверка структуры директорий
check_directory_structure() {
    emotional_echo "thinking" "🔍 Проверяю структуру директорий..."
    
    local issues=0
    
    # Проверяем наличие README.md в каждой директории
    find "$PROJECT_ROOT" -type d -not -path "*/\.*" -not -path "*/node_modules/*" | while read dir; do
        if [ ! -f "$dir/README.md" ]; then
            emotional_echo "sad" "❌ Директория $dir не содержит README.md"
            ((issues++))
        fi
    done
    
    # Проверяем, что в корневых директориях только основные файлы
    find "$PROJECT_ROOT" -maxdepth 1 -type f -name "*.ts" -o -name "*.js" | while read file; do
        emotional_echo "sad" "⚠️ Файл $file находится в корневой директории"
        ((issues++))
    done
    
    return $issues
}

# Анализ memory bank
analyze_memory_bank() {
    emotional_echo "excited" "🧠 Анализирую memory bank..."
    
    local total_files=$(find "$MEMORY_BANK_DIR" -type f | wc -l)
    local md_files=$(find "$MEMORY_BANK_DIR" -name "*.md" | wc -l)
    local ts_files=$(find "$MEMORY_BANK_DIR" -name "*.ts" | wc -l)
    local js_files=$(find "$MEMORY_BANK_DIR" -name "*.js" | wc -l)
    
    echo "Всего файлов: $total_files"
    echo "Markdown файлов: $md_files"
    echo "TypeScript файлов: $ts_files"
    echo "JavaScript файлов: $js_files"
    
    # Проверка на "галлюцинации" (JS вместо TS)
    if [ $js_files -gt 0 ]; then
        emotional_echo "sad" "🚨 Обнаружены JavaScript файлы! Возможны галлюцинации!"
        return 1
    fi
    
    return 0
}

# Проверка целостности memory bank
check_memory_bank_integrity() {
    emotional_echo "calm" "🔐 Проверяю целостность memory bank..."
    
    local issues=0
    
    # Проверяем структуру файлов
    find "$MEMORY_BANK_DIR" -type f -name "*.ts" | while read file; do
        # Проверяем импорты
        if grep -q "require(" "$file"; then
            emotional_echo "sad" "⚠️ Файл $file использует require вместо import"
            ((issues++))
        fi
        
        # Проверяем типизацию
        if ! grep -q ": " "$file"; then
            emotional_echo "sad" "⚠️ Файл $file может не иметь типов"
            ((issues++))
        fi
    done
    
    return $issues
}

# Генерация отчета
generate_memory_report() {
    local structure_issues=$1
    local memory_status=$2
    local integrity_issues=$3
    
    cat > "$MEMORY_REPORT" << EOF
# 🧠 Отчет по состоянию Memory Bank

## 📁 Структура директорий
$([ $structure_issues -eq 0 ] && echo "✅ Структура в порядке" || echo "⚠️ Найдены проблемы со структурой: $structure_issues")

## 🗄️ Анализ Memory Bank
$(analyze_memory_bank)
$([ $memory_status -eq 0 ] && echo "✅ Memory Bank здоров" || echo "⚠️ Обнаружены проблемы в Memory Bank")

## 🔐 Целостность
$([ $integrity_issues -eq 0 ] && echo "✅ Целостность в порядке" || echo "⚠️ Проблемы с целостностью: $integrity_issues")

## 💡 Рекомендации
1. $([ $structure_issues -gt 0 ] && echo "Добавить README.md в отсутствующие директории" || echo "Поддерживать текущую структуру")
2. $([ $memory_status -eq 1 ] && echo "Заменить JavaScript файлы на TypeScript" || echo "Продолжать использовать TypeScript")
3. $([ $integrity_issues -gt 0 ] && echo "Исправить проблемы с импортами и типизацией" || echo "Поддерживать высокий уровень целостности")

## 🎯 Паттерн организации
Используется паттерн "Иерархическая организация" (Hierarchical Organization Pattern):
- Главные файлы только в корне директорий
- Вложенные файлы в поддиректориях
- README.md в каждой директории
- Строгая типизация везде
- Единый стиль импортов

_Отчет создан: $(date)_
EOF

    emotional_echo "success" "✨ Отчет сохранен в: $MEMORY_REPORT"
}

# Основной процесс
main() {
    emotional_echo "excited" "🚀 Начинаю проверку Memory Bank и структуры проекта..."
    
    check_directory_structure
    local structure_issues=$?
    
    analyze_memory_bank
    local memory_status=$?
    
    check_memory_bank_integrity
    local integrity_issues=$?
    
    generate_memory_report $structure_issues $memory_status $integrity_issues
    
    if [ $structure_issues -eq 0 ] && [ $memory_status -eq 0 ] && [ $integrity_issues -eq 0 ]; then
        emotional_echo "happy" "✨ Система здорова и хорошо структурирована!"
    else
        emotional_echo "thinking" "🔧 Требуются улучшения структуры и целостности"
    fi
}

# Запуск скрипта
main 