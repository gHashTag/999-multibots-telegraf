#!/bin/bash

# 🎯 Task Guardian - Система управления задачами с эмоциональной обратной связью

# Цветовые коды для эмоционального вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Директории для хранения задач
TASKS_DIR="src/core/mcp/agent/memory-bank/NeuroBlogger/tasks"
ACTIVE_TASKS="$TASKS_DIR/active"
COMPLETED_TASKS="$TASKS_DIR/completed"
ARCHIVED_TASKS="$TASKS_DIR/archived"

# Создаем необходимые директории
mkdir -p "$ACTIVE_TASKS" "$COMPLETED_TASKS" "$ARCHIVED_TASKS"

# Путь к ROADMAP.md
ROADMAP_PATH="src/core/mcp/agent/memory-bank/NeuroBlogger/ROADMAP.md"

# Функция для отображения эмоционального приветствия
show_greeting() {
    echo -e "${BLUE}🤖 Привет! Я твой Task Guardian - помощник в управлении задачами!${NC}"
    echo -e "${BLUE}Я помогу тебе организовать и отслеживать задачи в проекте.${NC}"
    echo
}

# Функция для отображения текущего статуса
show_status() {
    echo -e "📊 Текущий статус системы:\n"
    sed -n '/## Метрики/,/##/p' "$ROADMAP_PATH" | grep -E "^- " | head -n -1
    echo -e "\n"
}

# Функция для отображения текущих задач
show_tasks() {
    echo -e "🚀 Текущие задачи:\n"
    sed -n '/## Текущая работа/,/##/p' "$ROADMAP_PATH" | grep -E "^- " | head -n -1
    echo -e "\n"
}

# Функция для добавления новой задачи
add_task() {
    echo -e "➕ Добавление новой задачи\n"
    read -p "Введите описание задачи: " task_description
    
    # Добавляем задачу в раздел текущей работы
    sed -i '' "/## Текущая работа/a\\
- $task_description" "$ROADMAP_PATH"
    
    echo -e "${GREEN}✅ Задача успешно добавлена!${NC}\n"
}

# Функция для завершения задачи
complete_task() {
    echo -e "✅ Завершение задачи\n"
    echo "Текущие задачи:"
    show_tasks
    read -p "Введите номер задачи для завершения: " task_number
    
    # Получаем задачу и перемещаем её в раздел выполненных
    task=$(sed -n "/## Текущая работа/,/##/p" "$ROADMAP_PATH" | grep -E "^- " | sed -n "${task_number}p")
    if [ ! -z "$task" ]; then
        # Удаляем задачу из текущих
        sed -i '' "/## Текущая работа/,/##/{/$task/d;}" "$ROADMAP_PATH"
        # Добавляем в выполненные
        sed -i '' "/## Выполненные задачи/a\\
$task" "$ROADMAP_PATH"
        echo -e "${GREEN}✅ Задача успешно завершена!${NC}\n"
    else
        echo -e "${RED}❌ Задача с таким номером не найдена${NC}\n"
    fi
}

# Функция для анализа задач
analyze_tasks() {
    echo -e "🔍 Анализ задач\n"
    total=$(sed -n '/## Текущая работа/,/##/p' "$ROADMAP_PATH" | grep -E "^- " | wc -l)
    completed=$(sed -n '/## Выполненные задачи/,/##/p' "$ROADMAP_PATH" | grep -E "^- " | wc -l)
    
    echo "📊 Статистика задач:"
    echo "- Всего текущих задач: $total"
    echo "- Выполнено задач: $completed"
    echo -e "\n"
}

# Основное меню
main_menu() {
    while true; do
        echo "=== 🤖 Task Guardian - Меню ==="
        echo "1. 📊 Показать текущий статус"
        echo "2. 🚀 Показать текущие задачи"
        echo "3. ➕ Добавить новую задачу"
        echo "4. ✅ Завершить задачу"
        echo "5. 🔍 Анализ задач"
        echo "6. 🚪 Выход"
        echo ""
        read -p "Выберите действие (1-6): " choice
        echo ""
        
        case $choice in
            1) show_status ;;
            2) show_tasks ;;
            3) add_task ;;
            4) complete_task ;;
            5) analyze_tasks ;;
            6) 
                echo "👋 До встречи! Продолжай создавать удивительные вещи!"
                exit 0
                ;;
            *) echo -e "${RED}❌ Неверный выбор. Пожалуйста, выберите число от 1 до 6.${NC}\n" ;;
        esac
    done
}

# Запуск программы
clear
show_greeting
main_menu 