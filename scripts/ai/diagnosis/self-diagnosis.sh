#!/bin/bash

# 🎨 Цвета для эмоционального вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
ORANGE='\033[0;33m'
PINK='\033[1;35m'
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
        "excited")
            echo -e "${BLUE}🤩 $message${NC}"
            ;;
        "working")
            echo -e "${YELLOW}⚡ $message${NC}"
            ;;
        "thinking")
            echo -e "${PURPLE}🤔 $message${NC}"
            ;;
        "success")
            echo -e "${CYAN}✨ $message${NC}"
            ;;
        "love")
            echo -e "${PINK}💝 $message${NC}"
            ;;
        "worried")
            echo -e "${ORANGE}😰 $message${NC}"
            ;;
    esac
}

# 📊 Функция проверки здоровья системы
check_system_health() {
    emotional_echo "working" "Проверяю здоровье системы..."
    local errors=0

    # Проверка структуры директорий
    for dir in "core" "ai" "automation"; do
        if [ ! -d "$SCRIPTS_ROOT/$dir" ]; then
            emotional_echo "sad" "Директория $dir отсутствует!"
            ((errors++))
        fi
    done

    # Проверка критических файлов
    for file in "MAIN.md" "ROADMAP.md" "README.md"; do
        if [ ! -f "$SCRIPTS_ROOT/$file" ]; then
            emotional_echo "sad" "Файл $file отсутствует!"
            ((errors++))
        fi
    done

    return $errors
}

# 🧠 Функция проверки AI компонентов
check_ai_components() {
    emotional_echo "thinking" "Анализирую AI компоненты..."
    local errors=0

    # Проверка скриптов AI
    for script in "diagnosis/self-diagnosis.sh" "learning/memory-processor.sh"; do
        if [ ! -f "$SCRIPTS_ROOT/ai/$script" ]; then
            emotional_echo "worried" "AI скрипт $script отсутствует!"
            ((errors++))
        fi
    done

    return $errors
}

# 🔄 Функция проверки автоматизации
check_automation() {
    emotional_echo "working" "Проверяю компоненты автоматизации..."
    local errors=0

    if [ ! -f "$SCRIPTS_ROOT/automation/auto-tasks.sh" ]; then
        emotional_echo "worried" "Скрипт автоматизации отсутствует!"
        ((errors++))
    fi

    return $errors
}

# 📝 Функция создания отчета
generate_diagnosis_report() {
    local total_errors=$1
    local report_file="$SCRIPTS_ROOT/ai/diagnosis/diagnosis_report.md"

    cat > "$report_file" << EOF
# 🏥 Отчет о самодиагностике

## 📊 Общее состояние
- Статус: $([ $total_errors -eq 0 ] && echo "✅ Здоров" || echo "❌ Требует внимания")
- Обнаружено проблем: $total_errors
- Дата проверки: $(date)

## 🔍 Проверенные компоненты
1. Структура системы
2. AI компоненты
3. Автоматизация

## 💡 Рекомендации
$([ $total_errors -gt 0 ] && echo "- Исправить обнаруженные проблемы
- Обновить отсутствующие компоненты
- Проверить целостность системы" || echo "- Система работает корректно
- Рекомендуется регулярная профилактика
- Продолжать мониторинг состояния")

_Отчет создан: $(date)_
EOF

    emotional_echo "success" "Отчет сохранен в: $report_file"
}

# 🚀 Основная функция
main() {
    emotional_echo "excited" "🚀 Начинаю самодиагностику системы..."
    local total_errors=0
    local errors=0

    # Проверка здоровья системы
    check_system_health
    errors=$?
    total_errors=$((total_errors + errors))

    # Проверка AI компонентов
    check_ai_components
    errors=$?
    total_errors=$((total_errors + errors))

    # Проверка автоматизации
    check_automation
    errors=$?
    total_errors=$((total_errors + errors))

    # Генерация отчета
    generate_diagnosis_report $total_errors

    # Запускаем эмоциональный инсайт
    ./emotional-insight.sh

    if [ $total_errors -eq 0 ]; then
        emotional_echo "love" "Система полностью здорова! 💝"
    else
        emotional_echo "worried" "Обнаружено проблем: $total_errors. Требуется внимание! 🔧"
    fi

    emotional_echo "happy" "✨ Самодиагностика завершена!"
}

# Запускаем скрипт
main
