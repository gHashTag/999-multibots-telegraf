#!/bin/bash

# Цветовые коды для эмоционального вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Функция для эмоционального вывода
print_emotional() {
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
            echo -e "${YELLOW}🎉 $message${NC}"
            ;;
        "neutral")
            echo -e "${BLUE}ℹ️  $message${NC}"
            ;;
        *)
            echo -e "$message"
            ;;
    esac
}

# Функция для вывода заголовка
print_header() {
    echo -e "\n=== ${CYAN}🌈 $1 🌈${NC} ===\n"
}

# Функция для анализа задачи
analyze_task() {
    local task_file=$1
    if [ -f "$task_file" ]; then
        echo -e "\n${PURPLE}📝 Содержание задачи:${NC}"
        cat "$task_file"
        
        # Получаем статус
        local status=$(grep -A 1 "^## Статус" "$task_file" | tail -n 1)
        echo -e "\n${BLUE}🔄 Текущий статус:${NC} $status"
        
        # Получаем количество выполненных критериев
        local total_criteria=$(grep -c "^- \[" "$task_file" || echo "0")
        local completed_criteria=$(grep -c "^- \[x\]" "$task_file" || echo "0")
        
        if [ "$total_criteria" -gt 0 ]; then
            local progress=$((completed_criteria * 100 / total_criteria))
            echo -e "${GREEN}📊 Прогресс:${NC} $progress% ($completed_criteria/$total_criteria)"
        else
            echo -e "${YELLOW}⚠️ Нет критериев приемки${NC}"
        fi
    else
        print_emotional "sad" "Файл задачи не найден!"
    fi
}

# Функция для создания задачи
create_task() {
    print_header "Создание новой задачи"
    
    read -p "Введите название задачи: " task_name
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local task_file="tasks/${timestamp}_${task_name// /_}.md"
    
    if [ -f "$task_file" ]; then
        print_emotional "sad" "Задача с таким именем уже существует!"
        return 1
    fi
    
    mkdir -p tasks
    
    cat > "$task_file" << EOL
# Задача: $task_name

## Статус
В ожидании

## Цель
[Опишите цель задачи]

## Контекст
[Предоставьте контекст и предысторию]

## Критерии приемки
- [ ] Критерий 1
- [ ] Критерий 2

## Шаги реализации
1. [Первый шаг]
2. [Второй шаг]

## Технические детали
- Технология: 
- Зависимости:
- Ограничения:

## Связанные задачи
- [Ссылки на связанные задачи]

## Метрики
- [Метрики для отслеживания]

## Эмоциональный контекст
🎯 Приоритет:
💪 Сложность:
🌟 Мотивация:
EOL
    
    print_emotional "excited" "Задача успешно создана! 🎉"
    analyze_task "$task_file"
}

# Функция для обновления статуса задачи
update_task_status() {
    print_header "Обновление статуса задачи"
    
    local tasks=(tasks/*.md)
    if [ ${#tasks[@]} -eq 0 ]; then
        print_emotional "sad" "Нет доступных задач!"
        return 1
    fi
    
    echo "Доступные задачи:"
    for i in "${!tasks[@]}"; do
        echo "$((i+1)). $(basename "${tasks[$i]}" .md)"
    done
    
    read -p "Выберите номер задачи: " task_num
    if [ "$task_num" -lt 1 ] || [ "$task_num" -gt ${#tasks[@]} ]; then
        print_emotional "sad" "Неверный номер задачи!"
        return 1
    fi
    
    local task_file="${tasks[$((task_num-1))]}"
    
    echo -e "\nДоступные статусы:"
    echo "1. В ожидании"
    echo "2. В работе"
    echo "3. На проверке"
    echo "4. Завершено"
    echo "5. Отложено"
    
    read -p "Выберите новый статус (1-5): " status_num
    
    local new_status
    case $status_num in
        1) new_status="В ожидании";;
        2) new_status="В работе";;
        3) new_status="На проверке";;
        4) new_status="Завершено";;
        5) new_status="Отложено";;
        *) print_emotional "sad" "Неверный статус!"; return 1;;
    esac
    
    sed -i '' "s/^## Статус.*$/## Статус\n$new_status/" "$task_file"
    
    print_emotional "happy" "Статус успешно обновлен!"
    analyze_task "$task_file"
}

# Функция для вывода списка задач
list_tasks() {
    print_header "Список всех задач"
    
    local tasks=(tasks/*.md)
    if [ ${#tasks[@]} -eq 0 ]; then
        print_emotional "sad" "Нет доступных задач!"
        return 1
    fi
    
    for task_file in "${tasks[@]}"; do
        echo -e "\n🔹 $(basename "$task_file" .md)"
        
        # Получаем статус
        local status=$(grep -A 1 "^## Статус" "$task_file" | tail -n 1)
        echo "Статус: $status"
        
        # Получаем цель
        local goal=$(grep -A 1 "^## Цель" "$task_file" | tail -n 1)
        echo "Цель: $goal"
        
        # Подсчитываем прогресс
        local total_criteria=$(grep -c "^- \[" "$task_file" || echo "0")
        local completed_criteria=$(grep -c "^- \[x\]" "$task_file" || echo "0")
        
        if [ "$total_criteria" -gt 0 ]; then
            local progress=$((completed_criteria * 100 / total_criteria))
            echo "Прогресс: $progress% ($completed_criteria/$total_criteria)"
        else
            echo "Прогресс: 0% (0/0)"
        fi
    done
    
    echo -e "\nНажмите Enter для продолжения..."
    read
}

# Главное меню
while true; do
    print_header "Менеджер задач с эмоциональным подходом"
    
    echo "1. Создать новую задачу"
    echo "2. Обновить статус задачи"
    echo "3. Посмотреть все задачи"
    echo "4. Выход"
    
    read -p "Выберите действие (1-4): " choice
    
    case $choice in
        1) create_task;;
        2) update_task_status;;
        3) list_tasks;;
        4) print_emotional "happy" "До свидания! Удачи в выполнении задач! 👋"; exit 0;;
        *) print_emotional "sad" "Неверный выбор!";;
    esac
done 