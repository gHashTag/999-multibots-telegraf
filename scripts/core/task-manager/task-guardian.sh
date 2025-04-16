#!/bin/bash

# =========================================
# task-guardian.sh - Хранитель задач НейроКодера
# Скрипт для управления задачами и обновления дорожной карты
# =========================================

# Загружаем цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# Путь к проекту
PROJECT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ROADMAP_FILE="${PROJECT_PATH}/src/core/mcp/agent/memory-bank/NeuroBlogger/ROADMAP.md"

# Функция для эмоционального статуса НейроКодера
function emotional_state() {
    local status=$1
    local message=$2
    local emoji=""
    
    case $status in
        "happy") emoji="😊" ;;
        "proud") emoji="😎" ;;
        "concerned") emoji="😟" ;;
        "excited") emoji="🤩" ;;
        "neutral") emoji="😐" ;;
        "sad") emoji="😢" ;;
        "love") emoji="💖" ;;
    esac
    
    echo -e "${PURPLE}НейроКодер ${emoji}: ${message}${NC}"
}

# Функция для вывода заголовков
function print_header() {
    echo -e "${CYAN}======================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}======================================${NC}"
}

# Функция для вывода красивого разделителя
function print_divider() {
    echo -e "${BLUE}--------------------------------------${NC}"
}

# Проверка наличия файла ROADMAP.md
function check_roadmap() {
    if [ ! -f "$ROADMAP_FILE" ]; then
        echo -e "${RED}❌ Файл ROADMAP.md не найден!${NC}"
        
        # Создаем директорию, если не существует
        mkdir -p "$(dirname "$ROADMAP_FILE")"
        
        echo -e "${YELLOW}📝 Создаю новый файл ROADMAP.md...${NC}"
        
        # Создаем шаблон ROADMAP.md
        cat > "$ROADMAP_FILE" << EOF
# 📋 ROADMAP - NeuroBlogger

**Статус:** В активной разработке
**Версия:** 0.1.0
**Дата:** $(date +%d.%m.%Y)
**Прогресс по дорожной карте:** 5%

## ✅ Выполненные задачи
- [ ] Создана базовая структура проекта

## 🔄 Текущая работа
- [ ] Создание системы диагностики
- [ ] Разработка основного функционала

## 📅 Запланированные задачи
- [ ] Расширение функциональности
- [ ] Интеграция с внешними API
- [ ] Улучшение пользовательского интерфейса

## 💸 Технический долг
- [ ] Оптимизация производительности
- [ ] Улучшение кодовой базы

## 📊 Метрики
- **Активные боты:** 0
- **Среднее время ответа:** N/A
- **Нагрузка сервера:** N/A
- **Покрытие кода тестами:** 0%
- **Автоматизация развертывания:** 0%

Прогресс проекта: **5%** (на $(date '+%d %B %Y'))

## 🛠️ Технический стек
- Node.js
- TypeScript
- Telegraf.js
- Supabase
- Docker

## 🔍 Направления развития
- Интеграция с LLM моделями
- Расширение возможностей бота

## 📚 Документация
- Необходимо создать документацию API
- Необходимо создать руководство пользователя

## ⚠️ Риски
- Изменения в API Telegram
- Проблемы безопасности данных

## 🏆 Последние достижения
- Создание базовой инфраструктуры ($(date +%d.%m.%Y))

Последнее обновление: $(date +%d.%m.%Y)
EOF
        
        echo -e "${GREEN}✅ Файл ROADMAP.md создан: $ROADMAP_FILE${NC}"
        emotional_state "happy" "Я создал новую дорожную карту! Теперь мы можем отслеживать наш прогресс."
    else
        echo -e "${GREEN}✅ Файл ROADMAP.md найден: $ROADMAP_FILE${NC}"
        emotional_state "excited" "Отлично! Дорожная карта уже существует. Давайте работать с задачами!"
    fi
}

# Функция для отображения текущих задач
function show_tasks() {
    print_header "📋 ТЕКУЩИЕ ЗАДАЧИ"
    
    if [ ! -f "$ROADMAP_FILE" ]; then
        echo -e "${RED}❌ Файл ROADMAP.md не найден!${NC}"
        return
    fi
    
    echo -e "${YELLOW}Выполненные задачи:${NC}"
    print_divider
    grep -n "^- \[.\]" "$ROADMAP_FILE" | grep "Выполненные задачи" -A 100 | grep "^\([0-9]\+\):- \[.\]" | while read -r line; do
        line_num=$(echo "$line" | cut -d':' -f1)
        task=$(echo "$line" | sed 's/^[0-9]\+:- \[.\] //')
        status=$(echo "$line" | grep -o "\[.\]")
        
        if [ "$status" = "[x]" ]; then
            echo -e "${GREEN}✅ $task${NC}"
        else
            echo -e "${YELLOW}⬜ $task${NC}"
        fi
    done
    
    echo -e "\n${BLUE}Текущая работа:${NC}"
    print_divider
    grep -n "^- \[.\]" "$ROADMAP_FILE" | grep "Текущая работа" -A 100 | grep "^\([0-9]\+\):- \[.\]" | while read -r line; do
        line_num=$(echo "$line" | cut -d':' -f1)
        task=$(echo "$line" | sed 's/^[0-9]\+:- \[.\] //')
        status=$(echo "$line" | grep -o "\[.\]")
        
        if [ "$status" = "[x]" ]; then
            echo -e "${GREEN}✅ $task${NC}"
        else
            echo -e "${BLUE}🔄 $task${NC}"
        fi
    done
    
    echo -e "\n${CYAN}Запланированные задачи:${NC}"
    print_divider
    grep -n "^- \[.\]" "$ROADMAP_FILE" | grep "Запланированные задачи" -A 100 | grep "^\([0-9]\+\):- \[.\]" | while read -r line; do
        line_num=$(echo "$line" | cut -d':' -f1)
        task=$(echo "$line" | sed 's/^[0-9]\+:- \[.\] //')
        status=$(echo "$line" | grep -o "\[.\]")
        
        if [ "$status" = "[x]" ]; then
            echo -e "${GREEN}✅ $task${NC}"
        else
            echo -e "${CYAN}📅 $task${NC}"
        fi
    done
    
    # Подсчет задач и прогресса
    local total=$(grep -c "^- \[.\]" "$ROADMAP_FILE")
    local completed=$(grep -c "^- \[x\]" "$ROADMAP_FILE")
    
    if [ $total -gt 0 ]; then
        local progress=$((completed * 100 / total))
        echo -e "\n${GREEN}Прогресс: $progress% ($completed/$total задач выполнено)${NC}"
        
        if [ $progress -gt 75 ]; then
            emotional_state "excited" "Невероятно! Мы почти завершили все задачи!"
        elif [ $progress -gt 50 ]; then
            emotional_state "proud" "Отличный прогресс! Больше половины пути пройдено!"
        elif [ $progress -gt 25 ]; then
            emotional_state "happy" "Хороший прогресс! Продолжаем в том же духе!"
        else
            emotional_state "neutral" "У нас еще много работы впереди, но мы справимся!"
        fi
    else
        echo -e "\n${YELLOW}Нет задач для отслеживания прогресса${NC}"
        emotional_state "concerned" "Нам нужно добавить задачи в дорожную карту!"
    fi
}

# Функция для добавления новой задачи
function add_task() {
    print_header "➕ ДОБАВЛЕНИЕ НОВОЙ ЗАДАЧИ"
    
    if [ ! -f "$ROADMAP_FILE" ]; then
        echo -e "${RED}❌ Файл ROADMAP.md не найден!${NC}"
        check_roadmap
    fi
    
    echo -e "${YELLOW}Выберите категорию для новой задачи:${NC}"
    echo -e "${GREEN}1. Выполненные задачи${NC}"
    echo -e "${BLUE}2. Текущая работа${NC}"
    echo -e "${CYAN}3. Запланированные задачи${NC}"
    echo -e "${RED}4. Технический долг${NC}"
    
    read -p "Категория (1-4): " category
    
    case $category in
        1) section="Выполненные задачи" ;;
        2) section="Текущая работа" ;;
        3) section="Запланированные задачи" ;;
        4) section="Технический долг" ;;
        *) 
            echo -e "${RED}❌ Неверная категория!${NC}"
            emotional_state "concerned" "Такой категории не существует!"
            return
            ;;
    esac
    
    read -p "Введите описание задачи: " task_description
    
    if [ -z "$task_description" ]; then
        echo -e "${RED}❌ Описание задачи не может быть пустым!${NC}"
        emotional_state "concerned" "Я не могу добавить задачу без описания!"
        return
    fi
    
    # Определяем, завершена ли задача изначально
    echo -e "${YELLOW}Задача уже выполнена? (y/n)${NC}"
    read -p "Ответ: " is_completed
    
    local mark="[ ]"
    if [ "$is_completed" = "y" ] || [ "$is_completed" = "Y" ]; then
        mark="[x]"
    fi
    
    # Создаем временный файл
    local temp_file=$(mktemp)
    
    # Добавляем новую задачу в секцию
    awk -v section="$section" -v task="- $mark $task_description" '
    $0 ~ "^## " section "$" {
        print $0;
        getline;
        print;
        print task;
        next;
    }
    { print $0; }
    ' "$ROADMAP_FILE" > "$temp_file"
    
    # Заменяем оригинальный файл
    mv "$temp_file" "$ROADMAP_FILE"
    
    echo -e "${GREEN}✅ Задача успешно добавлена в раздел '$section'${NC}"
    emotional_state "happy" "Я добавил новую задачу! Нам нужно будет её выполнить!"
    
    # Обновляем дату последнего обновления
    update_last_modified
}

# Функция для изменения статуса задачи
function change_task_status() {
    print_header "🔄 ИЗМЕНЕНИЕ СТАТУСА ЗАДАЧИ"
    
    if [ ! -f "$ROADMAP_FILE" ]; then
        echo -e "${RED}❌ Файл ROADMAP.md не найден!${NC}"
        return
    fi
    
    echo -e "${YELLOW}Все задачи:${NC}"
    print_divider
    
    # Вывод всех задач с номерами
    grep -n "^- \[.\]" "$ROADMAP_FILE" | while read -r line; do
        line_num=$(echo "$line" | cut -d':' -f1)
        task=$(echo "$line" | sed 's/^[0-9]\+:- \[.\] //')
        status=$(echo "$line" | grep -o "\[.\]")
        
        if [ "$status" = "[x]" ]; then
            echo -e "${GREEN}$line_num: ✅ $task${NC}"
        else
            echo -e "${YELLOW}$line_num: ⬜ $task${NC}"
        fi
    done
    
    read -p "Введите номер задачи для изменения статуса: " task_number
    
    if ! [[ "$task_number" =~ ^[0-9]+$ ]] || [ -z "$(sed -n "${task_number}p" "$ROADMAP_FILE" | grep "^- \[.\]")" ]; then
        echo -e "${RED}❌ Неверный номер задачи!${NC}"
        emotional_state "concerned" "Это не похоже на номер задачи!"
        return
    fi
    
    local task_line=$(sed -n "${task_number}p" "$ROADMAP_FILE")
    local current_status=$(echo "$task_line" | grep -o "\[.\]")
    local task_description=$(echo "$task_line" | sed 's/^- \[.\] //')
    
    local new_status=""
    if [ "$current_status" = "[ ]" ]; then
        new_status="[x]"
        echo -e "${GREEN}✅ Отмечаю задачу как выполненную: $task_description${NC}"
        emotional_state "excited" "Ура! Мы выполнили еще одну задачу!"
    else
        new_status="[ ]"
        echo -e "${YELLOW}⬜ Отмечаю задачу как невыполненную: $task_description${NC}"
        emotional_state "neutral" "Эта задача требует дополнительной работы."
    fi
    
    # Создаем временный файл
    local temp_file=$(mktemp)
    
    # Изменяем статус задачи
    awk -v line="$task_number" -v new_status="$new_status" '
    NR == line {
        sub(/\[.\]/, new_status);
    }
    { print $0; }
    ' "$ROADMAP_FILE" > "$temp_file"
    
    # Заменяем оригинальный файл
    mv "$temp_file" "$ROADMAP_FILE"
    
    echo -e "${GREEN}✅ Статус задачи успешно изменен${NC}"
    
    # Обновляем дату последнего обновления
    update_last_modified
    
    # Обновляем достижения, если задача отмечена как выполненная
    if [ "$new_status" = "[x]" ]; then
        add_achievement "$task_description"
    fi
}

# Функция для удаления задачи
function delete_task() {
    print_header "🗑️ УДАЛЕНИЕ ЗАДАЧИ"
    
    if [ ! -f "$ROADMAP_FILE" ]; then
        echo -e "${RED}❌ Файл ROADMAP.md не найден!${NC}"
        return
    fi
    
    echo -e "${YELLOW}Все задачи:${NC}"
    print_divider
    
    # Вывод всех задач с номерами
    grep -n "^- \[.\]" "$ROADMAP_FILE" | while read -r line; do
        line_num=$(echo "$line" | cut -d':' -f1)
        task=$(echo "$line" | sed 's/^[0-9]\+:- \[.\] //')
        status=$(echo "$line" | grep -o "\[.\]")
        
        if [ "$status" = "[x]" ]; then
            echo -e "${GREEN}$line_num: ✅ $task${NC}"
        else
            echo -e "${YELLOW}$line_num: ⬜ $task${NC}"
        fi
    done
    
    read -p "Введите номер задачи для удаления: " task_number
    
    if ! [[ "$task_number" =~ ^[0-9]+$ ]] || [ -z "$(sed -n "${task_number}p" "$ROADMAP_FILE" | grep "^- \[.\]")" ]; then
        echo -e "${RED}❌ Неверный номер задачи!${NC}"
        emotional_state "concerned" "Я не могу найти задачу с таким номером!"
        return
    fi
    
    local task_line=$(sed -n "${task_number}p" "$ROADMAP_FILE")
    local task_description=$(echo "$task_line" | sed 's/^- \[.\] //')
    
    echo -e "${RED}Вы уверены, что хотите удалить задачу:${NC}"
    echo -e "${YELLOW}$task_description${NC}"
    read -p "Подтвердите (y/n): " confirm
    
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        echo -e "${GREEN}✅ Удаление отменено${NC}"
        emotional_state "happy" "Я рад, что мы сохранили эту задачу!"
        return
    fi
    
    # Создаем временный файл
    local temp_file=$(mktemp)
    
    # Удаляем задачу
    awk -v line="$task_number" '
    NR != line {
        print $0;
    }
    ' "$ROADMAP_FILE" > "$temp_file"
    
    # Заменяем оригинальный файл
    mv "$temp_file" "$ROADMAP_FILE"
    
    echo -e "${GREEN}✅ Задача успешно удалена${NC}"
    emotional_state "neutral" "Задача удалена. Надеюсь, это была осознанная необходимость."
    
    # Обновляем дату последнего обновления
    update_last_modified
}

# Функция для добавления достижения
function add_achievement() {
    local achievement=$1
    
    if [ -z "$achievement" ]; then
        print_header "🏆 ДОБАВЛЕНИЕ НОВОГО ДОСТИЖЕНИЯ"
        read -p "Введите описание достижения: " achievement
    fi
    
    if [ -z "$achievement" ]; then
        echo -e "${RED}❌ Описание достижения не может быть пустым!${NC}"
        emotional_state "concerned" "Я не могу добавить пустое достижение!"
        return
    fi
    
    # Создаем временный файл
    local temp_file=$(mktemp)
    
    # Текущая дата
    local current_date=$(date +%d.%m.%Y)
    
    # Добавляем новое достижение в начало списка
    awk -v achievement="- $achievement ($current_date)" '
    /^## 🏆 Последние достижения$/ {
        print $0;
        getline;
        print;
        print achievement;
        next;
    }
    { print $0; }
    ' "$ROADMAP_FILE" > "$temp_file"
    
    # Заменяем оригинальный файл
    mv "$temp_file" "$ROADMAP_FILE"
    
    if [ "$1" = "" ]; then
        echo -e "${GREEN}✅ Достижение успешно добавлено${NC}"
        emotional_state "excited" "Я добавил новое достижение! Это прекрасный повод для гордости!"
    fi
    
    # Обновляем дату последнего обновления
    update_last_modified
}

# Функция для обновления даты последнего изменения
function update_last_modified() {
    # Создаем временный файл
    local temp_file=$(mktemp)
    
    # Текущая дата
    local current_date=$(date +%d.%m.%Y)
    
    # Обновляем дату последнего изменения
    awk -v date="$current_date" '
    /^Последнее обновление:/ {
        print "Последнее обновление: " date;
        next;
    }
    { print $0; }
    ' "$ROADMAP_FILE" > "$temp_file"
    
    # Заменяем оригинальный файл
    mv "$temp_file" "$ROADMAP_FILE"
}

# Функция для расчета и обновления прогресса проекта
function update_progress() {
    if [ ! -f "$ROADMAP_FILE" ]; then
        echo -e "${RED}❌ Файл ROADMAP.md не найден!${NC}"
        return
    fi
    
    # Подсчет задач и прогресса
    local total=$(grep -c "^- \[.\]" "$ROADMAP_FILE")
    local completed=$(grep -c "^- \[x\]" "$ROADMAP_FILE")
    
    if [ $total -gt 0 ]; then
        local progress=$((completed * 100 / total))
        
        # Создаем временный файл
        local temp_file=$(mktemp)
        
        # Обновляем прогресс
        awk -v progress="$progress" '
        /^**Прогресс по дорожной карте:**/ {
            print "**Прогресс по дорожной карте:** " progress "%";
            next;
        }
        { print $0; }
        ' "$ROADMAP_FILE" > "$temp_file"
        
        # Заменяем оригинальный файл
        mv "$temp_file" "$ROADMAP_FILE"
        
        echo -e "${GREEN}✅ Прогресс обновлен: $progress%${NC}"
        
        if [ $progress -gt 75 ]; then
            emotional_state "excited" "Наш проект близок к завершению! Замечательный прогресс!"
        elif [ $progress -gt 50 ]; then
            emotional_state "proud" "Больше половины пути пройдено! Отличная работа!"
        elif [ $progress -gt 25 ]; then
            emotional_state "happy" "Мы хорошо продвигаемся вперед!"
        else
            emotional_state "neutral" "Мы в начале пути, но уже видим прогресс!"
        fi
    else
        echo -e "${YELLOW}⚠️ Нет задач для расчета прогресса${NC}"
        emotional_state "concerned" "Нам нужно добавить задачи, чтобы отслеживать прогресс!"
    fi
    
    # Обновляем дату последнего изменения
    update_last_modified
}

# Функция для отображения меню
function show_menu() {
    print_header "🛡️ ХРАНИТЕЛЬ ЗАДАЧ"
    echo -e "${YELLOW}Выберите действие:${NC}\n"
    echo -e "${BLUE}1.${NC} ${GREEN}Просмотр задач${NC}"
    echo -e "${BLUE}2.${NC} ${GREEN}Добавить задачу${NC}"
    echo -e "${BLUE}3.${NC} ${GREEN}Изменить статус задачи${NC}"
    echo -e "${BLUE}4.${NC} ${GREEN}Удалить задачу${NC}"
    echo -e "${BLUE}5.${NC} ${GREEN}Добавить достижение${NC}"
    echo -e "${BLUE}6.${NC} ${GREEN}Обновить прогресс${NC}"
    echo -e "${BLUE}0.${NC} ${RED}Выход${NC}\n"
    
    read -p "Выберите опцию (0-6): " option
    
    case $option in
        1) clear && show_tasks ;;
        2) clear && add_task ;;
        3) clear && change_task_status ;;
        4) clear && delete_task ;;
        5) clear && add_achievement ;;
        6) clear && update_progress ;;
        0) 
            echo -e "${GREEN}👋 До свидания!${NC}"
            emotional_state "happy" "Было приятно управлять задачами вместе с тобой!"
            exit 0
            ;;
        *)
            clear
            echo -e "${RED}❌ Неверная опция!${NC}"
            emotional_state "concerned" "Этой опции нет в меню!"
            ;;
    esac
}

# Основная функция
function main() {
    print_header "🛡️ ХРАНИТЕЛЬ ЗАДАЧ НЕЙРОКОДЕРА"
    emotional_state "excited" "Я готов помочь управлять задачами проекта!"
    
    mkdir -p "$(dirname "$ROADMAP_FILE")"
    
    # Проверяем наличие файла ROADMAP.md
    check_roadmap
    
    # Основной цикл
    while true; do
        show_menu
        echo
        read -p "Нажмите Enter для продолжения..." continue
        clear
    done
}

# Запускаем основную функцию
main 