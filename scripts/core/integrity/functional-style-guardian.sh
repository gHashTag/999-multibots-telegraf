#!/bin/bash

# =========================================
# functional-style-guardian.sh - Функциональное зрение НейроКодера
# Скрипт для проверки и поддержания функционального стиля кода
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

# Функция для проверки наличия функционального подхода в коде
function check_functional_approach() {
    print_header "🔍 ПРОВЕРКА ФУНКЦИОНАЛЬНОГО ПОДХОДА"
    
    echo -e "${BLUE}Проверяю использование функциональных методов...${NC}"
    
    # Поиск использования map, filter, reduce, forEach
    local functional_methods=("map" "filter" "reduce" "forEach" "some" "every" "find" "flatMap")
    local total_functional_usage=0
    local methods_usage=()
    
    for method in "${functional_methods[@]}"; do
        local count=$(grep -r "\.${method}(" --include="*.ts" --include="*.js" "$PROJECT_PATH/src" | wc -l)
        total_functional_usage=$((total_functional_usage + count))
        methods_usage+=("$method: $count")
    done
    
    echo -e "${BLUE}Итоги использования функциональных методов:${NC}"
    for usage in "${methods_usage[@]}"; do
        local method=$(echo "$usage" | cut -d':' -f1)
        local count=$(echo "$usage" | cut -d':' -f2 | xargs)
        
        if [ "$count" -gt 10 ]; then
            echo -e "${GREEN}✅ $method: $count раз${NC}"
        elif [ "$count" -gt 0 ]; then
            echo -e "${YELLOW}⚠️ $method: $count раз${NC}"
        else
            echo -e "${RED}❌ $method: не используется${NC}"
        fi
    done
    
    if [ $total_functional_usage -gt 50 ]; then
        echo -e "${GREEN}✅ Отличное использование функционального подхода! ($total_functional_usage вызовов)${NC}"
        emotional_state "love" "Я обожаю функциональное программирование! Это делает код таким элегантным!"
    elif [ $total_functional_usage -gt 20 ]; then
        echo -e "${YELLOW}⚠️ Хорошее начало в использовании функционального подхода. ($total_functional_usage вызовов)${NC}"
        emotional_state "happy" "Мне нравится, что мы используем функциональный подход, но можно еще больше!"
    else
        echo -e "${RED}❌ Недостаточное использование функционального подхода. ($total_functional_usage вызовов)${NC}"
        emotional_state "concerned" "Мы почти не используем функциональный подход. Необходимо улучшить!"
    fi
    
    return 0
}

# Функция для проверки избегания мутаций
function check_immutability() {
    print_header "🔍 ПРОВЕРКА ИММУТАБЕЛЬНОСТИ"
    
    echo -e "${BLUE}Проверяю использование иммутабельного подхода...${NC}"
    
    # Поиск мутирующих операций
    local mutable_operations=("push" "pop" "shift" "unshift" "splice" "sort" "reverse")
    local total_mutable_usage=0
    local operations_usage=()
    
    for operation in "${mutable_operations[@]}"; do
        local count=$(grep -r "\.${operation}(" --include="*.ts" --include="*.js" "$PROJECT_PATH/src" | wc -l)
        total_mutable_usage=$((total_mutable_usage + count))
        operations_usage+=("$operation: $count")
    done
    
    # Поиск использования const
    local const_count=$(grep -r "const " --include="*.ts" --include="*.js" "$PROJECT_PATH/src" | wc -l)
    local let_count=$(grep -r "let " --include="*.ts" --include="*.js" "$PROJECT_PATH/src" | wc -l)
    local var_count=$(grep -r "var " --include="*.ts" --include="*.js" "$PROJECT_PATH/src" | wc -l)
    
    local const_percentage=0
    local total_declarations=$((const_count + let_count + var_count))
    
    if [ $total_declarations -gt 0 ]; then
        const_percentage=$((const_count * 100 / total_declarations))
    fi
    
    echo -e "${BLUE}Итоги использования мутирующих операций:${NC}"
    for usage in "${operations_usage[@]}"; do
        local operation=$(echo "$usage" | cut -d':' -f1)
        local count=$(echo "$usage" | cut -d':' -f2 | xargs)
        
        if [ "$count" -eq 0 ]; then
            echo -e "${GREEN}✅ $operation: не используется${NC}"
        elif [ "$count" -lt 5 ]; then
            echo -e "${YELLOW}⚠️ $operation: $count раз${NC}"
        else
            echo -e "${RED}❌ $operation: $count раз${NC}"
        fi
    done
    
    echo -e "\n${BLUE}Итоги использования объявлений переменных:${NC}"
    echo -e "${GREEN}const: $const_count раз ($const_percentage%)${NC}"
    echo -e "${YELLOW}let: $let_count раз${NC}"
    
    if [ $var_count -gt 0 ]; then
        echo -e "${RED}var: $var_count раз${NC}"
        emotional_state "concerned" "Мы все еще используем 'var'. Это устаревший подход, лучше использовать 'const' и 'let'."
    else
        echo -e "${GREEN}var: $var_count раз${NC}"
    fi
    
    if [ $const_percentage -gt 70 ]; then
        echo -e "${GREEN}✅ Отличный уровень иммутабельности! ($const_percentage% const)${NC}"
        emotional_state "proud" "Мы активно используем const. Это делает код более предсказуемым!"
    elif [ $const_percentage -gt 50 ]; then
        echo -e "${YELLOW}⚠️ Хороший уровень иммутабельности, но есть куда расти. ($const_percentage% const)${NC}"
        emotional_state "happy" "Мы на правильном пути, но давайте еще больше использовать const!"
    else
        echo -e "${RED}❌ Недостаточный уровень иммутабельности. ($const_percentage% const)${NC}"
        emotional_state "concerned" "Мы недостаточно используем const. Это может привести к непредсказуемому поведению кода."
    fi
    
    if [ $total_mutable_usage -gt 20 ]; then
        echo -e "${RED}❌ Высокий уровень использования мутирующих операций. ($total_mutable_usage операций)${NC}"
        emotional_state "concerned" "Мы слишком часто изменяем существующие структуры данных. Это может вызвать побочные эффекты."
    elif [ $total_mutable_usage -gt 10 ]; then
        echo -e "${YELLOW}⚠️ Средний уровень использования мутирующих операций. ($total_mutable_usage операций)${NC}"
        emotional_state "neutral" "Мы используем мутирующие операции умеренно, но стоит постараться сократить их количество."
    else
        echo -e "${GREEN}✅ Низкий уровень использования мутирующих операций. ($total_mutable_usage операций)${NC}"
        emotional_state "happy" "Мы редко используем мутирующие операции. Отличная работа!"
    fi
    
    return 0
}

# Функция для проверки чистоты функций
function check_pure_functions() {
    print_header "🔍 ПРОВЕРКА ЧИСТОТЫ ФУНКЦИЙ"
    
    echo -e "${BLUE}Анализирую побочные эффекты в функциях...${NC}"
    
    # Поиск потенциальных побочных эффектов
    local side_effects=("console.log" "process.exit" "Math.random" "new Date()" "setTimeout" "setInterval")
    local total_side_effects=0
    local effects_usage=()
    
    for effect in "${side_effects[@]}"; do
        local count=$(grep -r "$effect" --include="*.ts" --include="*.js" "$PROJECT_PATH/src" | wc -l)
        total_side_effects=$((total_side_effects + count))
        effects_usage+=("$effect: $count")
    done
    
    echo -e "${BLUE}Потенциальные источники побочных эффектов:${NC}"
    for usage in "${effects_usage[@]}"; do
        local effect=$(echo "$usage" | cut -d':' -f1)
        local count=$(echo "$usage" | cut -d':' -f2 | xargs)
        
        if [ "$effect" = "console.log" ]; then
            # console.log допустим для отладки, но не должен быть слишком частым
            if [ "$count" -gt 30 ]; then
                echo -e "${YELLOW}⚠️ $effect: $count раз (многовато для продакшна)${NC}"
            else
                echo -e "${GREEN}✅ $effect: $count раз (нормально для отладки)${NC}"
            fi
        elif [ "$count" -eq 0 ]; then
            echo -e "${GREEN}✅ $effect: не используется${NC}"
        elif [ "$count" -lt 5 ]; then
            echo -e "${YELLOW}⚠️ $effect: $count раз${NC}"
        else
            echo -e "${RED}❌ $effect: $count раз${NC}"
        fi
    done
    
    # Проверка паттерна async/await vs callback
    local async_count=$(grep -r "async " --include="*.ts" --include="*.js" "$PROJECT_PATH/src" | wc -l)
    local callback_count=$(grep -r "callback" --include="*.ts" --include="*.js" "$PROJECT_PATH/src" | wc -l)
    local promise_count=$(grep -r "new Promise" --include="*.ts" --include="*.js" "$PROJECT_PATH/src" | wc -l)
    
    echo -e "\n${BLUE}Анализ асинхронных паттернов:${NC}"
    echo -e "${GREEN}async/await: $async_count раз${NC}"
    echo -e "${YELLOW}callback: $callback_count раз${NC}"
    echo -e "${BLUE}new Promise: $promise_count раз${NC}"
    
    if [ $async_count -gt $callback_count ]; then
        echo -e "${GREEN}✅ Предпочтение отдается async/await вместо callbacks. Это хорошо!${NC}"
        emotional_state "happy" "Мы используем современный подход к асинхронному коду!"
    else
        echo -e "${YELLOW}⚠️ Возможно, стоит больше использовать async/await вместо callbacks.${NC}"
        emotional_state "neutral" "Callback-подход немного устарел. Лучше использовать async/await для читаемости."
    fi
    
    # Проверка использования функций высшего порядка
    local higher_order_count=$(grep -r -E "=>.*=>" --include="*.ts" --include="*.js" "$PROJECT_PATH/src" | wc -l)
    
    echo -e "\n${BLUE}Использование функций высшего порядка:${NC}"
    if [ $higher_order_count -gt 10 ]; then
        echo -e "${GREEN}✅ Активное использование функций высшего порядка: $higher_order_count раз${NC}"
        emotional_state "excited" "Мне очень нравится, что мы используем функции высшего порядка! Это настоящий функциональный стиль!"
    elif [ $higher_order_count -gt 0 ]; then
        echo -e "${YELLOW}⚠️ Умеренное использование функций высшего порядка: $higher_order_count раз${NC}"
        emotional_state "happy" "Мы начали использовать функции высшего порядка. Это хороший знак!"
    else
        echo -e "${RED}❌ Функции высшего порядка не используются${NC}"
        emotional_state "concerned" "Мы не используем функции высшего порядка. Это важный аспект функционального стиля."
    fi
    
    return 0
}

# Функция для проверки композиции функций
function check_function_composition() {
    print_header "🔍 ПРОВЕРКА КОМПОЗИЦИИ ФУНКЦИЙ"
    
    echo -e "${BLUE}Анализирую паттерны композиции функций...${NC}"
    
    # Поиск цепочек методов (метод-чейнинг)
    local method_chaining_output=$(grep -r -E "\.[a-zA-Z]+\(\)[ ]*\.[a-zA-Z]+\(\)" --include="*.ts" --include="*.js" "$PROJECT_PATH/src")
    local method_chaining_count=$(echo "$method_chaining_output" | grep -v "^$" | wc -l)
    
    # Поиск пайп-операторов или аналогичных конструкций
    local pipe_count=$(grep -r "|>" --include="*.ts" --include="*.js" "$PROJECT_PATH/src" | wc -l)
    local compose_count=$(grep -r -E "compose\(|pipe\(" --include="*.ts" --include="*.js" "$PROJECT_PATH/src" | wc -l)
    
    echo -e "${BLUE}Паттерны композиции функций:${NC}"
    echo -e "${GREEN}Метод-чейнинг: $method_chaining_count раз${NC}"
    echo -e "${BLUE}Pipe-операторы: $pipe_count раз${NC}"
    echo -e "${BLUE}Функции compose/pipe: $compose_count раз${NC}"
    
    local total_composition=$((method_chaining_count + pipe_count + compose_count))
    
    if [ $total_composition -gt 15 ]; then
        echo -e "${GREEN}✅ Отличный уровень использования композиции функций! ($total_composition случаев)${NC}"
        emotional_state "excited" "Композиция функций - это так элегантно! Мы используем этот подход активно!"
    elif [ $total_composition -gt 5 ]; then
        echo -e "${YELLOW}⚠️ Хороший уровень использования композиции функций. ($total_composition случаев)${NC}"
        emotional_state "happy" "Мне нравится, что мы используем композицию функций. Давайте делать это еще больше!"
    else
        echo -e "${RED}❌ Недостаточное использование композиции функций. ($total_composition случаев)${NC}"
        emotional_state "concerned" "Мы редко используем композицию функций. Это важный аспект функционального стиля."
    fi
    
    # Если найдены примеры метод-чейнинга, показываем некоторые из них
    if [ $method_chaining_count -gt 0 ]; then
        echo -e "\n${BLUE}Примеры метод-чейнинга:${NC}"
        echo "$method_chaining_output" | head -n 5 | while read -r line; do
            echo -e "${GREEN}- $line${NC}"
        done
        
        if [ $method_chaining_count -gt 5 ]; then
            echo -e "${GREEN}... и еще $(( method_chaining_count - 5 )) примеров${NC}"
        fi
    fi
    
    return 0
}

# Функция для проверки использования типов и интерфейсов
function check_types_and_interfaces() {
    print_header "🔍 ПРОВЕРКА ИСПОЛЬЗОВАНИЯ ТИПОВ И ИНТЕРФЕЙСОВ"
    
    echo -e "${BLUE}Анализирую систему типов в проекте...${NC}"
    
    # Поиск определений типов и интерфейсов
    local type_count=$(grep -r "type " --include="*.ts" "$PROJECT_PATH/src" | wc -l)
    local interface_count=$(grep -r "interface " --include="*.ts" "$PROJECT_PATH/src" | wc -l)
    local enum_count=$(grep -r "enum " --include="*.ts" "$PROJECT_PATH/src" | wc -l)
    
    # Поиск использования any и unknown
    local any_count=$(grep -r ": any" --include="*.ts" "$PROJECT_PATH/src" | wc -l)
    local unknown_count=$(grep -r ": unknown" --include="*.ts" "$PROJECT_PATH/src" | wc -l)
    
    # Поиск использования типов объединения и пересечения
    local union_count=$(grep -r -E ": [A-Za-z0-9]+[ ]*\|[ ]*[A-Za-z0-9]+" --include="*.ts" "$PROJECT_PATH/src" | wc -l)
    local intersection_count=$(grep -r -E ": [A-Za-z0-9]+[ ]*&[ ]*[A-Za-z0-9]+" --include="*.ts" "$PROJECT_PATH/src" | wc -l)
    
    echo -e "${BLUE}Статистика по системе типов:${NC}"
    echo -e "${GREEN}Пользовательские типы: $type_count${NC}"
    echo -e "${GREEN}Интерфейсы: $interface_count${NC}"
    echo -e "${BLUE}Перечисления (enum): $enum_count${NC}"
    echo -e "${YELLOW}Типы объединения (union): $union_count${NC}"
    echo -e "${YELLOW}Типы пересечения (intersection): $intersection_count${NC}"
    
    if [ $any_count -gt 0 ]; then
        echo -e "${RED}Использование any: $any_count раз${NC}"
        emotional_state "concerned" "Тип 'any' снижает типобезопасность. Лучше использовать более конкретные типы или 'unknown'."
    else
        echo -e "${GREEN}Использование any: $any_count раз${NC}"
        emotional_state "proud" "Мы избегаем использования 'any'. Отличная типобезопасность!"
    fi
    
    echo -e "${BLUE}Использование unknown: $unknown_count раз${NC}"
    
    local total_types=$((type_count + interface_count))
    
    if [ $total_types -gt 30 ]; then
        echo -e "${GREEN}✅ Отличный уровень типизации! ($total_types типов и интерфейсов)${NC}"
        emotional_state "excited" "Наш код отлично типизирован! Это делает его более надежным и документированным!"
    elif [ $total_types -gt 15 ]; then
        echo -e "${YELLOW}⚠️ Хороший уровень типизации. ($total_types типов и интерфейсов)${NC}"
        emotional_state "happy" "У нас хорошая типизация, но можно сделать ее еще лучше!"
    else
        echo -e "${RED}❌ Недостаточный уровень типизации. ($total_types типов и интерфейсов)${NC}"
        emotional_state "concerned" "Нам нужно улучшить типизацию кода для большей надежности."
    fi
    
    return 0
}

# Функция для генерации отчета о функциональном стиле
function generate_functional_report() {
    print_header "📊 ОТЧЕТ О ФУНКЦИОНАЛЬНОМ СТИЛЕ КОДА"
    
    echo -e "${BLUE}Что можно улучшить для более функционального подхода:${NC}"
    echo -e "${BLUE}------------------------------${NC}"
    
    echo -e "${GREEN}1. Предпочитайте иммутабельные структуры данных${NC}"
    echo -e "${GREEN}   - Используйте [...array] вместо array.push()${NC}"
    echo -e "${GREEN}   - Используйте { ...object } вместо object.property = value${NC}"
    
    echo -e "${GREEN}2. Используйте функции высшего порядка${NC}"
    echo -e "${GREEN}   - map, filter, reduce вместо циклов${NC}"
    echo -e "${GREEN}   - Создавайте функции, которые возвращают функции${NC}"
    
    echo -e "${GREEN}3. Пишите чистые функции${NC}"
    echo -e "${GREEN}   - Избегайте побочных эффектов${NC}"
    echo -e "${GREEN}   - Выделяйте побочные эффекты в отдельные функции${NC}"
    
    echo -e "${GREEN}4. Используйте композицию функций${NC}"
    echo -e "${GREEN}   - Создайте вспомогательные функции pipe() и compose()${NC}"
    echo -e "${GREEN}   - Разбивайте сложную логику на маленькие функции${NC}"
    
    echo -e "${GREEN}5. Используйте более выразительную систему типов${NC}"
    echo -e "${GREEN}   - Избегайте типа any${NC}"
    echo -e "${GREEN}   - Используйте объединения и пересечения типов${NC}"
    echo -e "${GREEN}   - Определяйте алгебраические типы данных${NC}"
    
    echo -e "\n${BLUE}Рекомендуемые библиотеки для функционального программирования:${NC}"
    echo -e "${GREEN}- fp-ts: Функциональное программирование в TypeScript${NC}"
    echo -e "${GREEN}- immutable.js: Иммутабельные коллекции данных${NC}"
    echo -e "${GREEN}- lodash/fp: Функциональная версия lodash${NC}"
    echo -e "${GREEN}- ramda: Функциональная библиотека, ориентированная на композицию${NC}"
    
    emotional_state "love" "Функциональное программирование делает код элегантным, тестируемым и менее подверженным ошибкам!"
}

# Главная функция
function main() {
    print_header "🛡️ АНАЛИЗ ФУНКЦИОНАЛЬНОГО СТИЛЯ КОДА"
    emotional_state "neutral" "Начинаю анализ функционального стиля кода проекта..."
    
    # Запускаем все проверки
    check_functional_approach
    check_immutability
    check_pure_functions
    check_function_composition
    check_types_and_interfaces
    
    # Генерируем отчет с рекомендациями
    generate_functional_report
    
    emotional_state "happy" "Анализ функционального стиля завершен!"
    return 0
}

# Запускаем главную функцию
main 