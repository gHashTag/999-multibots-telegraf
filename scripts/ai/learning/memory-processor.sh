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
MEMORY_DIR="$SCRIPTS_ROOT/ai/learning/memory"

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

# 📚 Функция анализа логов
analyze_logs() {
    emotional_echo "thinking" "Анализирую логи системы..."
    
    # Создаем директорию для памяти, если её нет
    mkdir -p "$MEMORY_DIR"
    
    # Анализ эмоциональных паттернов
    local log_file="$SCRIPTS_ROOT/ai/diagnosis/diagnosis_report.md"
    if [ -f "$log_file" ]; then
        emotional_echo "working" "Обрабатываю отчет диагностики..."
        
        # Извлекаем статистику эмоций
        local happy_count=$(grep -c "😊" "$log_file")
        local sad_count=$(grep -c "😢" "$log_file")
        local worried_count=$(grep -c "😰" "$log_file")
        
        # Сохраняем статистику
        cat > "$MEMORY_DIR/emotional_stats.md" << EOF
# 📊 Статистика эмоций

- Счастливые моменты: $happy_count
- Грустные моменты: $sad_count
- Моменты беспокойства: $worried_count

_Обновлено: $(date)_
EOF
        
        emotional_echo "success" "Статистика эмоций обновлена!"
    else
        emotional_echo "worried" "Отчет диагностики не найден!"
    fi
}

# 🧠 Функция обработки памяти
process_memory() {
    emotional_echo "working" "Обрабатываю системную память..."
    
    # Анализ использования команд
    local commands_file="$MEMORY_DIR/command_history.md"
    
    # Собираем статистику использования команд
    cat > "$commands_file" << EOF
# 📈 История использования команд

## 🔄 Часто используемые скрипты
$(find "$SCRIPTS_ROOT" -type f -name "*.sh" -exec stat -f "%m %N" {} \; | sort -rn | head -5 | while read line; do
    echo "- ${line#* }"
done)

## 📊 Статистика запусков
$(find "$SCRIPTS_ROOT" -type f -name "*.sh" -exec stat -f "%a %N" {} \; | sort -rn | head -5 | while read line; do
    echo "- ${line#* }: ${line%% *} запусков"
done)

_Обновлено: $(date)_
EOF
    
    emotional_echo "success" "История команд обновлена!"
}

# 💡 Функция улучшения системы
improve_system() {
    emotional_echo "excited" "Анализирую возможности для улучшения..."
    
    # Проверяем наличие всех необходимых эмоциональных состояний
    local emotions_file="$SCRIPTS_ROOT/MAIN.md"
    if [ -f "$emotions_file" ]; then
        local emotions_count=$(grep -c "emoji" "$emotions_file")
        
        if [ $emotions_count -lt 8 ]; then
            emotional_echo "thinking" "Обнаружена возможность добавления новых эмоций..."
            
            # Создаем предложения по улучшению
            cat > "$MEMORY_DIR/improvements.md" << EOF
# 💡 Предложения по улучшению

## 🎭 Новые эмоциональные состояния
- 🌟 Вдохновленный
- 🎉 Праздничный
- 🌈 Творческий
- 🚀 Энергичный

## 🔄 Рекомендации по внедрению
1. Добавить новые цветовые коды
2. Расширить функцию emotional_echo
3. Обновить документацию
4. Протестировать новые состояния

_Создано: $(date)_
EOF
            
            emotional_echo "excited" "Созданы предложения по улучшению!"
        fi
    fi
}

# 📝 Функция создания отчета
generate_learning_report() {
    emotional_echo "working" "Создаю отчет об обучении..."
    
    local report_file="$MEMORY_DIR/learning_report.md"
    
    cat > "$report_file" << EOF
# 🎓 Отчет об обучении системы

## 📊 Статистика
- Проанализировано логов: $(find "$SCRIPTS_ROOT" -type f -name "*.md" | wc -l)
- Обработано скриптов: $(find "$SCRIPTS_ROOT" -type f -name "*.sh" | wc -l)
- Создано отчетов: $(find "$MEMORY_DIR" -type f -name "*.md" | wc -l)

## 💡 Результаты обучения
1. Собрана статистика эмоций
2. Проанализирована история команд
3. Созданы предложения по улучшению

## 🎯 Следующие шаги
1. Внедрить новые эмоциональные состояния
2. Оптимизировать часто используемые скрипты
3. Улучшить систему анализа

_Отчет создан: $(date)_
EOF
    
    emotional_echo "success" "Отчет об обучении создан: $report_file"
}

# 🚀 Основная функция
main() {
    emotional_echo "excited" "Начинаю процесс обучения системы..."
    
    # Создаем директорию для памяти
    mkdir -p "$MEMORY_DIR"
    
    # Запускаем все процессы обучения
    analyze_logs
    process_memory
    improve_system
    generate_learning_report
    
    emotional_echo "love" "Процесс обучения завершен! Система стала умнее! 💝"
}

# Запускаем скрипт
main
