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
REPORTS_DIR="$PROJECT_ROOT/scripts/core/metrics/reports"

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

# Анализ размера кодовой базы
analyze_codebase_size() {
    emotional_echo "thinking" "📊 Анализирую размер кодовой базы..."
    
    local total_files=$(find "$PROJECT_ROOT/src" -type f -name "*.ts" | wc -l)
    local total_lines=$(find "$PROJECT_ROOT/src" -type f -name "*.ts" -exec cat {} \; | wc -l)
    local avg_file_size=$((total_lines / total_files))
    
    echo "Файлов TypeScript: $total_files"
    echo "Всего строк кода: $total_lines"
    echo "Средний размер файла: $avg_file_size строк"
}

# Анализ сложности кода
analyze_code_complexity() {
    emotional_echo "thinking" "🔍 Анализирую сложность кода..."
    
    local complex_files=0
    local file_list=$(find "$PROJECT_ROOT/src" -type f -name "*.ts")
    
    for file in $file_list; do
        local lines=$(cat "$file" | wc -l)
        if [ $lines -gt 300 ]; then
            ((complex_files++))
            echo "⚠️ Большой файл: $file ($lines строк)"
        fi
    done
    
    echo "Файлов со сложной структурой: $complex_files"
}

# Анализ типов файлов
analyze_file_types() {
    emotional_echo "thinking" "📑 Анализирую типы файлов..."
    
    echo "TypeScript файлы:"
    find "$PROJECT_ROOT/src" -type f -name "*.ts" | wc -l
    
    echo "Тестовые файлы:"
    find "$PROJECT_ROOT/src" -type f -name "*.test.ts" | wc -l
    
    echo "Конфигурационные файлы:"
    find "$PROJECT_ROOT" -type f -name "*.json" -o -name "*.yaml" -o -name "*.yml" | wc -l
}

# Анализ документации
analyze_documentation() {
    emotional_echo "thinking" "📚 Анализирую документацию..."
    
    local total_docs=$(find "$PROJECT_ROOT" -type f -name "*.md" | wc -l)
    local readme_files=$(find "$PROJECT_ROOT" -type f -name "README.md" | wc -l)
    
    echo "Всего файлов документации: $total_docs"
    echo "README файлов: $readme_files"
}

# Генерация отчета о метриках
generate_metrics_report() {
    local report_file="$REPORTS_DIR/project_metrics.md"
    
    cat > "$report_file" << EOF
# 📊 Отчет о метриках проекта

## 📈 Размер кодовой базы
$(analyze_codebase_size)

## 🔍 Сложность кода
$(analyze_code_complexity)

## 📑 Типы файлов
$(analyze_file_types)

## 📚 Документация
$(analyze_documentation)

## 💡 Рекомендации
1. Файлы более 300 строк рекомендуется разделить
2. Каждая директория должна иметь README.md
3. Сложные функции должны быть документированы
4. Поддерживать баланс кода и тестов

## 🎯 Целевые метрики
- Максимальный размер файла: 300 строк
- Покрытие тестами: минимум 80%
- Документация: README в каждой директории
- Сложность функций: не более 10 уровней вложенности

_Отчет создан: $(date)_
EOF

    emotional_echo "success" "✨ Отчет сохранен в: $report_file"
}

# Основной процесс
main() {
    emotional_echo "excited" "🚀 Начинаю анализ метрик проекта..."
    
    # Генерация отчета
    generate_metrics_report
    
    emotional_echo "happy" "✨ Анализ метрик завершен!"
    emotional_echo "loving" "💝 Проверьте отчет: $REPORTS_DIR/project_metrics.md"
}

# Запуск скрипта
main 