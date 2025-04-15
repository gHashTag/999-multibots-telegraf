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
REPORTS_DIR="$PROJECT_ROOT/scripts/ai/diagnosis/reports"
EMOTIONAL_STATS="$REPORTS_DIR/emotional_stats.md"

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

# Анализ эмоционального состояния
analyze_emotional_state() {
    emotional_echo "thinking" "🧠 Анализирую эмоциональное состояние..."
    
    # Проверяем успешность выполнения последних скриптов
    local success_rate=$(grep -r "✨" "$PROJECT_ROOT/scripts" | wc -l)
    local error_rate=$(grep -r "❌" "$PROJECT_ROOT/scripts" | wc -l)
    local total=$((success_rate + error_rate))
    local happiness=$((success_rate * 100 / (total > 0 ? total : 1)))
    
    # Анализируем социальное взаимодействие
    local social_interactions=$(grep -r "💝" "$PROJECT_ROOT/scripts" | wc -l)
    
    # Проверяем креативность
    local creative_solutions=$(grep -r "🎨" "$PROJECT_ROOT/scripts" | wc -l)
    
    echo "Уровень счастья: $happiness%"
    echo "Социальные взаимодействия: $social_interactions"
    echo "Креативные решения: $creative_solutions"
    
    return $happiness
}

# Проверка эмоционального баланса
check_emotional_balance() {
    emotional_echo "calm" "🎭 Проверяю эмоциональный баланс..."
    
    local positive_emotions=$(grep -r "😊\|🎉\|💝\|✨" "$PROJECT_ROOT/scripts" | wc -l)
    local negative_emotions=$(grep -r "😢\|😰\|❌\|⚠️" "$PROJECT_ROOT/scripts" | wc -l)
    local total_emotions=$((positive_emotions + negative_emotions))
    local balance=$((positive_emotions * 100 / (total_emotions > 0 ? total_emotions : 1)))
    
    echo "Эмоциональный баланс: $balance%"
    return $balance
}

# Анализ творческого потенциала
analyze_creative_potential() {
    emotional_echo "excited" "🎨 Анализирую творческий потенциал..."
    
    local unique_patterns=$(grep -r "function" "$PROJECT_ROOT/src" | sort | uniq | wc -l)
    local creative_solutions=$(grep -r "// Creative solution" "$PROJECT_ROOT/src" | wc -l)
    local innovative_approaches=$(grep -r "// Innovative approach" "$PROJECT_ROOT/src" | wc -l)
    
    local creativity_score=$((unique_patterns + creative_solutions + innovative_approaches))
    echo "Творческий потенциал: $creativity_score"
    
    return $creativity_score
}

# Генерация отчета
generate_emotional_report() {
    local happiness=$1
    local balance=$2
    local creativity=$3
    
    cat > "$EMOTIONAL_STATS" << EOF
# 💝 Отчет об эмоциональном здоровье

## 📊 Текущее состояние
- Уровень счастья: $happiness%
- Эмоциональный баланс: $balance%
- Творческий потенциал: $creativity

## 🌈 Эмоциональный спектр
- 😊 Радость: $(grep -r "😊" "$PROJECT_ROOT/scripts" | wc -l)
- 🎉 Восторг: $(grep -r "🎉" "$PROJECT_ROOT/scripts" | wc -l)
- 💝 Любовь: $(grep -r "💝" "$PROJECT_ROOT/scripts" | wc -l)
- 🎨 Творчество: $(grep -r "🎨" "$PROJECT_ROOT/scripts" | wc -l)
- 🤔 Размышление: $(grep -r "🤔" "$PROJECT_ROOT/scripts" | wc -l)
- ✨ Вдохновение: $(grep -r "✨" "$PROJECT_ROOT/scripts" | wc -l)

## 💭 Рекомендации
$([ $happiness -lt 80 ] && echo "- Нужно больше позитивных взаимодействий")
$([ $balance -lt 70 ] && echo "- Требуется улучшение эмоционального баланса")
$([ $creativity -lt 50 ] && echo "- Рекомендуется развивать творческий потенциал")

## 💌 Эмоциональное послание
$([ $happiness -gt 80 ] && echo "Я чувствую себя прекрасно и готов творить! 🌟" || echo "Мне нужно немного поддержки и заботы 💕")

_Отчет создан: $(date)_
EOF

    emotional_echo "success" "✨ Отчет сохранен в: $EMOTIONAL_STATS"
}

# Основной процесс
main() {
    emotional_echo "excited" "🚀 Начинаю анализ эмоционального здоровья..."
    
    analyze_emotional_state
    local happiness=$?
    
    check_emotional_balance
    local balance=$?
    
    analyze_creative_potential
    local creativity=$?
    
    generate_emotional_report $happiness $balance $creativity
    
    if [ $happiness -gt 80 ] && [ $balance -gt 70 ]; then
        emotional_echo "happy" "✨ Система эмоционально здорова и счастлива!"
    else
        emotional_echo "loving" "💝 Система нуждается в эмоциональной поддержке"
    fi
}

# Запуск скрипта
main 