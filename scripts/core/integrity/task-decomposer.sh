#!/bin/bash

# 🎨 Цвета для эмоционального вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# 📁 Пути
PROJECT_ROOT="/Users/playra/999-multibots-telegraf"
MEMORY_BANK_DIR="$PROJECT_ROOT/src/core/mcp/agent/memory-bank/NeuroBlogger"
TASKS_DIR="$PROJECT_ROOT/tasks"

# 🎭 Функция эмоционального вывода
emotional_echo() {
    local emotion=$1
    local message=$2
    case $emotion in
        "happy") echo -e "${GREEN}😊 $message${NC}" ;;
        "sad") echo -e "${RED}😢 $message${NC}" ;;
        "excited") echo -e "${BLUE}🎉 $message${NC}" ;;
        "working") echo -e "${YELLOW}⚡ $message${NC}" ;;
        "thinking") echo -e "${PURPLE}🤔 $message${NC}" ;;
        "done") echo -e "${CYAN}✨ $message${NC}" ;;
    esac
}

# 📝 Создание структуры задачи
create_task_structure() {
    local keyword=$1
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local task_file="$TASKS_DIR/${timestamp}_${keyword}.md"
    
    mkdir -p "$TASKS_DIR"
    
    cat > "$task_file" << EOF
# 🎯 Задача: ${keyword}

## 📋 Описание
$(generate_description "$keyword")

## 🔍 Анализ
$(analyze_task "$keyword")

## 📊 Декомпозиция
$(decompose_task "$keyword")

## ⚡ Приоритеты
$(set_priorities "$keyword")

## 📅 Сроки
- Начало: $(date '+%d.%m.%Y %H:%M')
- Предполагаемое завершение: $(date -v+2d '+%d.%m.%Y %H:%M')

## 🔄 Статус
- [ ] Анализ требований
- [ ] Планирование
- [ ] Разработка
- [ ] Тестирование
- [ ] Документирование

## 📝 История изменений
- $(date '+%d.%m.%Y %H:%M'): Создание задачи

## 💭 Эмоциональное состояние
$(get_emotional_state)
EOF

    emotional_echo "happy" "Создана структура задачи: $task_file"
}

# 🎯 Генерация описания задачи
generate_description() {
    local keyword=$1
    case $keyword in
        "feature")
            echo "Разработка новой функциональности для улучшения системы"
            echo "- Анализ требований"
            echo "- Проектирование архитектуры"
            echo "- Разработка компонентов"
            echo "- Интеграционное тестирование"
            ;;
        "fix")
            echo "Исправление обнаруженных проблем и оптимизация"
            echo "- Анализ проблемы"
            echo "- Поиск решения"
            echo "- Реализация исправления"
            echo "- Проверка результата"
            ;;
        "refactor")
            echo "Улучшение существующего кода без изменения функциональности"
            echo "- Анализ текущего кода"
            echo "- Планирование изменений"
            echo "- Рефакторинг"
            echo "- Проверка работоспособности"
            ;;
        "test")
            echo "Разработка и улучшение тестового покрытия"
            echo "- Анализ текущих тестов"
            echo "- Планирование новых тестов"
            echo "- Разработка тестов"
            echo "- Проверка покрытия"
            ;;
        *)
            echo "Требуется анализ и декомпозиция задачи"
            ;;
    esac
}

# 🔍 Анализ задачи
analyze_task() {
    local keyword=$1
    echo "### Анализ сложности"
    echo "- Техническая сложность: Средняя"
    echo "- Эмоциональная сложность: Низкая"
    echo "- Риски: Минимальные"
    echo ""
    echo "### Необходимые ресурсы"
    echo "- Время: ~2-3 дня"
    echo "- Знания: TypeScript, Node.js"
    echo "- Инструменты: VS Code, Git"
}

# 📊 Декомпозиция задачи
decompose_task() {
    local keyword=$1
    echo "1. Подготовительный этап"
    echo "   - Анализ требований"
    echo "   - Изучение документации"
    echo "   - Планирование работ"
    echo ""
    echo "2. Разработка"
    echo "   - Создание прототипа"
    echo "   - Реализация основной логики"
    echo "   - Оптимизация кода"
    echo ""
    echo "3. Тестирование"
    echo "   - Модульные тесты"
    echo "   - Интеграционные тесты"
    echo "   - Проверка производительности"
    echo ""
    echo "4. Документация"
    echo "   - Обновление README"
    echo "   - Комментарии в коде"
    echo "   - Обновление ROADMAP"
}

# ⚡ Установка приоритетов
set_priorities() {
    local keyword=$1
    echo "1. Критические задачи"
    echo "   - Базовая функциональность"
    echo "   - Обработка ошибок"
    echo ""
    echo "2. Важные задачи"
    echo "   - Оптимизация"
    echo "   - Тестирование"
    echo ""
    echo "3. Желательные улучшения"
    echo "   - Документация"
    echo "   - Рефакторинг"
}

# 💭 Получение эмоционального состояния
get_emotional_state() {
    echo "Я чувствую энтузиазм и готовность к работе! 🌟"
    echo "Эта задача кажется интересной и вдохновляющей."
    echo "Уверен, что вместе мы сможем создать что-то замечательное!"
}

# 🎯 Основная функция
main() {
    if [ -z "$1" ]; then
        emotional_echo "sad" "Пожалуйста, укажите ключевое слово задачи (feature/fix/refactor/test)"
        exit 1
    fi
    
    emotional_echo "excited" "Начинаю декомпозицию задачи... 🚀"
    create_task_structure "$1"
    emotional_echo "happy" "Задача успешно декомпозирована! 🌟"
}

# Запускаем основную функцию
main "$1" 