#!/bin/bash

# 🎨 Цвета для эмоционального вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
PINK='\033[1;35m'
ORANGE='\033[0;33m'
NC='\033[0m'

# 📁 Пути
PROJECT_ROOT="/Users/playra/999-multibots-telegraf"
MEMORY_BANK_DIR="$PROJECT_ROOT/src/core/mcp/agent/memory-bank/NeuroBlogger"
CURRENT_TASKS_DIR="$MEMORY_BANK_DIR/current_tasks"
COMPLETED_TASKS_DIR="$MEMORY_BANK_DIR/completed_tasks"
TASKS_HISTORY_FILE="$MEMORY_BANK_DIR/tasks_history.md"
METRICS_FILE="$MEMORY_BANK_DIR/metrics/task_metrics.json"
EMOTIONS_FILE="$MEMORY_BANK_DIR/emotions/current_state.json"

# 🎭 Расширенная функция эмоционального вывода
emotional_echo() {
    local emotion=$1
    local message=$2
    local timestamp=$(date '+%H:%M:%S')
    
    case $emotion in
        "happy") 
            echo -e "${GREEN}😊 [$timestamp] $message${NC}"
            update_emotional_state "happy" 5
            ;;
        "sad") 
            echo -e "${RED}😢 [$timestamp] $message${NC}"
            update_emotional_state "sad" -3
            ;;
        "excited") 
            echo -e "${BLUE}🎉 [$timestamp] $message${NC}"
            update_emotional_state "excited" 7
            ;;
        "working") 
            echo -e "${YELLOW}⚡ [$timestamp] $message${NC}"
            update_emotional_state "focused" 4
            ;;
        "thinking") 
            echo -e "${PURPLE}🤔 [$timestamp] $message${NC}"
            update_emotional_state "analytical" 3
            ;;
        "done") 
            echo -e "${CYAN}✨ [$timestamp] $message${NC}"
            update_emotional_state "accomplished" 6
            ;;
        "love")
            echo -e "${PINK}💝 [$timestamp] $message${NC}"
            update_emotional_state "love" 8
            ;;
        "warning")
            echo -e "${ORANGE}⚠️ [$timestamp] $message${NC}"
            update_emotional_state "concerned" -2
            ;;
    esac
}

# 📊 Обновление метрик
update_metrics() {
    local action=$1
    local value=$2
    
    mkdir -p "$(dirname "$METRICS_FILE")"
    
    # Создаем файл метрик, если он не существует
    if [ ! -f "$METRICS_FILE" ]; then
        cat > "$METRICS_FILE" << EOF
{
    "tasks_completed": 0,
    "tasks_in_progress": 0,
    "total_time_spent": 0,
    "average_completion_time": 0,
    "emotional_balance": 100,
    "productivity_score": 0,
    "last_update": "$(date '+%Y-%m-%d %H:%M:%S')"
}
EOF
    fi
    
    # Обновляем метрики
    case $action in
        "task_started")
            local current_count=$(jq '.tasks_in_progress' "$METRICS_FILE")
            jq ".tasks_in_progress = $((current_count + 1))" "$METRICS_FILE" > temp.json && mv temp.json "$METRICS_FILE"
            ;;
        "task_completed")
            local completed_count=$(jq '.tasks_completed' "$METRICS_FILE")
            local in_progress_count=$(jq '.tasks_in_progress' "$METRICS_FILE")
            jq ".tasks_completed = $((completed_count + 1)) | .tasks_in_progress = $((in_progress_count - 1))" "$METRICS_FILE" > temp.json && mv temp.json "$METRICS_FILE"
            ;;
        "emotional_update")
            jq ".emotional_balance = .emotional_balance + $value" "$METRICS_FILE" > temp.json && mv temp.json "$METRICS_FILE"
            ;;
    esac
    
    # Обновляем время последнего обновления
    jq ".last_update = \"$(date '+%Y-%m-%d %H:%M:%S')\"" "$METRICS_FILE" > temp.json && mv temp.json "$METRICS_FILE"
}

# 💭 Обновление эмоционального состояния
update_emotional_state() {
    local emotion=$1
    local intensity=$2
    
    mkdir -p "$(dirname "$EMOTIONS_FILE")"
    
    # Создаем файл эмоций, если он не существует
    if [ ! -f "$EMOTIONS_FILE" ]; then
        cat > "$EMOTIONS_FILE" << EOF
{
    "current_emotion": "neutral",
    "intensity": 0,
    "emotional_history": [],
    "emotional_balance": 100,
    "last_update": "$(date '+%Y-%m-%d %H:%M:%S')"
}
EOF
    fi
    
    # Обновляем эмоциональное состояние
    jq --arg emotion "$emotion" --arg time "$(date '+%Y-%m-%d %H:%M:%S')" \
       --argjson intensity "$intensity" \
       '.current_emotion = $emotion | .intensity = $intensity | .emotional_history += [{"emotion": $emotion, "intensity": $intensity, "timestamp": $time}]' \
       "$EMOTIONS_FILE" > temp.json && mv temp.json "$EMOTIONS_FILE"
    
    # Обновляем метрики
    update_metrics "emotional_update" "$intensity"
}

# 🔄 Автоматическое обновление статуса
update_task_status() {
    local current_task_file="$CURRENT_TASKS_DIR/current_task.md"
    local status=$1
    local progress=$2
    
    if [ -f "$current_task_file" ]; then
        # Обновляем статус и прогресс
        sed -i '' "s/## 🔄 Статус.*$/## 🔄 Статус\n$status ($progress%)/" "$current_task_file"
        
        # Обновляем чек-лист автоматизации
        case $progress in
            25)
                sed -i '' 's/- \[ \] Анализ кода/- [x] Анализ кода/' "$current_task_file"
                emotional_echo "working" "Анализ кода завершен ✅"
                ;;
            50)
                sed -i '' 's/- \[ \] Применение улучшений/- [x] Применение улучшений/' "$current_task_file"
                emotional_echo "excited" "Улучшения применены ✅"
                ;;
            75)
                sed -i '' 's/- \[ \] Проверка результатов/- [x] Проверка результатов/' "$current_task_file"
                emotional_echo "thinking" "Результаты проверены ✅"
                ;;
            100)
                sed -i '' 's/- \[ \] Обновление документации/- [x] Обновление документации/' "$current_task_file"
                emotional_echo "done" "Документация обновлена ✅"
                ;;
        esac
        
        emotional_echo "happy" "Статус задачи обновлен: $status ($progress%)"
    else
        emotional_echo "sad" "Файл текущей задачи не найден"
    fi
}

# 📝 Обновление текущей задачи
update_current_task() {
    local task_title="$1"
    local current_task_file="$CURRENT_TASKS_DIR/current_task.md"
    local start_time=$(date '+%s')
    
    mkdir -p "$CURRENT_TASKS_DIR"
    
    cat > "$current_task_file" << EOF
# Текущая задача: ${task_title} 🚀

## 📅 Время начала
$(date '+%d.%m.%Y %H:%M')

## 🔄 Статус
В процессе выполнения (0%)

## 🎯 Приоритет
Высокий

## 🤖 Автоматизация
- [ ] Анализ кода
- [ ] Применение улучшений
- [ ] Проверка результатов
- [ ] Обновление документации

## 📊 Метрики
- Время выполнения: 0 минут
- Эмоциональный баланс: 100%
- Производительность: 0%

## 💭 Эмоциональное состояние
$(get_emotional_state)

## 📝 Прогресс
\`\`\`
[░░░░░░░░░░] 0%
\`\`\`
EOF

    update_metrics "task_started" 0
    emotional_echo "excited" "Начата новая задача: $task_title"
}

# 💭 Получение эмоционального состояния
get_emotional_state() {
    if [ -f "$EMOTIONS_FILE" ]; then
        local current_emotion=$(jq -r '.current_emotion' "$EMOTIONS_FILE")
        local intensity=$(jq -r '.intensity' "$EMOTIONS_FILE")
        
        case $current_emotion in
            "happy") echo "Я чувствую радость и энтузиазм! 😊 ($intensity/10)" ;;
            "excited") echo "Я полон энергии и готов к свершениям! 🎉 ($intensity/10)" ;;
            "focused") echo "Я сконцентрирован и продуктивен! 🎯 ($intensity/10)" ;;
            "accomplished") echo "Я горжусь достигнутыми результатами! ✨ ($intensity/10)" ;;
            *) echo "Я готов к продуктивной работе! 🌟" ;;
        esac
    else
        echo "Я готов к продуктивной работе! 🌟"
    fi
}

# 📊 Обновление прогресс-бара
update_progress_bar() {
    local progress=$1
    local width=10
    local filled=$((progress * width / 100))
    local empty=$((width - filled))
    
    printf "["
    printf "█%.0s" $(seq 1 $filled)
    printf "░%.0s" $(seq 1 $empty)
    printf "] %d%%\n" $progress
}

# 📝 Добавление в историю задач
add_to_history() {
    local task_title="$1"
    local timestamp=$(date '+%d.%m.%Y %H:%M')
    
    mkdir -p "$(dirname "$TASKS_HISTORY_FILE")"
    
    echo "- [$timestamp] $task_title" >> "$TASKS_HISTORY_FILE"
    emotional_echo "done" "Задача добавлена в историю"
}

# ✅ Завершение задачи
complete_task() {
    local current_task_file="$CURRENT_TASKS_DIR/current_task.md"
    if [ -f "$current_task_file" ]; then
        local timestamp=$(date '+%Y%m%d_%H%M%S')
        local task_title=$(head -n 1 "$current_task_file" | sed 's/# Текущая задача: \(.*\) 🚀/\1/')
        
        # Обновляем статус на 100%
        update_task_status "Завершено" 100
        
        # Перемещаем в завершенные
        mkdir -p "$COMPLETED_TASKS_DIR"
        mv "$current_task_file" "$COMPLETED_TASKS_DIR/${timestamp}_${task_title// /_}.md"
        
        # Обновляем метрики
        update_metrics "task_completed" 0
        
        # Добавляем в историю
        add_to_history "$task_title ✅"
        
        emotional_echo "love" "Задача успешно завершена! 🎉"
    else
        emotional_echo "sad" "Текущая задача не найдена"
    fi
}

# 📊 Синхронизация с Memory Bank
sync_with_memory_bank() {
    local current_task=$(head -n 1 "$CURRENT_TASKS_DIR/current_task.md" | sed 's/# Текущая задача: \(.*\) 🚀/\1/')
    
    # Обновляем ROADMAP
    local roadmap_file="$MEMORY_BANK_DIR/ROADMAP.md"
    if [ -f "$roadmap_file" ]; then
        sed -i '' '/## 🚀 Текущая работа/a\
- '"$current_task" "$roadmap_file"
        
        emotional_echo "done" "ROADMAP обновлен"
    fi
    
    # Запускаем связанные скрипты
    emotional_echo "working" "Запускаю связанные скрипты..."
    
    # Диагностика
    if [ -f "$PROJECT_ROOT/scripts/ai/diagnosis/self-diagnosis.sh" ]; then
        "$PROJECT_ROOT/scripts/ai/diagnosis/self-diagnosis.sh"
    fi
    
    # Обработка памяти
    if [ -f "$PROJECT_ROOT/scripts/ai/learning/memory-processor.sh" ]; then
        "$PROJECT_ROOT/scripts/ai/learning/memory-processor.sh"
    fi
    
    emotional_echo "done" "Синхронизация с Memory Bank завершена"
}

# 🎯 Основная функция
main() {
    case "$1" in
        "update")
            if [ -z "$2" ]; then
                emotional_echo "sad" "Пожалуйста, укажите название задачи"
                exit 1
            fi
            update_current_task "$2"
            sync_with_memory_bank
            ;;
        "status")
            if [ -z "$2" ] || [ -z "$3" ]; then
                emotional_echo "sad" "Укажите статус и процент выполнения"
                exit 1
            fi
            update_task_status "$2" "$3"
            ;;
        "complete")
            complete_task
            ;;
        *)
            emotional_echo "sad" "Используйте: $0 [update 'название задачи' | status 'статус' процент | complete]"
            exit 1
            ;;
    esac
}

# Запускаем основную функцию
main "$@" 