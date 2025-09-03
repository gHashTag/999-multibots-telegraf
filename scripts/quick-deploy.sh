#!/bin/bash

# 🚀 Quick Deploy Script для bot-farm
# Быстрый деплой production с пересборкой Docker

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Конфигурация
CONTAINER_NAME="999-multibots"
IMAGE_NAME="999-agents-vibecoder_app"
ENV_FILE=".env"

log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

# Проверка Git статуса
check_git_status() {
    log "Проверяю Git статус..."
    
    if [ -n "$(git status --porcelain)" ]; then
        warning "Есть несохраненные изменения в Git!"
        git status --short
        echo
        
        log "Автоматически коммичу изменения..."
        git add .
        git commit -m "Auto-commit before deployment: $(date '+%Y-%m-%d %H:%M:%S')" || true
        success "Изменения автоматически закоммичены"
        
        # Автоматически пушим если есть remote
        if git remote -v | grep -q origin; then
            log "Автоматически пушу изменения..."
            git push origin $(git rev-parse --abbrev-ref HEAD) || true
            success "Изменения запушены"
        fi
    else
        success "Git чистый, можно деплоить"
    fi
}

# Остановка и удаление старого контейнера
cleanup_old_container() {
    log "Очищаю старый контейнер..."
    
    if docker ps -q --filter "name=$CONTAINER_NAME" | grep -q .; then
        log "Останавливаю контейнер $CONTAINER_NAME..."
        docker stop "$CONTAINER_NAME" || true
    fi
    
    if docker ps -aq --filter "name=$CONTAINER_NAME" | grep -q .; then
        log "Удаляю контейнер $CONTAINER_NAME..."
        docker rm "$CONTAINER_NAME" || true
    fi
    
    success "Старый контейнер очищен"
}

# Пересборка Docker образа
rebuild_image() {
    log "Пересобираю Docker образ..."
    
    # Удаляем старый образ
    if docker images -q "$IMAGE_NAME" | grep -q .; then
        log "Удаляю старый образ $IMAGE_NAME..."
        docker rmi "$IMAGE_NAME" || true
    fi
    
    # Собираем новый образ
    log "Собираю новый образ..."
    docker build -t "$IMAGE_NAME" . --no-cache
    
    success "Образ пересобран"
}

# Запуск нового контейнера
start_new_container() {
    log "Запускаю новый контейнер..."
    
    docker run -d --name "$CONTAINER_NAME" \
        --env-file "$ENV_FILE" \
        -e NODE_ENV=production \
        -p 2999:2999 -p 3000:3000 -p 3001:3001 -p 3002:3002 \
        -p 3003:3003 -p 3004:3004 -p 3005:3005 -p 3006:3006 \
        -p 3007:3007 -p 3008:3008 -p 3009:3009 -p 3010:3010 \
        --restart unless-stopped \
        "$IMAGE_NAME"
    
    success "Новый контейнер запущен"
}

# Проверка здоровья контейнера
check_health() {
    log "Проверяю здоровье контейнера..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker ps --filter "name=$CONTAINER_NAME" --filter "status=running" | grep -q "$CONTAINER_NAME"; then
            log "Контейнер запущен, проверяю API..."
            
            # Проверяем API на порту 2999
            if docker exec "$CONTAINER_NAME" timeout 5 sh -c "nc -z localhost 2999" 2>/dev/null; then
                success "Контейнер здоров и готов к работе!"
                return 0
            fi
        fi
        
        log "Ждем... (попытка $attempt/$max_attempts)"
        sleep 5
        attempt=$((attempt + 1))
    done
    
    error "Контейнер не стал здоровым за ожидаемое время"
}

# Показать статус
show_status() {
    log "Статус деплоя:"
    echo "===================="
    
    # Статус контейнера
    echo "📦 Статус контейнера:"
    docker ps --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo
    
    # Последние логи
    echo "📋 Последние логи:"
    docker logs "$CONTAINER_NAME" --tail 5
    echo
    
    # Проверка исправленного кода
    echo "🔧 Проверка исправленного кода:"
    if docker exec "$CONTAINER_NAME" grep -q "name: 'instagram/scraper'" /app/dist/services/generateInstagramScraping.js 2>/dev/null; then
        success "✅ Instagram scraper исправлен (instagram/scraper)"
    else
        error "❌ Instagram scraper НЕ исправлен!"
    fi
}

# Основная функция
main() {
    echo "🚀 Quick Deploy для bot-farm"
    echo "============================="
    echo
    
    check_git_status
    cleanup_old_container
    rebuild_image
    start_new_container
    check_health
    show_status
    
    echo
    success "🎉 Деплой завершен успешно!"
    log "Мониторить логи: docker logs -f $CONTAINER_NAME"
    log "Проверить статус: docker ps | grep $CONTAINER_NAME"
}

# Запуск
main "$@"
