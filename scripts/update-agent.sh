#!/bin/bash

# ===============================================
# 🌈 СКРИПТ ОБНОВЛЕНИЯ НЕЙРОКОДЕРА НА СЕРВЕРЕ
# Автор: NeuroBlogger AI Agent
# Дата: 18.04.2025
# Версия: 1.0
# ===============================================

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Настройки по умолчанию
SSH_KEY="$HOME/.ssh/id_rsa"
SERVER="root@999-multibots-u14194.vm.elestio.app"
PROJECT_PATH="/opt/app/999-multibots-telegraf"
BRANCH="main"
RESTART_CONTAINERS=true
RUN_UPDATE_SCRIPT=true

# Функция для вывода сообщений
print_message() {
    local type=$1
    local message=$2
    local timestamp=$(date "+%Y-%m-%d %H:%M:%S")
    
    case $type in
        "header")
            echo -e "${CYAN}=====================================================${NC}"
            echo -e "${PURPLE}  $message${NC}"
            echo -e "${CYAN}=====================================================${NC}"
            ;;
        "info")
            echo -e "${BLUE}[INFO]${NC} $timestamp - $message"
            ;;
        "success")
            echo -e "${GREEN}[SUCCESS]${NC} $timestamp - $message"
            ;;
        "warning")
            echo -e "${YELLOW}[WARNING]${NC} $timestamp - $message"
            ;;
        "error")
            echo -e "${RED}[ERROR]${NC} $timestamp - $message"
            ;;
        *)
            echo -e "$message"
            ;;
    esac
}

# Функция для отображения справки
show_help() {
    echo "Использование: $0 [ОПЦИИ]"
    echo ""
    echo "Опции:"
    echo "  -h, --help                  Показать эту справку"
    echo "  -k, --key FILE              Путь к SSH ключу (по умолчанию: $SSH_KEY)"
    echo "  -s, --server HOST           Адрес сервера (по умолчанию: $SERVER)"
    echo "  -p, --path PATH             Путь к проекту на сервере (по умолчанию: $PROJECT_PATH)"
    echo "  -b, --branch BRANCH         Ветка Git для обновления (по умолчанию: $BRANCH)"
    echo "  -n, --no-restart            Не перезапускать контейнеры"
    echo "  -u, --no-update-script      Не запускать update-docker.sh"
    echo ""
    echo "Примеры:"
    echo "  $0                          Запустить с параметрами по умолчанию"
    echo "  $0 -b develop               Использовать ветку develop"
    echo "  $0 -n                       Обновить код без перезапуска контейнеров"
    echo ""
}

# Обработка параметров командной строки
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -k|--key)
            SSH_KEY="$2"
            shift 2
            ;;
        -s|--server)
            SERVER="$2"
            shift 2
            ;;
        -p|--path)
            PROJECT_PATH="$2"
            shift 2
            ;;
        -b|--branch)
            BRANCH="$2"
            shift 2
            ;;
        -n|--no-restart)
            RESTART_CONTAINERS=false
            shift
            ;;
        -u|--no-update-script)
            RUN_UPDATE_SCRIPT=false
            shift
            ;;
        *)
            print_message "error" "Неизвестная опция: $1"
            show_help
            exit 1
            ;;
    esac
done

# Проверка наличия SSH ключа
if [ ! -f "$SSH_KEY" ]; then
    print_message "error" "SSH ключ не найден по пути: $SSH_KEY"
    print_message "info" "Убедитесь, что ключ существует и имеет правильные разрешения."
    exit 1
fi

print_message "header" "🚀 НАЧИНАЕМ ПРОЦЕСС ОБНОВЛЕНИЯ НЕЙРОКОДЕРА"
print_message "info" "Используем SSH ключ: $SSH_KEY"
print_message "info" "Целевой сервер: $SERVER"
print_message "info" "Путь к проекту: $PROJECT_PATH"
print_message "info" "Ветка для обновления: $BRANCH"

# Проверка соединения с сервером
print_message "info" "Проверка соединения с сервером..."
if ! ssh -i "$SSH_KEY" -o ConnectTimeout=5 "$SERVER" "echo -n" >/dev/null 2>&1; then
    print_message "error" "Не удалось подключиться к серверу!"
    exit 1
fi
print_message "success" "Соединение с сервером установлено!"

# Запускаем обновление на сервере
print_message "info" "Начинаем процесс обновления на сервере..."

# Если выбрано использование скрипта update-docker.sh
if [ "$RUN_UPDATE_SCRIPT" = true ]; then
    print_message "info" "Запускаем скрипт update-docker.sh на сервере..."
    ssh -i "$SSH_KEY" "$SERVER" "cd $PROJECT_PATH && git fetch && git checkout $BRANCH && git pull && chmod +x scripts/*.sh && ./scripts/update-docker.sh"
    EXIT_CODE=$?
    
    if [ $EXIT_CODE -ne 0 ]; then
        print_message "error" "Произошла ошибка при выполнении скрипта update-docker.sh (код: $EXIT_CODE)"
        print_message "info" "Переключаемся на ручное обновление..."
    else
        print_message "success" "Скрипт update-docker.sh успешно выполнен!"
        exit 0
    fi
fi

# Если скрипт update-docker.sh не должен запускаться или завершился с ошибкой, выполняем ручное обновление
print_message "info" "Выполняем ручное обновление на сервере..."

# Обновление кода из репозитория
print_message "info" "Обновление кода из репозитория..."
ssh -i "$SSH_KEY" "$SERVER" "cd $PROJECT_PATH && git fetch && git checkout $BRANCH && git pull"
if [ $? -ne 0 ]; then
    print_message "error" "Ошибка при обновлении кода из репозитория"
    print_message "info" "Проверьте права доступа и состояние репозитория на сервере"
    exit 1
fi
print_message "success" "Код успешно обновлен из репозитория"

# Обновление прав на выполнение скриптов
print_message "info" "Обновление прав на выполнение скриптов..."
ssh -i "$SSH_KEY" "$SERVER" "cd $PROJECT_PATH && chmod +x scripts/*.sh"
print_message "success" "Права на выполнение скриптов обновлены"

# Если требуется перезапуск контейнеров
if [ "$RESTART_CONTAINERS" = true ]; then
    print_message "info" "Перезапуск Docker контейнеров..."
    
    # Останавливаем контейнеры
    print_message "info" "Останавливаем контейнеры..."
    ssh -i "$SSH_KEY" "$SERVER" "cd $PROJECT_PATH && docker compose down || docker-compose down"
    if [ $? -ne 0 ]; then
        print_message "warning" "Возникли проблемы при остановке контейнеров"
    fi
    
    # Удаляем неиспользуемые ресурсы
    print_message "info" "Очистка неиспользуемых Docker ресурсов..."
    ssh -i "$SSH_KEY" "$SERVER" "docker system prune -f --volumes"
    
    # Запускаем контейнеры
    print_message "info" "Запускаем контейнеры..."
    ssh -i "$SSH_KEY" "$SERVER" "cd $PROJECT_PATH && docker compose up --build -d || docker-compose up --build -d"
    if [ $? -ne 0 ]; then
        print_message "error" "Ошибка при запуске контейнеров"
        exit 1
    fi
    print_message "success" "Контейнеры успешно перезапущены"
    
    # Проверка статуса контейнеров
    print_message "info" "Проверка статуса контейнеров..."
    ssh -i "$SSH_KEY" "$SERVER" "docker ps | grep '999-multibots\|nginx-proxy'"
    print_message "info" "Просмотр последних логов..."
    ssh -i "$SSH_KEY" "$SERVER" "docker logs --tail 10 999-multibots"
fi

print_message "header" "✅ ОБНОВЛЕНИЕ НЕЙРОКОДЕРА УСПЕШНО ЗАВЕРШЕНО"
print_message "info" "Последняя версия кода из ветки $BRANCH установлена на сервере"
if [ "$RESTART_CONTAINERS" = true ]; then
    print_message "info" "Docker контейнеры перезапущены и работают"
else
    print_message "info" "Docker контейнеры НЕ были перезапущены (использован флаг --no-restart)"
fi

print_message "success" "Проверьте логи и работу приложения на сервере" 