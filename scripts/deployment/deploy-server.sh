#!/bin/bash

# ===============================================
# 🌈 СКРИПТ ДЕПЛОЯ ПРОЕКТА NeuroBlogger НА СЕРВЕР
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
FORCE_RESTART=false
SKIP_CONFIRMATION=false

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
    echo "  -b, --branch BRANCH         Ветка Git для деплоя (по умолчанию: $BRANCH)"
    echo "  -n, --no-restart            Не перезапускать контейнеры"
    echo "  -f, --force                 Принудительный перезапуск контейнеров"
    echo "  -y, --yes                   Пропустить подтверждения"
    echo ""
    echo "Примеры:"
    echo "  $0                          Запустить с параметрами по умолчанию"
    echo "  $0 -b develop               Использовать ветку develop"
    echo "  $0 -f -y                    Принудительный перезапуск без подтверждения"
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
        -f|--force)
            FORCE_RESTART=true
            shift
            ;;
        -y|--yes)
            SKIP_CONFIRMATION=true
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

print_message "header" "🚀 НАЧИНАЕМ ПРОЦЕСС ДЕПЛОЯ NEUROBLOGGER"
print_message "info" "Используем SSH ключ: $SSH_KEY"
print_message "info" "Целевой сервер: $SERVER"
print_message "info" "Путь к проекту: $PROJECT_PATH"
print_message "info" "Ветка для деплоя: $BRANCH"

if [ "$SKIP_CONFIRMATION" = false ]; then
    echo -e "${YELLOW}Продолжить деплой с этими параметрами? (y/n)${NC}"
    read -r confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        print_message "info" "Деплой отменен пользователем."
        exit 0
    fi
fi

print_message "info" "Проверка соединения с сервером..."

# Проверка соединения с сервером
if ! ssh -i "$SSH_KEY" -o ConnectTimeout=5 "$SERVER" "echo -n" >/dev/null 2>&1; then
    print_message "error" "Не удалось подключиться к серверу!"
    exit 1
fi

print_message "success" "Соединение с сервером установлено!"

# Создаем временный файл с командами для выполнения на сервере
TMP_SCRIPT_FILE=$(mktemp)
cat > "$TMP_SCRIPT_FILE" << EOF
#!/bin/bash

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Параметры деплоя
PROJECT_PATH="$PROJECT_PATH"
BRANCH="$BRANCH"
RESTART_CONTAINERS=$RESTART_CONTAINERS
FORCE_RESTART=$FORCE_RESTART

# Функция для вывода сообщений
print_message() {
    local type=\$1
    local message=\$2
    local timestamp=\$(date "+%Y-%m-%d %H:%M:%S")
    
    case \$type in
        "header")
            echo -e "\${CYAN}=====================================================${NC}"
            echo -e "\${PURPLE}  \$message${NC}"
            echo -e "\${CYAN}=====================================================${NC}"
            ;;
        "info")
            echo -e "\${BLUE}[INFO]\${NC} \$timestamp - \$message"
            ;;
        "success")
            echo -e "\${GREEN}[SUCCESS]\${NC} \$timestamp - \$message"
            ;;
        "warning")
            echo -e "\${YELLOW}[WARNING]\${NC} \$timestamp - \$message"
            ;;
        "error")
            echo -e "\${RED}[ERROR]\${NC} \$timestamp - \$message"
            ;;
        *)
            echo -e "\$message"
            ;;
    esac
}

# Проверка прав root
if [ "\$(id -u)" -ne 0 ]; then
    print_message "error" "Скрипт должен быть запущен от имени пользователя root!"
    exit 1
fi

# Проверка существования директории проекта
if [ ! -d "\$PROJECT_PATH" ]; then
    print_message "error" "Директория проекта не существует: \$PROJECT_PATH"
    exit 1
fi

# Переход в директорию проекта
cd "\$PROJECT_PATH" || exit 1

# Проверка, находимся ли мы в git репозитории
if [ ! -d ".git" ]; then
    print_message "error" "Директория проекта не является git репозиторием!"
    exit 1
fi

print_message "header" "📥 ПОЛУЧЕНИЕ ПОСЛЕДНИХ ИЗМЕНЕНИЙ ИЗ РЕПОЗИТОРИЯ"

# Сохранение текущей версии для сравнения
CURRENT_COMMIT=\$(git rev-parse HEAD)
print_message "info" "Текущая версия: \$CURRENT_COMMIT"

# Сохранение текущих локальных изменений, если они есть
if [ -n "\$(git status --porcelain)" ]; then
    print_message "warning" "Обнаружены локальные изменения, сохраняем их..."
    git stash
    STASHED=true
else
    STASHED=false
fi

# Получение последних изменений из репозитория
print_message "info" "Получение последних изменений из репозитория..."
if ! git fetch origin; then
    print_message "error" "Не удалось получить изменения из репозитория!"
    exit 1
fi

print_message "info" "Переключение на ветку \$BRANCH..."
if ! git checkout \$BRANCH; then
    print_message "error" "Не удалось переключиться на ветку \$BRANCH!"
    exit 1
fi

print_message "info" "Применение изменений из ветки \$BRANCH..."
if ! git pull origin \$BRANCH; then
    print_message "error" "Не удалось применить изменения из ветки \$BRANCH!"
    exit 1
fi

# Проверка, были ли получены новые изменения
NEW_COMMIT=\$(git rev-parse HEAD)
if [ "\$CURRENT_COMMIT" = "\$NEW_COMMIT" ] && [ "\$FORCE_RESTART" = false ]; then
    print_message "success" "Система уже обновлена до последней версии ветки \$BRANCH."
    RESTART_NEEDED=false
else
    print_message "success" "Получены новые изменения из ветки \$BRANCH!"
    print_message "info" "Новая версия: \$NEW_COMMIT"
    RESTART_NEEDED=true
fi

# Применение сохраненных локальных изменений, если они были
if [ "\$STASHED" = true ]; then
    print_message "info" "Применение сохраненных локальных изменений..."
    if git stash apply; then
        print_message "success" "Локальные изменения успешно применены!"
    else
        print_message "warning" "Не удалось применить локальные изменения."
    fi
fi

# Обновление разрешений на выполнение скриптов
print_message "info" "Обновление разрешений на выполнение скриптов..."
find . -path "./scripts/*.sh" -type f -exec chmod +x {} \;
find . -name "*.sh" -type f -maxdepth 1 -exec chmod +x {} \;
print_message "success" "Разрешения на выполнение скриптов обновлены!"

# Обновление Docker контейнеров, если требуется
if [ "\$RESTART_CONTAINERS" = true ] && ([ "\$RESTART_NEEDED" = true ] || [ "\$FORCE_RESTART" = true ]); then
    print_message "header" "🔄 ОБНОВЛЕНИЕ DOCKER КОНТЕЙНЕРОВ"

    # Проверка наличия Docker и Docker Compose
    if ! command -v docker &> /dev/null; then
        print_message "error" "Docker не установлен!"
        exit 1
    fi

    # Определяем команду docker-compose или docker compose
    if command -v docker-compose &> /dev/null; then
        DOCKER_COMPOSE="docker-compose"
    else
        DOCKER_COMPOSE="docker compose"
    fi
    print_message "info" "Используем команду: \$DOCKER_COMPOSE"

    # Проверка конфигурации Docker Compose
    print_message "info" "Проверка конфигурации Docker Compose..."
    if ! \$DOCKER_COMPOSE config > /dev/null; then
        print_message "error" "Конфигурация Docker Compose содержит ошибки!"
        exit 1
    fi

    # Остановка контейнеров
    print_message "info" "Остановка контейнеров..."
    if ! \$DOCKER_COMPOSE down; then
        print_message "warning" "Возникли проблемы при остановке контейнеров!"
    fi

    # Очистка неиспользуемых ресурсов Docker
    print_message "info" "Очистка неиспользуемых ресурсов Docker..."
    docker system prune -f --volumes

    # Сборка и запуск контейнеров
    print_message "info" "Сборка и запуск контейнеров..."
    if ! \$DOCKER_COMPOSE up --build -d; then
        print_message "error" "Не удалось собрать и запустить контейнеры!"
        exit 1
    fi

    print_message "success" "Контейнеры успешно обновлены и запущены!"
else
    if [ "\$RESTART_CONTAINERS" = false ]; then
        print_message "info" "Пропускаем перезапуск контейнеров (указана опция --no-restart)."
    elif [ "\$RESTART_NEEDED" = false ]; then
        print_message "info" "Пропускаем перезапуск контейнеров (нет новых изменений)."
    fi
fi

print_message "header" "🔍 ПРОВЕРКА КОНФИГУРАЦИИ"

# Проверка конфигурации Docker
print_message "info" "Проверка статуса контейнеров..."
docker ps

# Проверка сетевых настроек Docker
print_message "info" "Проверка сетевых настроек Docker..."
docker network ls

# Проверка /etc/hosts на наличие записи app
print_message "info" "Проверка записи 'app' в /etc/hosts..."
if ! grep -q "app" /etc/hosts; then
    print_message "warning" "Запись 'app' не найдена в /etc/hosts, добавляем..."
    # Получаем IP адрес контейнера 999-multibots
    APP_IP=\$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 999-multibots)
    if [ -n "\$APP_IP" ]; then
        echo "\$APP_IP app" >> /etc/hosts
        print_message "success" "Запись 'app' добавлена в /etc/hosts: \$APP_IP app"
    else
        print_message "error" "Не удалось получить IP адрес контейнера 999-multibots!"
    fi
else
    print_message "success" "Запись 'app' найдена в /etc/hosts!"
fi

# Проверка конфигурации Nginx
print_message "info" "Проверка конфигурации Nginx на дубликаты locations..."
NGINX_CONF_DIR="/etc/nginx/conf.d"
if [ -d "\$NGINX_CONF_DIR" ]; then
    # Поиск дубликатов location в файлах конфигурации Nginx
    DUPLICATE_LOCATIONS=\$(grep -r "location" "\$NGINX_CONF_DIR" | sort | uniq -d)
    if [ -n "\$DUPLICATE_LOCATIONS" ]; then
        print_message "warning" "Обнаружены дубликаты location в конфигурации Nginx:"
        echo "\$DUPLICATE_LOCATIONS"
        print_message "info" "Рекомендуется проверить и исправить эти дубликаты!"
    else
        print_message "success" "Дубликаты location в конфигурации Nginx не обнаружены!"
    fi
else
    print_message "warning" "Директория конфигурации Nginx не найдена: \$NGINX_CONF_DIR"
fi

# Обновление записи в /etc/hosts контейнера nginx-proxy, если он существует
if docker ps -q -f name=nginx-proxy >/dev/null; then
    print_message "info" "Проверка записи 'app' в /etc/hosts контейнера nginx-proxy..."
    if ! docker exec nginx-proxy grep -q "app" /etc/hosts; then
        print_message "warning" "Запись 'app' не найдена в /etc/hosts контейнера nginx-proxy, добавляем..."
        APP_IP=\$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 999-multibots)
        if [ -n "\$APP_IP" ]; then
            docker exec nginx-proxy bash -c "echo '\$APP_IP app' >> /etc/hosts"
            print_message "success" "Запись 'app' добавлена в /etc/hosts контейнера nginx-proxy: \$APP_IP app"
        else
            print_message "error" "Не удалось получить IP адрес контейнера 999-multibots!"
        fi
    else
        print_message "success" "Запись 'app' найдена в /etc/hosts контейнера nginx-proxy!"
    fi
fi

# Перезапуск Nginx для применения изменений
print_message "info" "Перезапуск Nginx..."
if [ -n "\$(docker ps -q -f name=nginx-proxy)" ]; then
    # Сначала проверяем конфигурацию
    if ! docker exec nginx-proxy nginx -t &>/dev/null; then
        print_message "error" "Конфигурация Nginx содержит ошибки!"
        docker exec nginx-proxy nginx -t
    else
        docker exec nginx-proxy nginx -s reload
        print_message "success" "Nginx в контейнере успешно перезапущен!"
    fi
elif command -v nginx &> /dev/null; then
    if ! nginx -t &>/dev/null; then
        print_message "error" "Конфигурация Nginx содержит ошибки!"
        nginx -t
    else
        systemctl restart nginx
        print_message "success" "Сервис Nginx успешно перезапущен!"
    fi
else
    print_message "warning" "Nginx не найден!"
fi

print_message "header" "📋 ЛОГИ КОНТЕЙНЕРОВ"

# Вывод последних логов контейнера приложения
if [ -n "\$(docker ps -q -f name=999-multibots)" ]; then
    print_message "info" "Последние 10 записей логов контейнера приложения:"
    docker logs --tail 10 999-multibots 2>&1
else
    print_message "warning" "Контейнер 999-multibots не запущен!"
fi

# Вывод последних логов контейнера Nginx
if [ -n "\$(docker ps -q -f name=nginx-proxy)" ]; then
    print_message "info" "Последние 10 записей логов контейнера Nginx:"
    docker logs --tail 10 nginx-proxy 2>&1
fi

print_message "header" "✅ ПРОЦЕСС ДЕПЛОЯ ЗАВЕРШЕН"
print_message "success" "NeuroBlogger успешно обновлен и запущен!"
print_message "info" "Версия: \$(git describe --tags --always 2>/dev/null || git rev-parse --short HEAD)"
print_message "info" "Дата и время: \$(date)"
EOF

# Копирование временного скрипта на сервер
print_message "info" "Копирование скрипта деплоя на сервер..."
if ! scp -i "$SSH_KEY" "$TMP_SCRIPT_FILE" "$SERVER:$PROJECT_PATH/scripts/temp-deploy.sh"; then
    print_message "error" "Не удалось скопировать скрипт на сервер!"
    rm -f "$TMP_SCRIPT_FILE"
    exit 1
fi

# Удаление временного файла
rm -f "$TMP_SCRIPT_FILE"

# Выполнение скрипта деплоя на сервере
print_message "header" "🔄 ВЫПОЛНЕНИЕ ДЕПЛОЯ НА СЕРВЕРЕ"
print_message "info" "Запуск процесса деплоя на сервере..."

if ! ssh -i "$SSH_KEY" "$SERVER" "chmod +x $PROJECT_PATH/scripts/temp-deploy.sh && $PROJECT_PATH/scripts/temp-deploy.sh; rm -f $PROJECT_PATH/scripts/temp-deploy.sh"; then
    print_message "error" "Процесс деплоя на сервере завершился с ошибкой!"
    exit 1
fi

print_message "header" "✅ ДЕПЛОЙ УСПЕШНО ЗАВЕРШЕН"
print_message "success" "Проект NeuroBlogger успешно развернут на сервере!"
print_message "info" "Дата и время завершения: $(date)"

exit 0 