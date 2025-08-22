#!/bin/bash

# ========================================
# МЕНЕДЖЕР СЕРВЕРОВ
# ========================================
# Управление и мониторинг серверов

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Конфигурация серверов
PROD_SERVER="root@999-multibots-u14194.vm.elestio.app"
DEV_SERVER="root@999-multibots-dev-u14194.vm.elestio.app"

# Показываем помощь
show_help() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}            МЕНЕДЖЕР СЕРВЕРОВ          ${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo -e "${YELLOW}Использование:${NC}"
    echo "  $0 <команда> [сервер]"
    echo ""
    echo -e "${YELLOW}Доступные команды:${NC}"
    echo "  status      - Показать статус сервисов"
    echo "  logs        - Показать логи"
    echo "  restart     - Перезапустить сервисы"
    echo "  stop        - Остановить сервисы"
    echo "  start       - Запустить сервисы"
    echo "  health      - Проверить здоровье системы"
    echo "  backup      - Создать backup"
    echo "  restore     - Восстановить из backup"
    echo "  cleanup     - Очистить старые файлы"
    echo "  update      - Обновить систему"
    echo "  ssh         - SSH подключение"
    echo ""
    echo -e "${YELLOW}Доступные серверы:${NC}"
    echo "  dev         - Development сервер"
    echo "  prod        - Production сервер"
    echo "  both        - Оба сервера (где применимо)"
    echo ""
    echo -e "${YELLOW}Примеры:${NC}"
    echo "  $0 status dev       # Статус dev сервера"
    echo "  $0 logs prod        # Логи prod сервера"
    echo "  $0 restart both     # Перезапуск обоих серверов"
    echo "  $0 ssh dev          # SSH к dev серверу"
    echo ""
}

# Функция выполнения команды на сервере
execute_on_server() {
    local server=$1
    local command=$2
    local server_name=$3
    
    echo -e "${YELLOW}🖥️  Выполняю на $server_name сервере: $server${NC}"
    
    if ! ssh -o ConnectTimeout=10 -i ~/.ssh/id_rsa $server "$command" 2>/dev/null; then
        echo -e "${RED}❌ Ошибка выполнения команды на $server_name сервере${NC}"
        return 1
    fi
    
    return 0
}

# Функция для получения статуса сервисов
get_status() {
    local server=$1
    local server_name=$2
    
    local cmd='
    cd /opt/app/999-multibots-telegraf 2>/dev/null || cd /opt/999-multibots-telegraf 2>/dev/null || { echo "❌ Проект не найден"; exit 1; }
    
    echo "📊 Статус Docker контейнеров:"
    if [ -f "docker-compose.dev.yml" ] && [ "'$server_name'" == "Development" ]; then
        docker-compose -f docker-compose.dev.yml ps
    else
        docker-compose ps
    fi
    
    echo ""
    echo "💾 Использование диска:"
    df -h / | tail -1
    
    echo ""
    echo "🧠 Использование памяти:"
    free -h | head -2
    
    echo ""
    echo "⚡ Uptime:"
    uptime
    '
    
    execute_on_server $server "$cmd" $server_name
}

# Функция для просмотра логов
get_logs() {
    local server=$1
    local server_name=$2
    
    local cmd='
    cd /opt/app/999-multibots-telegraf 2>/dev/null || cd /opt/999-multibots-telegraf 2>/dev/null || { echo "❌ Проект не найден"; exit 1; }
    
    echo "📋 Последние логи приложения:"
    if [ "'$server_name'" == "Development" ]; then
        docker logs 999-multibots-dev --tail 50 2>/dev/null || docker logs 999-multibots --tail 50 2>/dev/null || echo "Контейнер не найден"
    else
        docker logs 999-multibots --tail 50 2>/dev/null || echo "Контейнер не найден"
    fi
    '
    
    execute_on_server $server "$cmd" $server_name
}

# Функция перезапуска сервисов
restart_services() {
    local server=$1
    local server_name=$2
    
    local cmd='
    cd /opt/app/999-multibots-telegraf 2>/dev/null || cd /opt/999-multibots-telegraf 2>/dev/null || { echo "❌ Проект не найден"; exit 1; }
    
    echo "🔄 Перезапускаю сервисы..."
    if [ -f "docker-compose.dev.yml" ] && [ "'$server_name'" == "Development" ]; then
        docker-compose -f docker-compose.dev.yml restart
    else
        docker-compose restart
    fi
    
    echo "⏳ Жду запуска..."
    sleep 10
    
    echo "📊 Новый статус:"
    if [ -f "docker-compose.dev.yml" ] && [ "'$server_name'" == "Development" ]; then
        docker-compose -f docker-compose.dev.yml ps
    else
        docker-compose ps
    fi
    '
    
    execute_on_server $server "$cmd" $server_name
}

# Функция остановки сервисов
stop_services() {
    local server=$1
    local server_name=$2
    
    local cmd='
    cd /opt/app/999-multibots-telegraf 2>/dev/null || cd /opt/999-multibots-telegraf 2>/dev/null || { echo "❌ Проект не найден"; exit 1; }
    
    echo "🛑 Останавливаю сервисы..."
    if [ -f "docker-compose.dev.yml" ] && [ "'$server_name'" == "Development" ]; then
        docker-compose -f docker-compose.dev.yml down
    else
        docker-compose down
    fi
    '
    
    execute_on_server $server "$cmd" $server_name
}

# Функция запуска сервисов
start_services() {
    local server=$1
    local server_name=$2
    
    local cmd='
    cd /opt/app/999-multibots-telegraf 2>/dev/null || cd /opt/999-multibots-telegraf 2>/dev/null || { echo "❌ Проект не найден"; exit 1; }
    
    echo "🚀 Запускаю сервисы..."
    if [ -f "docker-compose.dev.yml" ] && [ "'$server_name'" == "Development" ]; then
        docker-compose -f docker-compose.dev.yml up -d
    else
        docker-compose up -d
    fi
    
    echo "⏳ Жду запуска..."
    sleep 15
    
    echo "📊 Статус после запуска:"
    if [ -f "docker-compose.dev.yml" ] && [ "'$server_name'" == "Development" ]; then
        docker-compose -f docker-compose.dev.yml ps
    else
        docker-compose ps
    fi
    '
    
    execute_on_server $server "$cmd" $server_name
}

# Функция проверки здоровья
health_check() {
    local server=$1
    local server_name=$2
    
    echo -e "${YELLOW}🏥 Проверка здоровья $server_name сервера...${NC}"
    
    # Проверка SSH
    if ssh -o ConnectTimeout=5 -i ~/.ssh/id_rsa $server "echo 'SSH OK'" 2>/dev/null; then
        echo -e "${GREEN}✅ SSH подключение работает${NC}"
    else
        echo -e "${RED}❌ SSH подключение не работает${NC}"
        return 1
    fi
    
    # Проверка HTTP
    if [ "$server_name" == "Development" ]; then
        URL="https://999-multibots-dev-u14194.vm.elestio.app"
    else
        URL="https://999-multibots-u14194.vm.elestio.app"
    fi
    
    if curl -f -s "$URL" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ HTTP сервер отвечает ($URL)${NC}"
    else
        echo -e "${RED}❌ HTTP сервер не отвечает ($URL)${NC}"
    fi
    
    # Детальная проверка на сервере
    local cmd='
    echo "🔍 Системная диагностика:"
    
    # Проверка Docker
    if systemctl is-active --quiet docker; then
        echo "✅ Docker сервис активен"
    else
        echo "❌ Docker сервис не активен"
    fi
    
    # Проверка места на диске
    DISK_USAGE=$(df / | tail -1 | awk "{print \$5}" | sed "s/%//")
    if [ $DISK_USAGE -lt 80 ]; then
        echo "✅ Место на диске: ${DISK_USAGE}%"
    else
        echo "⚠️ Мало места на диске: ${DISK_USAGE}%"
    fi
    
    # Проверка памяти
    MEM_USAGE=$(free | grep Mem | awk "{printf \"%.0f\", \$3/\$2 * 100.0}")
    if [ $MEM_USAGE -lt 80 ]; then
        echo "✅ Использование памяти: ${MEM_USAGE}%"
    else
        echo "⚠️ Высокое использование памяти: ${MEM_USAGE}%"
    fi
    
    # Проверка загрузки CPU
    LOAD=$(uptime | awk -F"load average:" "{print \$2}" | cut -d, -f1 | sed "s/ //g")
    echo "ℹ️ Средняя загрузка CPU: $LOAD"
    '
    
    execute_on_server $server "$cmd" $server_name
}

# Функция создания backup
create_backup() {
    local server=$1
    local server_name=$2
    
    local cmd='
    echo "💾 Создаю backup..."
    
    BACKUP_DIR="/opt/backups/manual_$(date +%Y%m%d_%H%M%S)"
    mkdir -p $BACKUP_DIR
    
    cd /opt/app/999-multibots-telegraf 2>/dev/null || cd /opt/999-multibots-telegraf 2>/dev/null || { echo "❌ Проект не найден"; exit 1; }
    
    # Копируем важные файлы
    if [ -d "dist" ]; then
        cp -r dist $BACKUP_DIR/
        echo "✅ Скопирован dist/"
    fi
    
    if [ -f ".env" ]; then
        cp .env $BACKUP_DIR/
        echo "✅ Скопирован .env"
    fi
    
    if [ -f "docker-compose.yml" ]; then
        cp docker-compose.yml $BACKUP_DIR/
        echo "✅ Скопирован docker-compose.yml"
    fi
    
    if [ -f "docker-compose.dev.yml" ]; then
        cp docker-compose.dev.yml $BACKUP_DIR/
        echo "✅ Скопирован docker-compose.dev.yml"
    fi
    
    echo "📁 Backup создан: $BACKUP_DIR"
    echo "📊 Размер backup:"
    du -sh $BACKUP_DIR
    '
    
    execute_on_server $server "$cmd" $server_name
}

# Основная логика
COMMAND=${1:-""}
TARGET=${2:-"both"}

if [ -z "$COMMAND" ]; then
    show_help
    exit 1
fi

# Проверяем SSH ключ
if [ ! -f ~/.ssh/id_rsa ]; then
    echo -e "${RED}❌ SSH ключ не найден: ~/.ssh/id_rsa${NC}"
    exit 1
fi

# Определяем серверы для выполнения
SERVERS=""
case $TARGET in
    "dev"|"development")
        SERVERS="$DEV_SERVER:Development"
        ;;
    "prod"|"production")
        SERVERS="$PROD_SERVER:Production"
        ;;
    "both")
        SERVERS="$DEV_SERVER:Development $PROD_SERVER:Production"
        ;;
    *)
        echo -e "${RED}❌ Неизвестный сервер: $TARGET${NC}"
        show_help
        exit 1
        ;;
esac

# Специальная обработка SSH команды
if [ "$COMMAND" == "ssh" ]; then
    if [ "$TARGET" == "both" ]; then
        echo -e "${RED}❌ SSH подключение возможно только к одному серверу${NC}"
        exit 1
    fi
    
    SERVER=$(echo $SERVERS | cut -d: -f1)
    SERVER_NAME=$(echo $SERVERS | cut -d: -f2)
    
    echo -e "${BLUE}🔗 SSH подключение к $SERVER_NAME серверу...${NC}"
    ssh -i ~/.ssh/id_rsa $SERVER
    exit 0
fi

# Выполняем команду на серверах
echo -e "${PURPLE}========================================${NC}"
echo -e "${PURPLE}    ВЫПОЛНЕНИЕ КОМАНДЫ: $COMMAND        ${NC}"
echo -e "${PURPLE}========================================${NC}"

for server_info in $SERVERS; do
    SERVER=$(echo $server_info | cut -d: -f1)
    SERVER_NAME=$(echo $server_info | cut -d: -f2)
    
    echo -e "${BLUE}🖥️  Сервер: $SERVER_NAME ($SERVER)${NC}"
    echo "----------------------------------------"
    
    case $COMMAND in
        "status")
            get_status $SERVER $SERVER_NAME
            ;;
        "logs")
            get_logs $SERVER $SERVER_NAME
            ;;
        "restart")
            restart_services $SERVER $SERVER_NAME
            ;;
        "stop")
            stop_services $SERVER $SERVER_NAME
            ;;
        "start")
            start_services $SERVER $SERVER_NAME
            ;;
        "health")
            health_check $SERVER $SERVER_NAME
            ;;
        "backup")
            create_backup $SERVER $SERVER_NAME
            ;;
        *)
            echo -e "${RED}❌ Неизвестная команда: $COMMAND${NC}"
            show_help
            exit 1
            ;;
    esac
    
    echo ""
done

echo -e "${GREEN}✅ Команда выполнена на всех серверах${NC}"