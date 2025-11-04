#!/bin/bash

################################################################################
# 🎯 ЕДИНЫЙ DEPLOY СКРИПТ ДЛЯ 999-AGENTS-TELEGRAF
# Автоматизированный деплой на production сервер
# Использование: ./deploy.sh [команда]
# Команды: deploy | rollback | status | logs | help
#
# ОСОБЕННОСТИ:
# - ✅ Автоматическое создание снапшотов при каждом деплое
# - ✅ Автоочистка старых снапшотов (оставляет последние 5)
# - ✅ Docker rebuild БЕЗ кеша (--no-cache)
# - ✅ Настройка nginx с HTTPS
################################################################################

set -e  # Остановка при любой ошибке

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Конфигурация
CONTAINER_NAME="999-multibots"
SERVER_URL="212.86.115.30"
SERVER_USER="root"
SSH_KEY="~/.ssh/zomro"
PROJECT_PATH="/root/bot-farm"

# Функции логирования
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Функция выполнения SSH команды
ssh_exec() {
    local cmd="$1"
    ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_URL "$cmd"
}

# Проверка доступности сервера
check_server() {
    log_info "Проверка доступности сервера $SERVER_URL..."
    if ! ping -c 1 $SERVER_URL >/dev/null 2>&1; then
        log_error "Сервер $SERVER_URL недоступен!"
        exit 1
    fi
    log_success "Сервер доступен"
}

# Функция deploy
deploy() {
    log_info "=== DEPLOY НАЧАЛО ==="
    check_server

    log_info "1. Обновление кода с git..."
    ssh_exec "
        cd $PROJECT_PATH
        git fetch origin production
        git reset --hard origin/production
        echo 'Код обновлён'
    "

    log_info "2. Пересборка Docker образа (БЕЗ КЕША - ОБЯЗАТЕЛЬНО!)..."
    ssh_exec "
        cd $PROJECT_PATH
        docker build --no-cache -t 999-agents-telegraf:latest . 2>&1 | tail -5
    "

    log_info "3. Полная очистка всех контейнеров и сетей..."
    ssh_exec "
        # Останавливаем все контейнеры
        docker stop 999-multibots 2>/dev/null || true
        docker rm 999-multibots 2>/dev/null || true
        docker stop bot-proxy 2>/dev/null || true
        docker rm bot-proxy 2>/dev/null || true

        # Удаляем сети
        docker network rm app-network 2>/dev/null || true

        # Убиваем процессы на портах
        fuser -k 80/tcp 2>/dev/null || true
        fuser -k 443/tcp 2>/dev/null || true
        fuser -k 3000/tcp 2>/dev/null || true

        echo 'Все контейнеры и сети удалены'
    "

    log_info "4. Запуск нового контейнера..."
    ssh_exec "
        docker run -d \
          --name 999-multibots \
          --restart unless-stopped \
          --network host \
          999-agents-telegraf:latest
        echo 'Контейнер запущен'
    "

    log_info "5. Ожидание инициализации приложения (20 сек)..."
    sleep 20

    log_info "6. Создание снапшота перед деплоем..."
    ssh_exec "
        TIMESTAMP=\$(date +%Y%m%d_%H%M%S)
        echo \"Создаю снапшот prod-stable-\${TIMESTAMP}...\"
        docker save 999-agents-telegraf:latest | gzip > /root/docker-snapshot-prod-stable-\${TIMESTAMP}.tar.gz
        echo \"Снапшот создан\"

        # Очистка старых снапшотов (оставляем последние 5)
        echo \"Очищаю старые снапшоты (оставляю последние 5)...\"
        cd /root
        ls -t docker-snapshot-*.tar.gz 2>/dev/null | tail -n +6 | xargs -r rm -f
        echo \"Очистка завершена\"

        # Показываем текущие снапшоты
        echo \"Текущие снапшоты: \"
        ls -lh docker-snapshot-*.tar.gz 2>/dev/null | awk '{print \$9, \$5}' | head -5
    "

    log_info "7. Настройка nginx reverse proxy..."
    ssh_exec "
        # Создание nginx конфигурации
        mkdir -p /root/nginx-config
        rm -rf /root/nginx-config/*

        # Let's Encrypt SSL сертификат (автообновляется)
        if [ -f '/etc/letsencrypt/live/three-head-dragon.shop/fullchain.pem' ]; then
          cp /etc/letsencrypt/live/three-head-dragon.shop/fullchain.pem /root/nginx-config/three-head-dragon.shop.crt
          cp /etc/letsencrypt/live/three-head-dragon.shop/privkey.pem /root/nginx-config/three-head-dragon.shop.key
          echo \"Using Let's Encrypt SSL certificate\"
        else
          openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout /root/nginx-config/three-head-dragon.shop.key \
            -out /root/nginx-config/three-head-dragon.shop.crt \
            -subj '/C=RU/ST=Moscow/L=Moscow/O=999-agents/CN=three-head-dragon.shop' 2>/dev/null
          echo \"Using self-signed SSL certificate (for testing)\"
        fi

        # Простая и надежная nginx конфигурация
        cat > /root/nginx-config/default.conf << 'NGINX_EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name three-head-dragon.shop;
    client_max_body_size 100M;

    location = /api/telegram/ai-reels-callback {
        proxy_pass http://127.0.0.1:3000/api/telegram/ai-reels-callback;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto http;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    location /health {
        proxy_pass http://127.0.0.1:3000/health;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
    }

    location / {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
NGINX_EOF

        # Запуск nginx с host network для прямого доступа к localhost
        docker stop bot-proxy 2>/dev/null || true
        docker rm bot-proxy 2>/dev/null || true
        docker run -d \
          --name bot-proxy \
          --restart unless-stopped \
          --network host \
          -v /root/nginx-config:/etc/nginx/conf.d:ro \
          -v /root/nginx-config:/etc/nginx/ssl:ro \
          nginx:alpine

        echo 'Nginx с HTTP настроен'
    "

    log_info "8. Ожидание инициализации (30 сек)..."
    sleep 30

    log_info "9. Проверка статуса..."
    check_status

    log_success "=== DEPLOY ЗАВЕРШЁН УСПЕШНО ==="

    log_info "6. Проверка статуса..."
    check_status

    log_success "=== DEPLOY ЗАВЕРШЁН УСПЕШНО ==="
}

# Функция проверки статуса
check_status() {
    log_info "Проверка статуса контейнеров..."
    ssh_exec "
        echo '=== КОНТЕЙНЕРЫ ==='
        docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

        echo -e '\n=== БОТЫ ==='
        docker logs $CONTAINER_NAME 2>&1 | grep 'Бот.*инициализирован' | wc -l

        echo -e '\n=== API ==='
        curl -s http://localhost:3000/health || echo 'API недоступен'

        echo -e '\n=== ПОСЛЕДНИЕ ЛОГИ ==='
        docker logs $CONTAINER_NAME --tail 10
    "
}

# Функция rollback
rollback() {
    local SNAPSHOT="$1"
    if [ -z "$SNAPSHOT" ]; then
        log_error "Укажите снапшот: ./deploy.sh rollback prod-stable-YYYYMMDD_HHMMSS"
        exit 1
    fi

    log_warning "=== ROLLBACK К $SNAPSHOT ==="
    check_server

    log_info "1. Остановка контейнера..."
    ssh_exec "
        docker stop $CONTAINER_NAME 2>/dev/null || true
        docker rm $CONTAINER_NAME 2>/dev/null || true
    "

    log_info "2. Загрузка снапшота..."
    ssh_exec "
        cd /root
        if [ -f 'docker-snapshot-${SNAPSHOT}.tar.gz' ]; then
            docker load < docker-snapshot-${SNAPSHOT}.tar.gz
            echo 'Снапшот загружен'
        else
            echo 'Снапшот не найден!'
            exit 1
        fi
    "

    log_info "3. Запуск контейнера из снапшота..."
    ssh_exec "
        docker run -d \
          --name $CONTAINER_NAME \
          --restart unless-stopped \
          --network host \
          999-agents-telegraf:latest

        sleep 20
        check_status
    "

    log_success "=== ROLLBACK ЗАВЕРШЁН ==="
}

# Функция просмотра логов
logs() {
    local lines="${1:-100}"
    ssh_exec "docker logs --tail $lines -f $CONTAINER_NAME"
}

# Функция списка снапшотов
list_snapshots() {
    log_info "Доступные снапшоты:"
    ssh_exec "ls -lh /root/docker-snapshot-*.tar.gz 2>/dev/null | awk '{print \$9, \$5}' || echo 'Снапшоты не найдены'"
}

# Функция помощи
help() {
    echo -e "${GREEN}999-AGENTS-TELEGRAF DEPLOY TOOL${NC}\n"
    echo "Использование: ./deploy.sh [команда] [параметры]"
    echo ""
    echo "Команды:"
    echo "  deploy                    - Полный деплой (git pull + rebuild + restart)"
    echo "  rollback <snapshot>       - Откат к снапшоту"
    echo "  status                    - Проверка статуса системы"
    echo "  logs [строк]              - Просмотр логов (по умолчанию 100 строк)"
    echo "  list                      - Список доступных снапшотов"
    echo "  help                      - Показать эту справку"
    echo ""
    echo "Примеры:"
    echo "  ./deploy.sh deploy"
    echo "  ./deploy.sh rollback prod-stable-20251031_151934"
    echo "  ./deploy.sh logs 50"
    echo ""
    echo "ОСОБЕННОСТИ:"
    echo "✅ Автосоздание снапшотов при каждом деплое"
    echo "✅ Автоочистка старых снапшотов (оставляет последние 5)"
    echo "✅ Docker сборка БЕЗ кеша (--no-cache)"
    echo ""
    echo "Снапшоты:"
    echo "- Автоматически создаются: prod-stable-YYYYMMDD_HHMMSS.tar.gz"
    echo "- Расположение: /root/docker-snapshot-*.tar.gz"
    echo "- ВНИМАНИЕ: Хранятся только последние 5!"
}

# Главная логика
main() {
    case "${1:-help}" in
        deploy)
            deploy
            ;;
        rollback)
            rollback "$2"
            ;;
        status|check)
            check_status
            ;;
        logs)
            logs "$2"
            ;;
        list|snapshots)
            list_snapshots
            ;;
        help|--help|-h)
            help
            ;;
        *)
            log_error "Неизвестная команда: $1"
            help
            exit 1
            ;;
    esac
}

# Проверка зависимостей
if ! command -v ssh &> /dev/null; then
    log_error "SSH не установлен!"
    exit 1
fi

# Запуск
main "$@"
