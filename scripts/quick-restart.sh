#!/bin/bash

# 🔄 Quick Restart Script для bot-farm
# Быстрый перезапуск контейнера без пересборки

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Конфигурация
CONTAINER_NAME="999-multibots"

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

# Проверка существования контейнера
check_container_exists() {
    if ! docker ps -aq --filter "name=$CONTAINER_NAME" | grep -q .; then
        error "Контейнер $CONTAINER_NAME не найден"
    fi
}

# Быстрый перезапуск
quick_restart() {
    log "Выполняю быстрый перезапуск..."
    
    # Останавливаем контейнер
    log "Останавливаю контейнер..."
    docker stop "$CONTAINER_NAME" || true
    
    # Запускаем контейнер
    log "Запускаю контейнер..."
    docker start "$CONTAINER_NAME" || true
    
    success "Контейнер перезапущен"
}

# Проверка здоровья
check_health() {
    log "Проверяю здоровье контейнера..."
    
    local max_attempts=20
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker ps --filter "name=$CONTAINER_NAME" --filter "status=running" | grep -q "$CONTAINER_NAME"; then
            log "Контейнер запущен, проверяю API..."
            
            if docker exec "$CONTAINER_NAME" timeout 5 sh -c "nc -z localhost 2999" 2>/dev/null; then
                success "Контейнер здоров и готов к работе!"
                return 0
            fi
        fi
        
        log "Ждем... (попытка $attempt/$max_attempts)"
        sleep 3
        attempt=$((attempt + 1))
    done
    
    error "Контейнер не стал здоровым за ожидаемое время"
}

# Показать статус
show_status() {
    log "Статус после перезапуска:"
    echo "=========================="
    
    # Статус контейнера
    echo "📦 Статус контейнера:"
    docker ps --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo
    
    # Последние логи
    echo "📋 Последние логи:"
    docker logs "$CONTAINER_NAME" --tail 3
}

# Основная функция
main() {
    echo "🔄 Quick Restart для bot-farm"
    echo "============================="
    echo
    
    check_container_exists
    quick_restart
    check_health
    show_status
    
    echo
    success "🎉 Перезапуск завершен успешно!"
    log "Мониторить логи: docker logs -f $CONTAINER_NAME"
}

# Запуск
main "$@"
