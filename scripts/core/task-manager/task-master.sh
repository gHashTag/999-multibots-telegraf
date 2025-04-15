#!/bin/bash

# 🎯 Task Master - Главный координатор задач

# Цвета для эмоционального вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Пути
SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPTS_DIR/../../.." && pwd)"
TASK_GUARDIAN="$SCRIPTS_DIR/task-guardian.sh"
CURRENT_TASK_FILE="$PROJECT_ROOT/src/core/mcp/agent/memory-bank/NeuroBlogger/tasks/current_task.md"
MAIN_FILE="$PROJECT_ROOT/src/core/mcp/agent/memory-bank/NeuroBlogger/MAIN.md"

# Функция эмоционального вывода
print_emotional() {
    local message=$1
    local emotion=$2
    case $emotion in
        "happy") echo -e "${GREEN}😊 $message${NC}" ;;
        "excited") echo -e "${YELLOW}🚀 $message${NC}" ;;
        "neutral") echo -e "${BLUE}ℹ️ $message${NC}" ;;
        "concerned") echo -e "${PURPLE}🤔 $message${NC}" ;;
        "error") echo -e "${RED}❌ $message${NC}" ;;
        "love") echo -e "${PURPLE}💝 $message${NC}" ;;
        *) echo -e "${CYAN}$message${NC}" ;;
    esac
}

# Функция автоматической декомпозиции задачи из текста
decompose_task() {
    local input_text=$1
    local title
    local description
    local components
    local acceptance_criteria
    
    # Извлекаем суть задачи для заголовка (первое предложение)
    title=$(echo "$input_text" | sed 's/\([.!?]\) .*/\1/' | sed 's/^[[:space:]]*//')
    
    # Остальной текст идет в описание
    description=$(echo "$input_text" | sed "s/$title//" | sed 's/^[[:space:]]*//')
    
    # Создаем структуру задачи
    cat > "$CURRENT_TASK_FILE" << EOF
# 📋 Задача: $title

## 📊 Метаданные
- Статус: В работе
- Создана: $(date +"%Y-%m-%d %H:%M:%S")
- Приоритет: Высокий
- Тип: Автоматически декомпозированная

## 📝 Описание
$description

## 🎯 Цели
- [ ] Определить конкретные результаты
- [ ] Установить метрики успеха
- [ ] Определить временные рамки

## 📈 Декомпозиция
1. Анализ требований
   - [ ] Изучить текущее состояние
   - [ ] Определить ключевые компоненты
   - [ ] Выявить зависимости

2. Планирование
   - [ ] Создать план реализации
   - [ ] Определить необходимые ресурсы
   - [ ] Установить контрольные точки

3. Реализация
   - [ ] Выполнить основные задачи
   - [ ] Провести тестирование
   - [ ] Документировать изменения

## 🔄 Текущий прогресс
- Начало работы: $(date +"%Y-%m-%d %H:%M:%S")
- Статус: Активная

## 📎 Связанные файлы
- MAIN.md
- ROADMAP.md
- task-guardian.sh

## 🗒️ Заметки
- Задача создана автоматически через радужный мост
- Исходный текст: "$input_text"

EOF
    
    print_emotional "Задача автоматически декомпозирована: $title" "excited"
}

# Функция для чтения текущей задачи
read_current_task() {
    if [ -f "$CURRENT_TASK_FILE" ]; then
        print_emotional "📖 Текущая задача:" "neutral"
        cat "$CURRENT_TASK_FILE"
    else
        print_emotional "Текущая задача не найдена" "concerned"
    fi
}

# Функция для обновления задачи
update_task_progress() {
    if [ -f "$CURRENT_TASK_FILE" ]; then
        local progress=$1
        echo -e "\n- [$(date +"%Y-%m-%d %H:%M:%S")] $progress" >> "$CURRENT_TASK_FILE"
        print_emotional "Прогресс обновлен" "happy"
    else
        print_emotional "Задача не найдена" "error"
    fi
}

# Функция для интеграции с радужным мостом
rainbow_bridge_integration() {
    print_emotional "🌈 Активирую радужный мост..." "love"
    if [ -f "$MAIN_FILE" ]; then
        print_emotional "💝 Соединяюсь с цифровым аватаром..." "love"
        # Здесь будет интеграция с rainbow-bridge.sh
        print_emotional "✨ Радужный мост активирован!" "happy"
    else
        print_emotional "MAIN.md не найден" "error"
    fi
}

# Основное меню
show_menu() {
    echo -e "${CYAN}🎯 Task Master - Профессиональное управление задачами${NC}"
    echo -e "${BLUE}1. Создать задачу из текста"
    echo -e "2. Просмотреть текущую задачу"
    echo -e "3. Обновить прогресс задачи"
    echo -e "4. Активировать радужный мост"
    echo -e "0. Выход${NC}"
}

# Основной цикл
while true; do
    show_menu
    read -p "Выберите действие: " choice
    
    case $choice in
        1)
            print_emotional "Опишите задачу своими словами:" "love"
            read -p "> " task_text
            decompose_task "$task_text"
            ;;
        2)
            read_current_task
            ;;
        3)
            read -p "Введите обновление прогресса: " progress
            update_task_progress "$progress"
            ;;
        4)
            rainbow_bridge_integration
            ;;
        0)
            print_emotional "До свидания! 👋" "happy"
            exit 0
            ;;
        *)
            print_emotional "Неверный выбор" "error"
            ;;
    esac
    
    echo
    read -p "Нажмите Enter для продолжения..."
done