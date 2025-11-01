#!/bin/bash

################################################################################
# 🎯 ЕДИНЫЙ DEPLOY СКРИПТ ДЛЯ MAIN (THREE-HEAD-DEV.SHOP)
# Автоматизированный деплой на main сервер
# Использование: ./deploy-main.sh [команда]
# Команды: deploy | rollback | status | logs | help
################################################################################

set -e  # Остановка при любой ошибке

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Конфигурация для MAIN
CONTAINER_NAME="999-multibots-main"
SERVER_URL="three-head-dev.shop"
SERVER_USER="root"
SSH_KEY="~/.ssh/id_rsa"
PROJECT_PATH="/root/999-agents-telegraf-main"

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
    log_info "=== DEPLOY НАЧАЛО (MAIN) ==="
    check_server

    log_info "1. Обновление кода с git..."
    ssh_exec "
        cd $PROJECT_PATH
        git fetch origin main
        git reset --hard origin/main
        echo 'Код обновлён'
    "

    log_info "2. Пересборка Docker образа..."
    ssh_exec "
        cd $PROJECT_PATH
        docker build -t 999-agents-telegraf-main:latest . 2>&1 | tail -5
    "

    log_info "3. Остановка старого контейнера..."
    ssh_exec "
        docker stop $CONTAINER_NAME 2>/dev/null || true
        docker rm $CONTAINER_NAME 2>/dev/null || true
        echo 'Старый контейнер удалён'
    "

    log_info "4. Запуск нового контейнера..."
    ssh_exec "
        docker run -d \
          --name $CONTAINER_NAME \
          --restart unless-stopped \
          --network app-network-main \
          -p 2999-3010:2999-3010 \
          999-agents-telegraf-main:latest
        echo 'Контейнер запущен'
    "

    log_info "5. Настройка nginx reverse proxy с HTTPS..."
    ssh_exec "
        # Создание custom network если не существует
        docker network ls | grep -q app-network-main || docker network create app-network-main

        # Подключение контейнера к сети
        docker network connect app-network-main $CONTAINER_NAME 2>/dev/null || true

        # Создание nginx конфигурации с HTTPS
        mkdir -p /root/nginx-config-main

        # Let's Encrypt SSL сертификат для three-head-dev.shop
        # Копируем из /etc/letsencrypt/live/ если есть
        if [ -f '/etc/letsencrypt/live/three-head-dev.shop/fullchain.pem' ]; then
          cp /etc/letsencrypt/live/three-head-dev.shop/fullchain.pem /root/nginx-config-main/three-head-dev.shop.crt
          cp /etc/letsencrypt/live/three-head-dev.shop/privkey.pem /root/nginx-config-main/three-head-dev.shop.key
          echo \"✅ Using Let's Encrypt SSL certificate for three-head-dev.shop\"
        else
          log_warning 'SSL certificates not found, using self-signed'
          openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout /root/nginx-config-main/three-head-dev.shop.key \
            -out /root/nginx-config-main/three-head-dev.shop.crt \
            -subj '/C=RU/ST=Moscow/L=Moscow/O=999-agents/CN=three-head-dev.shop' 2>/dev/null || true
          echo \"⚠️ Using self-signed SSL certificate (for testing)\"
        fi

        # HTTPS конфигурация с HTTP callback для Railway compatibility
        cat > /root/nginx-config-main/default.conf << 'NGINX_EOF'
# HTTP Server (redirect to HTTPS, except callback endpoint)
server {
    listen 80;
    server_name three-head-dev.shop;

    # ✅ Allow callback endpoint on HTTP (for Railway render-server compatibility)
    location = /api/telegram/ai-reels-callback {
        # ⚠️ HTTP callback - Railway render-server doesn't follow redirects
        proxy_pass http://999-multibots-main:3000/api/telegram/ai-reels-callback;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto http;
    }

    # All other HTTP requests → redirect to HTTPS
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name three-head-dev.shop;
    client_max_body_size 100M;

    ssl_certificate /etc/nginx/ssl/three-head-dev.shop.crt;
    ssl_certificate_key /etc/nginx/ssl/three-head-dev.shop.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    # ✅ Callback endpoint on HTTPS (for other services)
    location = /api/telegram/ai-reels-callback {
        proxy_pass http://999-multibots-main:3000/api/telegram/ai-reels-callback;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # All other API endpoints
    location /api/ {
        proxy_pass http://999-multibots-main:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }

    location /health {
        proxy_pass http://999-multibots-main:3000/health;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
    }

    location / {
        proxy_pass http://999-multibots-main:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }
}
NGINX_EOF

        # Запуск/обновление nginx с HTTPS
        docker stop bot-proxy-main 2>/dev/null || true
        docker rm bot-proxy-main 2>/dev/null || true
        docker run -d \
          --name bot-proxy-main \
          --restart unless-stopped \
          --network app-network-main \
          -p 80:80 \
          -p 443:443 \
          -v /root/nginx-config-main:/etc/nginx/conf.d:ro \
          -v /root/nginx-config-main:/etc/nginx/ssl:ro \
          nginx:alpine
        echo '✅ Nginx с HTTPS настроен для three-head-dev.shop'
    "

    log_info "6. Ожидание инициализации (30 сек)..."
    sleep 30

    log_info "7. Проверка статуса..."
    check_status

    log_success "=== DEPLOY ЗАВЕРШЁН УСПЕШНО (MAIN) ==="
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
        log_error "Укажите снапшот: ./deploy-main.sh rollback main-stable-YYYYMMDD_HHMMSS"
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
        if [ -f 'docker-snapshot-main-${SNAPSHOT}.tar.gz' ]; then
            docker load < docker-snapshot-main-${SNAPSHOT}.tar.gz
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
          -p 2999-3010:2999-3010 \
          999-agents-telegraf-main:latest

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
    ssh_exec "ls -lh /root/docker-snapshot-main-*.tar.gz 2>/dev/null | awk '{print \$9, \$5}' || echo 'Снапшоты не найдены'"
}

# Функция помощи
help() {
    echo -e "${GREEN}999-AGENTS-TELEGRAF DEPLOY TOOL (MAIN)${NC}\n"
    echo "Использование: ./deploy-main.sh [команда] [параметры]"
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
    echo "  ./deploy-main.sh deploy"
    echo "  ./deploy-main.sh rollback main-stable-20251101_151934"
    echo "  ./deploy-main.sh logs 50"
    echo ""
    echo "Снапшоты автоматически создаются при каждом деплое."
    echo "Хранятся в /root/docker-snapshot-main-*.tar.gz"
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
