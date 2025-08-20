#!/bin/bash

# ===== 🌈 Скрипт обновления хостинга NeuroBlogger 🌈 =====
# Автор: NeuroBlogger AI
# Дата создания: 18.04.2025
# Версия: 1.2

# Цветовая схема для красивого вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
RESET='\033[0m'

# Настройки SSH
SSH_KEY="~/.ssh/id_rsa"
SSH_HOST="root@999-multibots-u14194.vm.elestio.app"
PROJECT_DIR="/opt/app/999-multibots-telegraf"

# Флаг для режима выполнения (локальный или удаленный)
REMOTE_MODE=true

# Функция для печати сообщений с эмодзи
print_emoji_message() {
    EMOJI=$1
    MESSAGE=$2
    COLOR=$3
    echo -e "${COLOR}${EMOJI} ${MESSAGE}${RESET}"
}

# Функция для проверки результата
check_result() {
    if [ $1 -eq 0 ]; then
        print_emoji_message "✅" "$2" "${GREEN}"
        return 0
    else
        print_emoji_message "❌" "$3" "${RED}"
        return 1
    fi
}

# Функция проверки, запущен ли скрипт от root
check_root() {
    if [ "$(id -u)" != "0" ]; then
        print_emoji_message "⚠️" "Этот скрипт должен быть запущен от имени root!" "${RED}"
        return 1
    fi
    return 0
}

# Функция для проверки SSH ключа
check_ssh_key() {
    if [ ! -f "$SSH_KEY" ]; then
        print_emoji_message "❌" "SSH ключ не найден: $SSH_KEY" "${RED}"
        print_emoji_message "ℹ️" "Убедитесь, что вы создали SSH ключ и он доступен по указанному пути" "${YELLOW}"
        return 1
    fi
    
    print_emoji_message "✅" "SSH ключ найден: $SSH_KEY" "${GREEN}"
    return 0
}

# Функция для выполнения команды на удаленном сервере
remote_exec() {
    if [ "$REMOTE_MODE" = true ]; then
        ssh -i "$SSH_KEY" "$SSH_HOST" "$1"
        return $?
    else
        eval "$1"
        return $?
    fi
}

# Заголовок программы
print_header() {
    echo -e "\n${PURPLE}=======================================================${RESET}"
    print_emoji_message "🌈" "Скрипт обновления хостинга NeuroBlogger" "${CYAN}"
    print_emoji_message "🤖" "Версия: 1.2" "${CYAN}"
    print_emoji_message "📅" "Дата: $(date '+%d.%m.%Y %H:%M:%S')" "${CYAN}"
    if [ "$REMOTE_MODE" = true ]; then
        print_emoji_message "🌐" "Режим: Удаленный (SSH)" "${CYAN}"
    else
        print_emoji_message "💻" "Режим: Локальный" "${CYAN}"
    fi
    echo -e "${PURPLE}=======================================================${RESET}\n"
}

# Проверка наличия необходимых утилит
check_dependencies() {
    print_emoji_message "🔍" "Проверка наличия необходимых утилит..." "${YELLOW}"
    
    local deps=("ssh" "git" "docker" "docker-compose")
    local missing=()
    
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            missing+=("$dep")
        fi
    done
    
    if [ ${#missing[@]} -ne 0 ]; then
        print_emoji_message "❌" "Отсутствуют необходимые утилиты: ${missing[*]}" "${RED}"
        return 1
    else
        print_emoji_message "✅" "Все необходимые утилиты установлены" "${GREEN}"
        return 0
    fi
}

# Обновление кода из репозитория
update_code() {
    print_emoji_message "📦" "Получение обновлений из репозитория..." "${YELLOW}"
    
    local cmd="cd $PROJECT_DIR && git stash && git pull"
    remote_exec "$cmd"
    
    if check_result $? "Репозиторий успешно обновлен" "Не удалось обновить репозиторий"; then
        print_emoji_message "🔄" "Обновление прав доступа на скрипты..." "${YELLOW}"
        remote_exec "cd $PROJECT_DIR && chmod +x scripts/*.sh"
        check_result $? "Права доступа обновлены" "Не удалось обновить права доступа"
        return 0
    else
        return 1
    fi
}

# Запуск скрипта обновления Docker
run_docker_update() {
    print_emoji_message "🐋" "Запуск скрипта обновления Docker..." "${YELLOW}"
    
    local cmd="cd $PROJECT_DIR && ./scripts/update-docker.sh"
    remote_exec "$cmd"
    
    check_result $? "Скрипт обновления Docker успешно выполнен" "Ошибка при выполнении скрипта обновления Docker"
    return $?
}

# Проверка состояния сервера после обновления
check_server_status() {
    print_emoji_message "🔍" "Проверка состояния сервера после обновления..." "${YELLOW}"
    
    # Проверка состояния Docker контейнеров
    print_emoji_message "🐋" "Проверка Docker контейнеров..." "${BLUE}"
    remote_exec "docker ps"
    
    # Проверка логов контейнеров
    print_emoji_message "📋" "Последние логи контейнеров:" "${BLUE}"
    remote_exec "docker logs --tail 10 999-multibots"
    remote_exec "docker logs --tail 10 nginx-proxy"
    
    # Проверка настроек Nginx
    print_emoji_message "🌐" "Проверка настроек Nginx:" "${BLUE}"
    remote_exec "docker exec nginx-proxy nginx -t"
    check_result $? "Конфигурация Nginx корректна" "В конфигурации Nginx есть ошибки"
    
    # Проверка соединения с Telegram API
    print_emoji_message "🤖" "Проверка соединения с Telegram API..." "${BLUE}"
    API_STATUS=$(remote_exec "curl -s https://api.telegram.org/bot123456:DUMMY_TOKEN/getMe | grep -o 'error_code\|ok'")
    
    if [[ "$API_STATUS" == *"ok"* ]]; then
        print_emoji_message "✅" "Соединение с Telegram API установлено" "${GREEN}"
    else
        print_emoji_message "⚠️" "Возможны проблемы с соединением к Telegram API" "${YELLOW}"
    fi
    
    return 0
}

# Функция для проверки наличия дублирующихся локаций в Nginx
check_nginx_duplicates() {
    print_emoji_message "🔍" "Проверка конфигурации Nginx на дубликаты..." "${YELLOW}"
    
    local cmd="grep -r 'location' /etc/nginx/conf.d/ | sort | uniq -d"
    local dupes=$(remote_exec "$cmd")
    
    if [ -n "$dupes" ]; then
        print_emoji_message "⚠️" "Обнаружены дублирующиеся локации:" "${RED}"
        echo "$dupes"
        
        # Проверка конфликта с Gaia_Kamskaia_bot
        print_emoji_message "🔍" "Проверка конфликта с ботом Gaia_Kamskaia_bot..." "${YELLOW}"
        local gaia_conflict=$(remote_exec "grep -r 'Gaia_Kamskaia_bot' /etc/nginx/conf.d/")
        
        if [[ $(echo "$gaia_conflict" | wc -l) -gt 1 ]]; then
            print_emoji_message "⚠️" "Обнаружен конфликт для бота Gaia_Kamskaia_bot!" "${RED}"
            echo "$gaia_conflict"
            
            # Автоматическое исправление
            print_emoji_message "🔄" "Автоматическое исправление конфликта..." "${YELLOW}"
            remote_exec "if grep -q 'Gaia_Kamskaia_bot' /etc/nginx/conf.d/bot3.locations; then sed -i 's/Gaia_Kamskaia_bot/ZavaraBot/g' /etc/nginx/conf.d/bot3.locations; fi"
            remote_exec "docker exec nginx-proxy nginx -s reload"
            check_result $? "Конфликт успешно исправлен" "Не удалось исправить конфликт"
        else
            print_emoji_message "✅" "Конфликта с Gaia_Kamskaia_bot не обнаружено" "${GREEN}"
        fi
        
        return 1
    else
        print_emoji_message "✅" "Дублирующихся локаций не обнаружено" "${GREEN}"
        return 0
    fi
}

# Функция полного обновления
full_update() {
    print_header
    
    if [ "$REMOTE_MODE" = true ]; then
        # Проверка SSH ключа
        check_ssh_key || return 1
    else
        # Проверка прав root для локального режима
        check_root || return 1
    fi
    
    # Проверка зависимостей
    check_dependencies || return 1
    
    # Обновление кода
    update_code || return 1
    
    # Запуск скрипта обновления Docker
    run_docker_update || return 1
    
    # Проверка наличия дублирующихся локаций в Nginx
    check_nginx_duplicates
    
    # Проверка состояния сервера после обновления
    check_server_status
    
    print_emoji_message "🎉" "Обновление хостинга завершено!" "${GREEN}"
    echo -e "${PURPLE}=======================================================${RESET}"
    
    return 0
}

# Функция для отображения помощи
show_help() {
    echo -e "\n${CYAN}Использование:${RESET} $0 [ОПЦИИ]"
    echo -e "\n${YELLOW}Опции:${RESET}"
    echo -e "  ${GREEN}-h, --help${RESET}        Показать эту справку"
    echo -e "  ${GREEN}-l, --local${RESET}       Запустить в локальном режиме (без SSH)"
    echo -e "  ${GREEN}-r, --remote${RESET}      Запустить в удаленном режиме с использованием SSH (по умолчанию)"
    echo -e "  ${GREEN}-k, --key${RESET} PATH    Указать путь к SSH ключу"
    echo -e "  ${GREEN}-c, --check${RESET}       Только проверка конфигурации без обновления"
    echo -e "\n${YELLOW}Примеры:${RESET}"
    echo -e "  $0 --remote                  # Обновить хостинг через SSH (по умолчанию)"
    echo -e "  $0 --local                   # Обновить хостинг локально"
    echo -e "  $0 --key ~/.ssh/my_key       # Указать другой SSH ключ"
    echo -e "  $0 --check                   # Только проверить конфигурацию\n"
}

# Обработка аргументов командной строки
handle_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -l|--local)
                REMOTE_MODE=false
                shift
                ;;
            -r|--remote)
                REMOTE_MODE=true
                shift
                ;;
            -k|--key)
                if [[ -n $2 ]]; then
                    SSH_KEY=$2
                    shift 2
                else
                    print_emoji_message "❌" "Отсутствует путь к SSH ключу после параметра --key" "${RED}"
                    show_help
                    exit 1
                fi
                ;;
            -c|--check)
                print_header
                
                if [ "$REMOTE_MODE" = true ]; then
                    check_ssh_key || exit 1
                fi
                
                check_dependencies || exit 1
                
                if [ "$REMOTE_MODE" = true ]; then
                    check_nginx_duplicates
                    check_server_status
                else
                    print_emoji_message "⚠️" "Проверка конфигурации доступна только в удаленном режиме" "${YELLOW}"
                fi
                
                exit 0
                ;;
            *)
                print_emoji_message "❌" "Неизвестный параметр: $1" "${RED}"
                show_help
                exit 1
                ;;
        esac
    done
}

# Запуск основной функции с обработкой аргументов
handle_args "$@"
full_update
exit $?