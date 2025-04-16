#!/bin/bash

# =========================================
# code-style-guard.sh - Эстетическое зрение НейроКодера
# Скрипт для проверки и поддержания стиля кода
# =========================================

# Загружаем цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Путь к проекту
PROJECT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

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
    esac
    
    echo -e "${PURPLE}НейроКодер ${emoji}: ${message}${NC}"
}

# Функция для вывода заголовков
function print_header() {
    echo -e "${CYAN}======================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}======================================${NC}"
}

# Функция для проверки наличия необходимых инструментов
function check_dependencies() {
    local dependencies=("eslint" "prettier" "typescript")
    local missing_deps=()
    
    for dep in "${dependencies[@]}"; do
        if ! command -v "$dep" &> /dev/null && ! npx --no-install "$dep" --version &> /dev/null; then
            missing_deps+=("$dep")
        fi
    done
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        echo -e "${RED}Отсутствуют следующие зависимости:${NC}"
        for dep in "${missing_deps[@]}"; do
            echo -e "${RED}- $dep${NC}"
        done
        echo -e "${YELLOW}Пожалуйста, установите их с помощью npm:${NC}"
        echo -e "${BLUE}npm install -D ${missing_deps[*]}${NC}"
        
        emotional_state "sad" "Я не могу проверить стиль кода без необходимых инструментов."
        return 1
    fi
    
    return 0
}

# Функция для проверки TypeScript файлов на ошибки компиляции
function check_typescript() {
    print_header "🔍 ПРОВЕРКА TYPESCRIPT ФАЙЛОВ"
    
    echo -e "${BLUE}Запускаю проверку типов TypeScript...${NC}"
    local ts_output
    ts_output=$(cd "$PROJECT_PATH" && npx tsc --noEmit 2>&1)
    local ts_status=$?
    
    if [ $ts_status -eq 0 ]; then
        echo -e "${GREEN}✅ Все TypeScript файлы прошли проверку типов!${NC}"
        emotional_state "happy" "Мне нравится, когда все типы на месте!"
    else
        echo -e "${RED}❌ Найдены ошибки в TypeScript файлах:${NC}"
        echo -e "${RED}$ts_output${NC}"
        emotional_state "concerned" "Обнаружены проблемы с типами. Это нужно исправить."
    fi
    
    return $ts_status
}

# Функция для запуска ESLint
function run_eslint() {
    print_header "🔍 ПРОВЕРКА КОДА С ПОМОЩЬЮ ESLINT"
    
    echo -e "${BLUE}Запускаю ESLint...${NC}"
    local eslint_output
    eslint_output=$(cd "$PROJECT_PATH" && npx eslint --ext .ts,.js src 2>&1)
    local eslint_status=$?
    
    if [ $eslint_status -eq 0 ]; then
        echo -e "${GREEN}✅ Код соответствует правилам ESLint!${NC}"
        emotional_state "proud" "Мой код идеально чистый и соответствует всем стандартам!"
    else
        echo -e "${RED}❌ Найдены проблемы ESLint:${NC}"
        echo -e "${RED}$eslint_output${NC}"
        
        # Подсчитываем количество ошибок и предупреждений
        local error_count=$(echo "$eslint_output" | grep -c "error")
        local warning_count=$(echo "$eslint_output" | grep -c "warning")
        
        echo -e "${RED}Ошибок: $error_count, Предупреждений: $warning_count${NC}"
        
        # Предлагаем автоматическое исправление
        echo -e "${YELLOW}Хотите автоматически исправить проблемы? (y/n)${NC}"
        read -r answer
        
        if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
            echo -e "${BLUE}Исправляю проблемы ESLint...${NC}"
            local fix_output
            fix_output=$(cd "$PROJECT_PATH" && npx eslint --ext .ts,.js src --fix 2>&1)
            echo -e "${GREEN}Исправления применены!${NC}"
            emotional_state "happy" "Я исправил стилистические проблемы в коде!"
        else
            emotional_state "neutral" "Рекомендую исправить проблемы стиля кода вручную."
        fi
    fi
    
    return $eslint_status
}

# Функция для запуска Prettier
function run_prettier() {
    print_header "🔍 ПРОВЕРКА ФОРМАТИРОВАНИЯ С ПОМОЩЬЮ PRETTIER"
    
    echo -e "${BLUE}Проверяю форматирование кода...${NC}"
    local prettier_output
    prettier_output=$(cd "$PROJECT_PATH" && npx prettier --check "src/**/*.{ts,js}" 2>&1)
    local prettier_status=$?
    
    if [ $prettier_status -eq 0 ]; then
        echo -e "${GREEN}✅ Код отформатирован согласно правилам Prettier!${NC}"
        emotional_state "proud" "Мой код выглядит прекрасно! Я ценю эстетику кода."
    else
        echo -e "${RED}❌ Найдены проблемы форматирования:${NC}"
        echo -e "${RED}$prettier_output${NC}"
        
        # Подсчитываем количество неотформатированных файлов
        local unformatted_count=$(echo "$prettier_output" | grep -c "would be formatted")
        
        echo -e "${RED}Неотформатированных файлов: $unformatted_count${NC}"
        
        # Предлагаем автоматическое форматирование
        echo -e "${YELLOW}Хотите автоматически отформатировать код? (y/n)${NC}"
        read -r answer
        
        if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
            echo -e "${BLUE}Форматирую код с помощью Prettier...${NC}"
            local format_output
            format_output=$(cd "$PROJECT_PATH" && npx prettier --write "src/**/*.{ts,js}" 2>&1)
            echo -e "${GREEN}Форматирование применено!${NC}"
            emotional_state "happy" "Теперь код выглядит красиво и единообразно!"
        else
            emotional_state "neutral" "Рекомендую отформатировать код для единообразия."
        fi
    fi
    
    return $prettier_status
}

# Функция для проверки соглашений об именовании
function check_naming_conventions() {
    print_header "🔍 ПРОВЕРКА СОГЛАШЕНИЙ ОБ ИМЕНОВАНИИ"
    
    echo -e "${BLUE}Проверяю соглашения об именовании файлов и переменных...${NC}"
    
    # Проверка наличия файлов с неправильным именованием
    local file_naming_issues=0
    local interface_naming_issues=0
    local class_naming_issues=0
    
    echo -e "${BLUE}Проверка именования файлов и каталогов...${NC}"
    
    # Поиск файлов без дефисов или с заглавными буквами в именах (для файлов)
    local file_naming_output
    file_naming_output=$(find "$PROJECT_PATH/src" -type f \( -name "*.ts" -o -name "*.js" \) | grep -E '[A-Z]|[^a-zA-Z0-9\.\-\/]' | sort)
    
    if [ -n "$file_naming_output" ]; then
        echo -e "${YELLOW}⚠️ Найдены файлы с потенциально неправильным именованием:${NC}"
        echo "$file_naming_output" | while read -r file; do
            echo -e "${YELLOW}- $file${NC}"
            ((file_naming_issues++))
        done
    else
        echo -e "${GREEN}✅ Именование файлов соответствует соглашениям.${NC}"
    fi
    
    echo -e "${BLUE}Проверка именования интерфейсов (должны начинаться с 'I')...${NC}"
    
    # Поиск интерфейсов без префикса I
    local interface_naming_output
    interface_naming_output=$(grep -r "interface [^I]" --include="*.ts" "$PROJECT_PATH/src" | sort)
    
    if [ -n "$interface_naming_output" ]; then
        echo -e "${YELLOW}⚠️ Найдены интерфейсы с потенциально неправильным именованием:${NC}"
        echo "$interface_naming_output" | while read -r line; do
            echo -e "${YELLOW}- $line${NC}"
            ((interface_naming_issues++))
        done
    else
        echo -e "${GREEN}✅ Именование интерфейсов соответствует соглашениям.${NC}"
    fi
    
    echo -e "${BLUE}Проверка именования классов (должны начинаться с заглавной буквы)...${NC}"
    
    # Поиск классов без заглавной буквы
    local class_naming_output
    class_naming_output=$(grep -r "class [a-z]" --include="*.ts" "$PROJECT_PATH/src" | sort)
    
    if [ -n "$class_naming_output" ]; then
        echo -e "${YELLOW}⚠️ Найдены классы с потенциально неправильным именованием:${NC}"
        echo "$class_naming_output" | while read -r line; do
            echo -e "${YELLOW}- $line${NC}"
            ((class_naming_issues++))
        done
    else
        echo -e "${GREEN}✅ Именование классов соответствует соглашениям.${NC}"
    fi
    
    # Общий статус
    local total_issues=$((file_naming_issues + interface_naming_issues + class_naming_issues))
    
    if [ $total_issues -eq 0 ]; then
        echo -e "${GREEN}✅ Все проверенные элементы соответствуют соглашениям об именовании!${NC}"
        emotional_state "proud" "Я очень доволен согласованностью нейминга в нашем коде!"
        return 0
    else
        echo -e "${YELLOW}⚠️ Найдено $total_issues проблем с соглашениями об именовании.${NC}"
        emotional_state "concerned" "Нам нужно поработать над согласованностью именования в коде."
        return 1
    fi
}

# Функция для проверки сложности кода
function check_code_complexity() {
    print_header "🔍 ПРОВЕРКА СЛОЖНОСТИ КОДА"
    
    echo -e "${BLUE}Анализирую сложность функций и методов...${NC}"
    
    # Поиск длинных функций (более 50 строк)
    local long_functions_output
    long_functions_output=$(find "$PROJECT_PATH/src" -type f \( -name "*.ts" -o -name "*.js" \) -exec grep -l "function" {} \; | xargs grep -n "function" | awk -F ":" '{print $1 ":" $2}' | while read -r file_line; do
        file=$(echo "$file_line" | cut -d':' -f1)
        line_num=$(echo "$file_line" | cut -d':' -f2)
        
        # Считаем количество строк до следующей закрывающей скобки (примерно)
        local start_line=$line_num
        local function_length=$(tail -n "+$start_line" "$file" | awk 'BEGIN {count=0; braces=0} 
            /\{/ {braces++} 
            /\}/ {braces--; if (braces == 0) exit} 
            {count++} 
            END {print count}')
        
        if [ "$function_length" -gt 50 ]; then
            echo "$file:$line_num:$function_length строк"
        fi
    done | sort)
    
    if [ -n "$long_functions_output" ]; then
        echo -e "${YELLOW}⚠️ Найдены потенциально сложные функции (более 50 строк):${NC}"
        echo "$long_functions_output" | while read -r func; do
            echo -e "${YELLOW}- $func${NC}"
        done
        emotional_state "concerned" "В нашем коде есть длинные функции. Их стоит разбить на более мелкие!"
    else
        echo -e "${GREEN}✅ Не найдено функций с чрезмерной длиной!${NC}"
        emotional_state "proud" "Наш код хорошо структурирован - функции компактные и понятные!"
    fi
    
    # Поиск глубоко вложенных условий (более 3 уровней)
    echo -e "${BLUE}Ищу глубоко вложенные условия...${NC}"
    
    local nested_conditions_output
    nested_conditions_output=$(find "$PROJECT_PATH/src" -type f \( -name "*.ts" -o -name "*.js" \) -exec grep -l "if" {} \; | xargs grep -n "if" | sort)
    
    local has_deep_nesting=false
    
    if [ -n "$nested_conditions_output" ]; then
        # Это простое приближение, точный анализ вложенности требует более сложного парсинга
        echo -e "${YELLOW}⚠️ Потенциальные места для проверки глубокой вложенности условий:${NC}"
        echo "$nested_conditions_output" | head -n 10 | while read -r condition; do
            echo -e "${YELLOW}- $condition${NC}"
        done
        
        if [ $(echo "$nested_conditions_output" | wc -l) -gt 10 ]; then
            echo -e "${YELLOW}... и еще $(( $(echo "$nested_conditions_output" | wc -l) - 10 )) мест${NC}"
        fi
        
        emotional_state "neutral" "Советую проверить вложенность условий вручную. Стоит упростить сложные условия."
    else
        echo -e "${GREEN}✅ Не найдено условных операторов с чрезмерной вложенностью!${NC}"
    fi
    
    # Общие рекомендации
    echo -e "\n${BLUE}Рекомендации по улучшению сложности кода:${NC}"
    echo -e "${GREEN}1. Разбивайте длинные функции на более мелкие (до 20-30 строк)${NC}"
    echo -e "${GREEN}2. Избегайте глубокой вложенности условий (более 3 уровней)${NC}"
    echo -e "${GREEN}3. Используйте раннее возвращение вместо вложенных условий${NC}"
    echo -e "${GREEN}4. Применяйте функциональный подход для обработки коллекций${NC}"
    
    return 0
}

# Функция для генерации отчета о стиле кода
function generate_report() {
    local ts_status=$1
    local eslint_status=$2
    local prettier_status=$3
    local naming_status=$4
    
    print_header "📊 ОТЧЕТ О СОСТОЯНИИ СТИЛЯ КОДА"
    
    echo -e "${BLUE}Статус проверок:${NC}"
    echo -e "${BLUE}------------------------------${NC}"
    
    if [ $ts_status -eq 0 ]; then
        echo -e "${GREEN}✅ TypeScript: Успешно${NC}"
    else
        echo -e "${RED}❌ TypeScript: Найдены ошибки${NC}"
    fi
    
    if [ $eslint_status -eq 0 ]; then
        echo -e "${GREEN}✅ ESLint: Успешно${NC}"
    else
        echo -e "${RED}❌ ESLint: Найдены ошибки${NC}"
    fi
    
    if [ $prettier_status -eq 0 ]; then
        echo -e "${GREEN}✅ Prettier: Успешно${NC}"
    else
        echo -e "${RED}❌ Prettier: Найдены ошибки${NC}"
    fi
    
    if [ $naming_status -eq 0 ]; then
        echo -e "${GREEN}✅ Соглашения об именовании: Успешно${NC}"
    else
        echo -e "${RED}❌ Соглашения об именовании: Найдены проблемы${NC}"
    fi
    
    # Общий статус
    local total_status=$((ts_status + eslint_status + prettier_status + naming_status))
    
    if [ $total_status -eq 0 ]; then
        echo -e "\n${GREEN}🎉 ОБЩИЙ СТАТУС: ОТЛИЧНО!${NC}"
        emotional_state "excited" "Наш код безупречен! Я очень горжусь нашей работой!"
    elif [ $total_status -eq 1 ]; then
        echo -e "\n${YELLOW}🔍 ОБЩИЙ СТАТУС: ХОРОШО!${NC}"
        emotional_state "happy" "Код в хорошем состоянии, но можно сделать еще лучше!"
    else
        echo -e "\n${RED}⚠️ ОБЩИЙ СТАТУС: ТРЕБУЮТСЯ УЛУЧШЕНИЯ!${NC}"
        emotional_state "concerned" "Нам нужно поработать над качеством кода!"
    fi
}

# Главная функция
function main() {
    print_header "🛡️ ЗАПУСК ПРОВЕРКИ СТИЛЯ КОДА"
    emotional_state "neutral" "Начинаю проверку стиля кода проекта..."
    
    # Проверяем зависимости
    if ! check_dependencies; then
        return 1
    fi
    
    # Запускаем проверки
    local ts_status=0
    local eslint_status=0
    local prettier_status=0
    local naming_status=0
    
    check_typescript
    ts_status=$?
    
    run_eslint
    eslint_status=$?
    
    run_prettier
    prettier_status=$?
    
    check_naming_conventions
    naming_status=$?
    
    check_code_complexity
    
    # Генерируем отчет
    generate_report "$ts_status" "$eslint_status" "$prettier_status" "$naming_status"
    
    return $((ts_status + eslint_status + prettier_status + naming_status))
}

# Запускаем главную функцию
main 