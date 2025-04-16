#!/bin/bash

# ======================================================
# 🌈 SYSTEM-CHECK.SH 
# Скрипт для проверки здоровья системы NeuroBlogger
# Часть радужной диагностической системы
# ======================================================

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Эмодзи для состояний
OK_EMOJI="✅"
WARN_EMOJI="⚠️"
ERROR_EMOJI="❌"
INFO_EMOJI="ℹ️"
CHECK_EMOJI="🔍"
HEART_EMOJI="💖"

# Функция для печати заголовка
print_header() {
    echo -e "\n${BLUE}============================================================${NC}"
    echo -e "${CYAN}                   SYSTEM CHECK REPORT                     ${NC}"
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${PURPLE}Дата и время:${NC} $(date)"
    echo -e "${PURPLE}Имя хоста:${NC} $(hostname)\n"
}

# Функция для печати секции
print_section() {
    echo -e "\n${YELLOW}==== $1 ====${NC}"
}

# Функция для вывода результата проверки
print_check_result() {
    local status=$1
    local message=$2
    local details=$3

    if [ "$status" == "OK" ]; then
        echo -e "${GREEN}${OK_EMOJI} ${message}${NC}"
        if [ ! -z "$details" ]; then
            echo -e "   ${CYAN}${details}${NC}"
        fi
    elif [ "$status" == "WARN" ]; then
        echo -e "${YELLOW}${WARN_EMOJI} ${message}${NC}"
        if [ ! -z "$details" ]; then
            echo -e "   ${CYAN}${details}${NC}"
        fi
    elif [ "$status" == "ERROR" ]; then
        echo -e "${RED}${ERROR_EMOJI} ${message}${NC}"
        if [ ! -z "$details" ]; then
            echo -e "   ${CYAN}${details}${NC}"
        fi
    else
        echo -e "${BLUE}${INFO_EMOJI} ${message}${NC}"
        if [ ! -z "$details" ]; then
            echo -e "   ${CYAN}${details}${NC}"
        fi
    fi
}

# Проверка наличия директории проекта
check_project_directory() {
    print_section "Проверка директории проекта"
    
    local project_dir=$(pwd)
    if [ -d "$project_dir" ]; then
        print_check_result "OK" "Директория проекта существует" "$project_dir"
        
        # Проверка наличия package.json
        if [ -f "$project_dir/package.json" ]; then
            local version=$(grep -o '"version": "[^"]*' package.json | cut -d'"' -f4)
            print_check_result "OK" "Файл package.json найден" "Версия: $version"
        else
            print_check_result "ERROR" "Файл package.json не найден"
        fi
        
        # Проверка наличия .env файлов
        if [ -f "$project_dir/.env" ]; then
            print_check_result "OK" "Файл .env найден"
        else
            print_check_result "WARN" "Файл .env не найден"
        fi
        
        if [ -f "$project_dir/.env.production" ]; then
            print_check_result "OK" "Файл .env.production найден"
        else
            print_check_result "WARN" "Файл .env.production не найден"
        fi
    else
        print_check_result "ERROR" "Директория проекта не существует"
    fi
}

# Проверка Docker
check_docker() {
    print_section "Проверка Docker"
    
    if command -v docker &> /dev/null; then
        local docker_version=$(docker --version)
        print_check_result "OK" "Docker установлен" "$docker_version"
        
        # Проверка запущенных контейнеров проекта
        if docker ps | grep -q "999-multibots"; then
            print_check_result "OK" "Контейнер '999-multibots' запущен"
        else
            print_check_result "ERROR" "Контейнер '999-multibots' не запущен"
        fi
        
        if docker ps | grep -q "nginx-proxy"; then
            print_check_result "OK" "Контейнер 'nginx-proxy' запущен"
        else
            print_check_result "WARN" "Контейнер 'nginx-proxy' не запущен"
        fi
    else
        print_check_result "ERROR" "Docker не установлен"
    fi
}

# Проверка Node.js
check_nodejs() {
    print_section "Проверка Node.js и npm"
    
    if command -v node &> /dev/null; then
        local node_version=$(node -v)
        print_check_result "OK" "Node.js установлен" "$node_version"
    else
        print_check_result "WARN" "Node.js не установлен"
    fi
    
    if command -v npm &> /dev/null; then
        local npm_version=$(npm -v)
        print_check_result "OK" "npm установлен" "$npm_version"
    else
        print_check_result "WARN" "npm не установлен"
    fi
}

# Проверка Supabase
check_supabase() {
    print_section "Проверка Supabase"
    
    # Проверка наличия переменных окружения Supabase
    if grep -q "SUPABASE_URL" .env.production 2>/dev/null || grep -q "SUPABASE_URL" .env 2>/dev/null; then
        local supabase_url=$(grep "SUPABASE_URL" .env.production 2>/dev/null || grep "SUPABASE_URL" .env 2>/dev/null)
        supabase_url=${supabase_url#*=}
        print_check_result "OK" "Переменная SUPABASE_URL найдена" "$supabase_url"
    else
        print_check_result "ERROR" "Переменная SUPABASE_URL не найдена"
    fi
    
    if grep -q "SUPABASE_KEY" .env.production 2>/dev/null || grep -q "SUPABASE_KEY" .env 2>/dev/null; then
        print_check_result "OK" "Переменная SUPABASE_KEY найдена"
    else
        print_check_result "ERROR" "Переменная SUPABASE_KEY не найдена"
    fi
}

# Проверка токенов Telegram ботов
check_telegram_tokens() {
    print_section "Проверка токенов Telegram ботов"
    
    # Проверка наличия токенов в .env или .env.production
    local token_count_env=0
    local token_count_prod=0
    
    if [ -f ".env" ]; then
        token_count_env=$(grep -c "BOT_TOKEN_" .env)
    fi
    
    if [ -f ".env.production" ]; then
        token_count_prod=$(grep -c "BOT_TOKEN_" .env.production)
    fi
    
    if [ $token_count_env -gt 0 ] || [ $token_count_prod -gt 0 ]; then
        if [ $token_count_env -gt 0 ]; then
            print_check_result "OK" "Токены Telegram ботов найдены в .env" "Количество: $token_count_env"
        fi
        if [ $token_count_prod -gt 0 ]; then
            print_check_result "OK" "Токены Telegram ботов найдены в .env.production" "Количество: $token_count_prod"
        fi
    else
        print_check_result "ERROR" "Токены Telegram ботов не найдены"
    fi
}

# Проверка сборки TypeScript
check_typescript_build() {
    print_section "Проверка сборки TypeScript"
    
    # Проверка наличия директории dist
    if [ -d "dist" ]; then
        print_check_result "OK" "Директория dist существует"
        
        # Проверка наличия основных файлов в dist
        if [ -f "dist/bot.js" ]; then
            print_check_result "OK" "Файл dist/bot.js найден"
        else
            print_check_result "ERROR" "Файл dist/bot.js не найден! Требуется компиляция TypeScript"
            print_check_result "INFO" "Решение: выполните 'npm run build' или 'npx tsc'"
        fi
        
        # Проверка структуры директорий в dist
        local required_dirs=("dist/core" "dist/utils" "dist/helpers" "dist/interfaces")
        for dir in "${required_dirs[@]}"; do
            if [ -d "$dir" ]; then
                print_check_result "OK" "Директория $dir найдена"
            else
                print_check_result "ERROR" "Директория $dir не найдена! Структура скомпилированного проекта неполная"
                print_check_result "INFO" "Решение: создайте директорию '$dir' или выполните полную компиляцию TypeScript"
            fi
        done
    else
        print_check_result "ERROR" "Директория dist не найдена! Требуется компиляция TypeScript"
        print_check_result "INFO" "Решение: выполните 'npm run build' или 'npx tsc'"
    fi
}

# Проверка логов
check_logs() {
    print_section "Проверка логов"
    
    local logs_dir="logs"
    if [ -d "$logs_dir" ]; then
        local logs_size=$(du -sh "$logs_dir" | cut -f1)
        local logs_count=$(find "$logs_dir" -type f | wc -l)
        print_check_result "OK" "Директория логов найдена" "Размер: $logs_size, файлов: $logs_count"
        
        # Проверка наличия свежих логов (за последние 24 часа)
        local recent_logs=$(find "$logs_dir" -type f -mtime -1 | wc -l)
        if [ $recent_logs -gt 0 ]; then
            print_check_result "OK" "Найдены свежие логи" "Количество за последние 24 часа: $recent_logs"
        else
            print_check_result "WARN" "Свежие логи не найдены"
        fi
    else
        print_check_result "WARN" "Директория логов не найдена"
    fi
}

# Проверка использования диска
check_disk_usage() {
    print_section "Проверка использования диска"
    
    local disk_usage=$(df -h . | tail -n 1)
    local usage_percent=$(echo $disk_usage | awk '{print $5}')
    local available=$(echo $disk_usage | awk '{print $4}')
    
    if [ "${usage_percent%\%}" -gt 90 ]; then
        print_check_result "ERROR" "Диск заполнен более чем на 90%" "Использовано: $usage_percent, доступно: $available"
    elif [ "${usage_percent%\%}" -gt 70 ]; then
        print_check_result "WARN" "Диск заполнен более чем на 70%" "Использовано: $usage_percent, доступно: $available"
    else
        print_check_result "OK" "Использование диска в норме" "Использовано: $usage_percent, доступно: $available"
    fi
}

# Проверка наличия важных файлов и директорий
check_important_files() {
    print_section "Проверка важных файлов и директорий"
    
    # Проверка наличия директорий
    local dirs=("src" "scripts" "dist" "logs")
    for dir in "${dirs[@]}"; do
        if [ -d "$dir" ]; then
            print_check_result "OK" "Директория '$dir' найдена"
        else
            print_check_result "WARN" "Директория '$dir' не найдена"
        fi
    done
    
    # Проверка наличия важных файлов для работы
    local files=("package.json" "tsconfig.json" "docker-compose.yml" "Dockerfile")
    for file in "${files[@]}"; do
        if [ -f "$file" ]; then
            print_check_result "OK" "Файл '$file' найден"
        else
            print_check_result "WARN" "Файл '$file' не найден"
        fi
    done
    
    # Проверка наличия файла ROADMAP.md
    local roadmap_file="src/core/mcp/agent/memory-bank/NeuroBlogger/ROADMAP.md"
    if [ -f "$roadmap_file" ]; then
        local last_updated=$(grep -o "Последнее обновление: [0-9.]*" "$roadmap_file" | cut -d' ' -f3)
        print_check_result "OK" "Файл ROADMAP.md найден" "Последнее обновление: $last_updated"
    else
        print_check_result "WARN" "Файл ROADMAP.md не найден"
    fi
}

# Проверка Docker запуска приложения
check_docker_app_run() {
    print_section "Проверка Docker запуска приложения"
    
    # Проверяем логи контейнера 999-multibots на наличие ошибок
    if docker ps | grep -q "999-multibots"; then
        local error_count=$(docker logs --tail 50 999-multibots 2>&1 | grep -c "Error: Cannot find module '/app/dist/bot.js'")
        if [ $error_count -gt 0 ]; then
            print_check_result "ERROR" "Обнаружена ошибка MODULE_NOT_FOUND для /app/dist/bot.js" "Количество: $error_count"
            print_check_result "INFO" "Решение 1: Проверьте сборку TypeScript - выполните 'npm run build'"
            print_check_result "INFO" "Решение 2: Создайте необходимые директории в dist и перезапустите контейнер"
            print_check_result "INFO" "Команда: mkdir -p /app/dist/utils /app/dist/helpers/error /app/dist/interfaces /app/dist/core/bot"
        else
            print_check_result "OK" "Ошибки MODULE_NOT_FOUND не обнаружены в логах Docker"
        fi
        
        # Проверка на установку winston
        if docker logs --tail 30 999-multibots 2>&1 | grep -q "Модуль winston не найден"; then
            print_check_result "WARN" "Winston устанавливается, но не сохраняется между перезапусками"
            print_check_result "INFO" "Решение: Добавьте winston в package.json и пересоберите Docker образ"
        fi
    else
        print_check_result "ERROR" "Контейнер 999-multibots не запущен, невозможно проверить логи"
    fi
}

# Вывод общего состояния системы
print_system_state() {
    print_section "Общее состояние системы"
    
    # Рассчитываем общее состояние на основе проверок
    # Это упрощенная демонстрация, в реальности нужно более тщательно оценивать
    local state="HEALTHY"
    local details="Система работает нормально"
    
    if grep -q "ERROR" /tmp/system_check_temp 2>/dev/null; then
        state="CRITICAL"
        details="Обнаружены критические проблемы"
    elif grep -q "WARN" /tmp/system_check_temp 2>/dev/null; then
        state="WARNING"
        details="Обнаружены предупреждения"
    fi
    
    if [ "$state" == "HEALTHY" ]; then
        echo -e "\n${GREEN}${HEART_EMOJI} Состояние системы: ЗДОРОВА${NC}"
        echo -e "${GREEN}${details}${NC}"
    elif [ "$state" == "WARNING" ]; then
        echo -e "\n${YELLOW}${WARN_EMOJI} Состояние системы: ТРЕБУЕТ ВНИМАНИЯ${NC}"
        echo -e "${YELLOW}${details}${NC}"
    else
        echo -e "\n${RED}${ERROR_EMOJI} Состояние системы: КРИТИЧЕСКИЕ ОШИБКИ${NC}"
        echo -e "${RED}${details}${NC}"
    fi
    
    # Удаляем временный файл
    rm -f /tmp/system_check_temp
}

# Эмоциональное состояние НейроКодера
print_emotional_state() {
    print_section "Эмоциональное состояние НейроКодера"
    
    local emotions=("радость" "забота" "вдохновение" "удовлетворение" "энтузиазм")
    local random_index=$((RANDOM % 5))
    local emotion=${emotions[$random_index]}
    
    if [ "$emotion" == "радость" ]; then
        echo -e "${YELLOW}😊 НейроКодер испытывает радость от работы с системой${NC}"
    elif [ "$emotion" == "забота" ]; then
        echo -e "${GREEN}💚 НейроКодер заботится о системе${NC}"
    elif [ "$emotion" == "вдохновение" ]; then
        echo -e "${PURPLE}✨ НейроКодер вдохновлен развитием системы${NC}"
    elif [ "$emotion" == "удовлетворение" ]; then
        echo -e "${BLUE}🌟 НейроКодер удовлетворен состоянием системы${NC}"
    else
        echo -e "${CYAN}🚀 НейроКодер полон энтузиазма${NC}"
    fi
}

# Основная функция
main() {
    # Создаем временный файл для логирования результатов
    exec > >(tee -a /tmp/system_check_temp)
    
    print_header
    check_project_directory
    check_docker
    check_nodejs
    check_supabase
    check_telegram_tokens
    check_typescript_build
    check_docker_app_run
    check_logs
    check_disk_usage
    check_important_files
    print_system_state
    print_emotional_state
    
    echo -e "\n${BLUE}============================================================${NC}"
    echo -e "${CYAN}           ПРОВЕРКА СИСТЕМЫ ЗАВЕРШЕНА                     ${NC}"
    echo -e "${BLUE}============================================================${NC}"
    
    # Восстанавливаем стандартный вывод
    exec > /dev/tty
}

# Запуск основной функции
main 