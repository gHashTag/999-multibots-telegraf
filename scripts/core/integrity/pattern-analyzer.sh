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
REPORTS_DIR="$PROJECT_ROOT/scripts/core/integrity/reports"
PATTERN_REPORT="$REPORTS_DIR/pattern_analysis.md"

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

# Анализ функциональных паттернов
analyze_functional_patterns() {
    emotional_echo "thinking" "🔍 Анализирую функциональные паттерны..."
    
    local map_count=$(grep -r "\.map(" "$PROJECT_ROOT/src" | wc -l)
    local filter_count=$(grep -r "\.filter(" "$PROJECT_ROOT/src" | wc -l)
    local reduce_count=$(grep -r "\.reduce(" "$PROJECT_ROOT/src" | wc -l)
    local pipe_count=$(grep -r "pipe(" "$PROJECT_ROOT/src" | wc -l)
    local compose_count=$(grep -r "compose(" "$PROJECT_ROOT/src" | wc -l)
    local curry_count=$(grep -r "curry(" "$PROJECT_ROOT/src" | wc -l)
    
    echo "map: $map_count"
    echo "filter: $filter_count"
    echo "reduce: $reduce_count"
    echo "pipe: $pipe_count"
    echo "compose: $compose_count"
    echo "curry: $curry_count"
}

# Анализ чистоты функций
analyze_function_purity() {
    emotional_echo "calm" "🧪 Проверяю чистоту функций..."
    
    # Поиск побочных эффектов
    local side_effects=$(grep -r "setState\|useEffect\|fetch\|axios" "$PROJECT_ROOT/src" | wc -l)
    
    # Поиск мутаций
    local mutations=$(grep -r "push\|pop\|shift\|unshift\|splice\|sort\|reverse" "$PROJECT_ROOT/src" | wc -l)
    
    echo "Обнаружено потенциальных побочных эффектов: $side_effects"
    echo "Обнаружено мутаций: $mutations"
    
    return $((side_effects + mutations))
}

# Анализ композиции
analyze_composition() {
    emotional_echo "excited" "🎭 Анализирую композицию функций..."
    
    local composition_count=$(grep -r "compose(\|pipe(" "$PROJECT_ROOT/src" | wc -l)
    local chaining_count=$(grep -r "\.then(" "$PROJECT_ROOT/src" | wc -l)
    
    echo "Использование композиции: $composition_count"
    echo "Цепочки промисов: $chaining_count"
    
    return $composition_count
}

# Анализ иммутабельности
analyze_immutability() {
    emotional_echo "thinking" "🛡️ Проверяю иммутабельность..."
    
    local const_count=$(grep -r "const " "$PROJECT_ROOT/src" | wc -l)
    local let_count=$(grep -r "let " "$PROJECT_ROOT/src" | wc -l)
    local immutable_ratio=$((const_count * 100 / (const_count + let_count)))
    
    echo "Соотношение const/let: $immutable_ratio%"
    return $immutable_ratio
}

# Анализ типов данных
analyze_data_types() {
    emotional_echo "calm" "📊 Анализирую типы данных..."
    
    local interface_count=$(grep -r "interface " "$PROJECT_ROOT/src" | wc -l)
    local type_count=$(grep -r "type " "$PROJECT_ROOT/src" | wc -l)
    local enum_count=$(grep -r "enum " "$PROJECT_ROOT/src" | wc -l)
    
    echo "Интерфейсы: $interface_count"
    echo "Типы: $type_count"
    echo "Перечисления: $enum_count"
}

# Генерация отчета
generate_pattern_report() {
    local purity=$1
    local composition=$2
    local immutability=$3
    
    cat > "$PATTERN_REPORT" << EOF
# 🎯 Отчет по анализу паттернов проектирования

## 📊 Функциональные паттерны
$(analyze_functional_patterns)

## 🧪 Чистота функций
- Общее количество побочных эффектов: $purity
- Рекомендации:
  $([ $purity -gt 100 ] && echo "  - Требуется изоляция побочных эффектов" || echo "  - Хороший уровень чистоты функций")

## 🎭 Композиция
- Использование композиции: $composition случаев
- Рекомендации:
  $([ $composition -lt 10 ] && echo "  - Увеличить использование композиции" || echo "  - Хороший уровень композиции")

## 🛡️ Иммутабельность
- Соотношение const/let: $immutability%
- Рекомендации:
  $([ $immutability -lt 80 ] && echo "  - Увеличить использование const" || echo "  - Хороший уровень иммутабельности")

## 📈 Типы данных
$(analyze_data_types)

## 💡 Общие рекомендации
1. $([ $purity -gt 100 ] && echo "Изолировать побочные эффекты в отдельных модулях" || echo "Поддерживать текущий уровень чистоты функций")
2. $([ $composition -lt 10 ] && echo "Увеличить использование композиции функций" || echo "Продолжать использовать композицию")
3. $([ $immutability -lt 80 ] && echo "Повысить уровень иммутабельности" || echo "Поддерживать высокий уровень иммутабельности")

_Отчет создан: $(date)_
EOF

    emotional_echo "success" "✨ Отчет сохранен в: $PATTERN_REPORT"
}

# Основной процесс
main() {
    emotional_echo "excited" "🚀 Начинаю анализ паттернов проектирования..."
    
    analyze_function_purity
    local purity=$?
    
    analyze_composition
    local composition=$?
    
    analyze_immutability
    local immutability=$?
    
    generate_pattern_report $purity $composition $immutability
    
    if [ $immutability -gt 80 ] && [ $purity -lt 100 ]; then
        emotional_echo "happy" "✨ Код следует функциональным паттернам!"
    else
        emotional_echo "thinking" "🔧 Есть возможности для улучшения функционального стиля"
    fi
}

# Запуск скрипта
main 