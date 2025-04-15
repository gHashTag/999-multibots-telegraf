#!/bin/bash

# Цвета для эмоционального вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Эмоциональный вывод
emotional_echo() {
    local message=$1
    local emotion=$2
    
    case $emotion in
        "happy")
            echo -e "${GREEN}😊 $message${NC}"
            ;;
        "love")
            echo -e "${PURPLE}💜 $message${NC}"
            ;;
        "info")
            echo -e "${BLUE}ℹ️  $message${NC}"
            ;;
        "warning")
            echo -e "${YELLOW}⚠️  $message${NC}"
            ;;
        "error")
            echo -e "${RED}❌ $message${NC}"
            ;;
        *)
            echo -e "$message"
            ;;
    esac
}

# Проверка README.md
check_readme() {
    local readme_path="/Users/playra/999-multibots-telegraf/src/core/mcp/agent/memory-bank/NeuroBlogger/README.md"
    if [ ! -f "$readme_path" ]; then
        emotional_echo "README.md не найден!" "error"
        return 1
    fi
    emotional_echo "README.md найден и готов к обновлению" "happy"
    return 0
}

# Подсчет эффективности
calculate_efficiency() {
    local total_files=$(find .. -type f -name "*.ts" -o -name "*.md" | wc -l)
    local documented_files=$(find .. -type f -name "*.md" | wc -l)
    local efficiency=$(( (documented_files * 100) / total_files ))
    echo $efficiency
}

# Подсчет надежности
calculate_reliability() {
    local total_scripts=$(find /Users/playra/999-multibots-telegraf/src/core/mcp/agent/memory-bank/NeuroBlogger/scripts -type f -name "*.sh" | wc -l)
    local working_scripts=0
    
    for script in $(find /Users/playra/999-multibots-telegraf/src/core/mcp/agent/memory-bank/NeuroBlogger/scripts -type f -name "*.sh"); do
        if [ -x "$script" ]; then
            ((working_scripts++))
        fi
    done
    
    local reliability=$(( (working_scripts * 100) / total_scripts ))
    echo $reliability
}

# Подсчет эмоциональности
calculate_emotion() {
    local total_files=$(find .. -type f -name "*.md" | wc -l)
    local emotional_files=0
    
    for file in $(find .. -type f -name "*.md"); do
        if grep -q "😊\|💜\|🌟\|✨" "$file"; then
            ((emotional_files++))
        fi
    done
    
    local emotion=$(( (emotional_files * 100) / total_files ))
    echo $emotion
}

# Подсчет самообучения
calculate_learning() {
    local history_files=$(find /Users/playra/999-multibots-telegraf/src/core/mcp/agent/memory-bank/NeuroBlogger/.history -type f | wc -l)
    local learning=0
    
    if [ $history_files -gt 100 ]; then
        learning=95
    elif [ $history_files -gt 50 ]; then
        learning=85
    elif [ $history_files -gt 20 ]; then
        learning=75
    else
        learning=65
    fi
    
    echo $learning
}

# Обновление метрик в README.md
update_metrics() {
    local efficiency=$(calculate_efficiency)
    local reliability=$(calculate_reliability)
    local emotion=$(calculate_emotion)
    local learning=$(calculate_learning)
    
    local date=$(date +%d.%m.%Y)
    
    # Создаем временный файл
    local temp_file=$(mktemp)
    
    # Обновляем метрики
    sed "/## 📊 Метрики/,/## 📅 Статус/c\
## 📊 Метрики\n\
- Эффективность: ${efficiency}%\n\
- Надежность: ${reliability}%\n\
- Эмоциональность: ${emotion}%\n\
- Самообучение: ${learning}%\n\
\n\
## 📅 Статус\n\
- Версия: 2.1 \"Эмпатия\"\n\
- Обновлено: ${date}\n\
- Состояние: Активен" /Users/playra/999-multibots-telegraf/src/core/mcp/agent/memory-bank/NeuroBlogger/README.md > "$temp_file"
    
    # Проверяем результат
    if [ $? -eq 0 ]; then
        mv "$temp_file" /Users/playra/999-multibots-telegraf/src/core/mcp/agent/memory-bank/NeuroBlogger/README.md
        emotional_echo "Метрики успешно обновлены! 🎉" "happy"
        emotional_echo "Эффективность: ${efficiency}%" "info"
        emotional_echo "Надежность: ${reliability}%" "info"
        emotional_echo "Эмоциональность: ${emotion}%" "info"
        emotional_echo "Самообучение: ${learning}%" "info"
    else
        emotional_echo "Ошибка при обновлении метрик!" "error"
        rm "$temp_file"
        return 1
    fi
}

# Главная функция
main() {
    emotional_echo "🌟 Начинаем обновление метрик..." "love"
    
    if ! check_readme; then
        return 1
    fi
    
    emotional_echo "📊 Подсчитываем метрики..." "info"
    if ! update_metrics; then
        emotional_echo "❌ Ошибка при обновлении метрик" "error"
        return 1
    fi
    
    emotional_echo "✨ Метрики успешно обновлены!" "happy"
    emotional_echo "💜 Спасибо за заботу о качестве проекта!" "love"
    return 0
}

# Запускаем скрипт
main 