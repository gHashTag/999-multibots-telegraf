#!/bin/bash

# Цвета для эмоционального вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
PINK='\033[1;35m'
GOLD='\033[0;33m'
NC='\033[0m'

# Директории
PROJECT_ROOT="/Users/playra/999-multibots-telegraf"
REPORTS_DIR="$PROJECT_ROOT/scripts/core/integrity/reports"
METRICS_REPORT="$PROJECT_ROOT/scripts/core/metrics/reports/project_metrics.md"
STYLE_REPORT="$PROJECT_ROOT/scripts/core/integrity/reports/code_style_report.md"

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
        "wisdom") color=$GOLD ;;
        *) color=$NC ;;
    esac

    echo -e "${color}${message}${NC}"
}

# Анализ использования классов
analyze_class_usage() {
    emotional_echo "thinking" "🔍 Анализирую использование классов..."
    
    local class_files=0
    local total_files=0
    local file_list=$(find "$PROJECT_ROOT/src" -type f -name "*.ts")
    
    for file in $file_list; do
        ((total_files++))
        if grep -l "class" "$file" > /dev/null; then
            ((class_files++))
            echo "⚠️ Файл содержит классы: $file"
        fi
    done
    
    local functional_percentage=$((100 - (class_files * 100 / total_files)))
    echo "Процент функционального кода: $functional_percentage%"
    echo "Файлов с классами: $class_files из $total_files"
    
    return $functional_percentage
}

# Анализ чистоты функций
analyze_function_purity() {
    emotional_echo "thinking" "🔍 Анализирую чистоту функций..."
    
    local impure_count=0
    local file_list=$(find "$PROJECT_ROOT/src" -type f -name "*.ts")
    
    for file in $file_list; do
        if grep -l "this\." "$file" > /dev/null || \
           grep -l "new " "$file" > /dev/null || \
           grep -l "setState" "$file" > /dev/null; then
            ((impure_count++))
            echo "⚠️ Файл содержит побочные эффекты: $file"
        fi
    done
    
    echo "Файлов с побочными эффектами: $impure_count"
    return $impure_count
}

# Проверка использования функциональных паттернов
check_functional_patterns() {
    emotional_echo "thinking" "🔍 Проверяю функциональные паттерны..."
    
    local patterns=(
        "map"
        "filter"
        "reduce"
        "pipe"
        "compose"
        "curry"
    )
    
    local pattern_usage=0
    for pattern in "${patterns[@]}"; do
        local count=$(find "$PROJECT_ROOT/src" -type f -name "*.ts" -exec grep -l "$pattern" {} \; | wc -l)
        ((pattern_usage += count))
        echo "Использование $pattern: $count файлов"
    done
    
    echo "Общее использование функциональных паттернов: $pattern_usage"
    return $pattern_usage
}

# Анализ иммутабельности
analyze_immutability() {
    emotional_echo "thinking" "🔍 Анализирую иммутабельность..."
    
    local mutable_count=0
    local file_list=$(find "$PROJECT_ROOT/src" -type f -name "*.ts")
    
    for file in $file_list; do
        if grep -l "let " "$file" > /dev/null || \
           grep -l "var " "$file" > /dev/null || \
           grep -l "push(" "$file" > /dev/null || \
           grep -l "splice(" "$file" > /dev/null; then
            ((mutable_count++))
            echo "⚠️ Файл содержит мутабельный код: $file"
        fi
    done
    
    echo "Файлов с мутабельным кодом: $mutable_count"
    return $mutable_count
}

# Интеграция с существующими отчетами
integrate_reports() {
    emotional_echo "thinking" "🔄 Интегрирую отчеты..."
    
    # Запускаем другие скрипты
    "$PROJECT_ROOT/scripts/core/metrics/project-metrics.sh"
    "$PROJECT_ROOT/scripts/core/integrity/code-style-guard.sh"
    
    # Ждем создания отчетов
    sleep 2
}

# Генерация отчета о функциональном стиле
generate_functional_report() {
    local functional_percentage=$1
    local impure_count=$2
    local pattern_usage=$3
    local mutable_count=$4
    local report_file="$REPORTS_DIR/functional_style_report.md"
    
    cat > "$report_file" << EOF
# 🧠 Отчет о функциональном стиле кода

## 📊 Общая статистика
- Процент функционального кода: $functional_percentage%
- Файлов с побочными эффектами: $impure_count
- Использование функциональных паттернов: $pattern_usage
- Файлов с мутабельным кодом: $mutable_count

## 💡 Рекомендации по улучшению
1. Переписать классы на функции
2. Использовать чистые функции
3. Применять функциональные паттерны
4. Обеспечить иммутабельность данных

## 🎯 Целевые показатели
- Функциональный код: 100%
- Побочные эффекты: 0
- Мутабельность: минимальная
- Использование паттернов: максимальное

## 🔄 Интеграция с другими метриками
- См. $METRICS_REPORT
- См. $STYLE_REPORT

## 💝 Эмоциональное состояние кода
$([ $functional_percentage -gt 80 ] && echo "Код чувствует себя прекрасно! 🌟" || echo "Код нуждается в заботе и внимании 💕")
$([ $impure_count -eq 0 ] && echo "Функции чисты как горный ручей! ✨" || echo "Функции хотят стать чище 💧")
$([ $mutable_count -eq 0 ] && echo "Данные надежно защищены! 🛡️" || echo "Данные хотят быть более стабильными 🔒")

_Отчет создан: $(date)_
EOF

    emotional_echo "success" "✨ Отчет сохранен в: $report_file"
}

# Основной процесс
main() {
    emotional_echo "excited" "🚀 Начинаю анализ функционального стиля..."
    
    # Интеграция с существующими отчетами
    integrate_reports
    
    # Анализ кода
    analyze_class_usage
    local functional_percentage=$?
    
    analyze_function_purity
    local impure_count=$?
    
    check_functional_patterns
    local pattern_usage=$?
    
    analyze_immutability
    local mutable_count=$?
    
    # Генерация отчета
    generate_functional_report $functional_percentage $impure_count $pattern_usage $mutable_count
    
    # Эмоциональное завершение
    if [ $functional_percentage -gt 80 ]; then
        emotional_echo "happy" "✨ Код преимущественно функциональный! Прекрасная работа!"
    else
        emotional_echo "loving" "💝 Код нуждается в нашей заботе. Давайте сделаем его лучше!"
    fi
}

# Запуск скрипта
main 