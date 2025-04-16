#!/bin/bash

# =================================================================
# Скрипт интеграции с Supabase для проекта NeuroBlogger
# Автор: НейроКодер
# Версия: 1.0
# Дата: 18.04.2025
# =================================================================

# Цветовые коды для красивого вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Загрузка переменных окружения из .env файла
if [ -f .env ]; then
    echo -e "${BLUE}[INFO]${NC} Загрузка переменных окружения из .env файла..."
    export $(grep -v '^#' .env | xargs)
else
    echo -e "${YELLOW}[WARN]${NC} Файл .env не найден, используются переменные окружения системы"
fi

# Проверка наличия необходимых переменных окружения
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
    echo -e "${RED}[ERROR]${NC} Не заданы SUPABASE_URL или SUPABASE_KEY в переменных окружения"
    exit 1
fi

# Функция вывода информационных сообщений
info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Функция вывода сообщений об успехе
success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Функция вывода предупреждений
warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Функция вывода сообщений об ошибках
error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Функция для проверки статуса Supabase
check_supabase_status() {
    info "Проверка соединения с Supabase проектом NeuroBlogger..."
    
    # Проверка с помощью curl
    status_code=$(curl -s -o /dev/null -w "%{http_code}" -H "apikey: $SUPABASE_KEY" "$SUPABASE_URL/rest/v1/?apikey=$SUPABASE_KEY")
    
    if [ "$status_code" == "200" ]; then
        success "Соединение с Supabase установлено успешно!"
        return 0
    else
        error "Не удалось подключиться к Supabase. Код ответа: $status_code"
        return 1
    fi
}

# Функция для выполнения SQL-запроса
execute_query() {
    local query="$1"
    info "Выполнение SQL запроса: ${query:0:50}..."
    
    response=$(curl -s -X POST \
        -H "apikey: $SUPABASE_KEY" \
        -H "Authorization: Bearer $SUPABASE_KEY" \
        -H "Content-Type: application/json" \
        -d "{\"query\": \"$query\"}" \
        "$SUPABASE_URL/rest/v1/rpc/execute")
    
    echo "$response"
}

# Функция для создания таблиц в базе данных
create_tables() {
    info "Создание необходимых таблиц в базе данных..."
    
    # SQL запрос для создания таблицы posts
    posts_query="CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        author TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );"
    
    # SQL запрос для создания таблицы users
    users_query="CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        telegram_id TEXT UNIQUE,
        email TEXT UNIQUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_login TIMESTAMP WITH TIME ZONE
    );"
    
    # SQL запрос для создания таблицы metrics
    metrics_query="CREATE TABLE IF NOT EXISTS metrics (
        id SERIAL PRIMARY KEY,
        metric_name TEXT NOT NULL,
        metric_value NUMERIC NOT NULL,
        source TEXT,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );"
    
    # Выполнение запросов
    execute_query "$posts_query"
    execute_query "$users_query"
    execute_query "$metrics_query"
    
    success "Таблицы созданы или уже существуют"
}

# Функция для резервного копирования данных
backup_data() {
    local backup_dir="./backups"
    local timestamp=$(date +"%Y%m%d%H%M%S")
    local backup_file="${backup_dir}/supabase_backup_${timestamp}.sql"
    
    # Создание директории для резервных копий, если она не существует
    mkdir -p "$backup_dir"
    
    info "Создание резервной копии данных Supabase..."
    
    # TODO: Реализовать логику резервного копирования через API Supabase
    # Это заглушка, так как прямого API для бэкапа нет в общедоступном API
    
    echo "-- Резервная копия базы данных Supabase" > "$backup_file"
    echo "-- Дата: $(date)" >> "$backup_file"
    echo "-- Проект: NeuroBlogger" >> "$backup_file"
    
    # Добавим заглушку данных
    echo "-- Эта функция требует доработки с использованием расширенного API Supabase" >> "$backup_file"
    
    success "Заглушка резервной копии создана: $backup_file"
    warning "Фактическое резервное копирование требует использования расширенного API Supabase"
}

# Функция для проверки таблиц в базе данных
check_tables() {
    info "Проверка существующих таблиц в базе данных..."
    
    # SQL запрос для получения списка таблиц
    tables_query="SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
    
    # Выполнение запроса
    result=$(execute_query "$tables_query")
    
    echo "$result" | jq -r '.[]?.table_name // empty' 2>/dev/null || echo "$result"
}

# Функция для добавления тестовых данных
add_test_data() {
    info "Добавление тестовых данных в базу данных..."
    
    # SQL запрос для добавления тестового поста
    post_query="INSERT INTO posts (title, content, author) 
                VALUES ('Тестовый пост от НейроКодера', 'Это тестовый контент, созданный автоматически.', 'НейроКодер')
                ON CONFLICT DO NOTHING
                RETURNING id;"
    
    # SQL запрос для добавления тестового пользователя
    user_query="INSERT INTO users (username, telegram_id, email) 
                VALUES ('neurocoder', '12345678', 'test@example.com')
                ON CONFLICT (username) DO NOTHING
                RETURNING id;"
    
    # SQL запрос для добавления тестовой метрики
    metric_query="INSERT INTO metrics (metric_name, metric_value, source) 
                 VALUES ('test_execution', 1, 'supabase-integration.sh')
                 RETURNING id;"
    
    # Выполнение запросов
    post_result=$(execute_query "$post_query")
    user_result=$(execute_query "$user_query")
    metric_result=$(execute_query "$metric_query")
    
    success "Тестовые данные добавлены"
    echo "Пост ID: $(echo "$post_result" | jq -r '.[0].id // "Не создан (возможно уже существует)"')"
    echo "Пользователь ID: $(echo "$user_result" | jq -r '.[0].id // "Не создан (возможно уже существует)"')"
    echo "Метрика ID: $(echo "$metric_result" | jq -r '.[0].id // "Не создана"')"
}

# Функция для анализа состояния базы данных
analyze_database() {
    info "Анализ состояния базы данных..."
    
    # SQL запрос для подсчета строк в основных таблицах
    count_query="SELECT
                 (SELECT COUNT(*) FROM posts) AS posts_count,
                 (SELECT COUNT(*) FROM users) AS users_count,
                 (SELECT COUNT(*) FROM metrics) AS metrics_count;"
    
    # Выполнение запроса
    result=$(execute_query "$count_query")
    
    echo "Статистика таблиц:"
    echo "Постов: $(echo "$result" | jq -r '.[0].posts_count // "0"')"
    echo "Пользователей: $(echo "$result" | jq -r '.[0].users_count // "0"')"
    echo "Метрик: $(echo "$result" | jq -r '.[0].metrics_count // "0"')"
}

# Основная функция для выполнения действий
main() {
    echo -e "${PURPLE}============================================${NC}"
    echo -e "${PURPLE}🌈 НейроКодер - Интеграция с Supabase ${NC}"
    echo -e "${PURPLE}============================================${NC}"
    
    # Проверка аргументов командной строки
    case "$1" in
        status)
            check_supabase_status
            ;;
        create)
            check_supabase_status && create_tables
            ;;
        backup)
            check_supabase_status && backup_data
            ;;
        check)
            check_supabase_status && check_tables
            ;;
        test)
            check_supabase_status && add_test_data
            ;;
        analyze)
            check_supabase_status && analyze_database
            ;;
        *)
            echo -e "${CYAN}Использование:${NC}"
            echo -e "  $0 status   - проверить статус соединения с Supabase"
            echo -e "  $0 create   - создать необходимые таблицы"
            echo -e "  $0 backup   - создать резервную копию данных"
            echo -e "  $0 check    - проверить существующие таблицы"
            echo -e "  $0 test     - добавить тестовые данные"
            echo -e "  $0 analyze  - проанализировать состояние базы данных"
            ;;
    esac
    
    echo -e "${PURPLE}============================================${NC}"
    echo -e "${PURPLE}🌈 Операция завершена ${NC}"
    echo -e "${PURPLE}============================================${NC}"
}

# Запуск основной функции с передачей аргументов
main "$@" 