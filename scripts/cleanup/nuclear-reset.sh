#!/bin/bash

# ☢️ Nuclear Reset Script для bot-farm
# Полная очистка и пересборка всего

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
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

info() {
    echo -e "${PURPLE}ℹ️ $1${NC}"
}

# Подтверждение действия
confirm_action() {
    echo
    warning "☢️  ВНИМАНИЕ: Nuclear Reset удалит ВСЕ контейнеры и образы!"
    echo "Это действие нельзя отменить!"
    echo
    read -p "Вы уверены, что хотите продолжить? (введите 'YES' для подтверждения): " -r
    if [[ ! $REPLY =~ ^YES$ ]]; then
        error "Действие отменено"
    fi
    echo
}

# Остановка всех контейнеров
stop_all_containers() {
    log "Останавливаю все контейнеры..."
    
    local containers=$(docker ps -q --filter "name=$CONTAINER_NAME")
    if [ -n "$containers" ]; then
        docker stop $containers || true
        success "Все контейнеры остановлены"
    else
        info "Нет запущенных контейнеров"
    fi
}

# Удаление всех контейнеров
remove_all_containers() {
    log "Удаляю все контейнеры..."
    
    local containers=$(docker ps -aq --filter "name=$CONTAINER_NAME")
    if [ -n "$containers" ]; then
        docker rm $containers || true
        success "Все контейнеры удалены"
    else
        info "Нет контейнеров для удаления"
    fi
}

# Удаление всех образов
remove_all_images() {
    log "Удаляю все образы..."
    
    local images=$(docker images -q "$IMAGE_NAME")
    if [ -n "$images" ]; then
        docker rmi $images || true
        success "Все образы удалены"
    else
        info "Нет образов для удаления"
    fi
}

# Очистка Docker системы
cleanup_docker() {
    log "Очищаю Docker систему..."
    
    # Удаляем неиспользуемые образы
    docker image prune -f || true
    
    # Удаляем неиспользуемые контейнеры
    docker container prune -f || true
    
    # Удаляем неиспользуемые сети
    docker network prune -f || true
    
    # Удаляем неиспользуемые volumes
    docker volume prune -f || true
    
    success "Docker система очищена"
}

# Очистка node_modules и dist
cleanup_project() {
    log "Очищаю проект..."
    
    if [ -d "node_modules" ]; then
        log "Удаляю node_modules..."
        rm -rf node_modules
        success "node_modules удален"
    fi
    
    if [ -d "dist" ]; then
        log "Удаляю dist..."
        rm -rf dist
        success "dist удален"
    fi
    
    if [ -f "package-lock.json" ]; then
        log "Удаляю package-lock.json..."
        rm -f package-lock.json
        success "package-lock.json удален"
    fi
    
    success "Проект очищен"
}

# Переустановка зависимостей
reinstall_dependencies() {
    log "Переустанавливаю зависимости..."
    
    npm install --legacy-peer-deps
    
    success "Зависимости переустановлены"
}

# Пересборка проекта
rebuild_project() {
    log "Пересобираю проект..."
    
    npm run build:prod
    
    if [ ! -f "dist/index.js" ]; then
        error "Сборка не удалась! dist/index.js не найден"
    fi
    
    success "Проект пересобран"
}

# Пересборка Docker образа
rebuild_docker_image() {
    log "Пересобираю Docker образ..."
    
    docker build -t "$IMAGE_NAME" . --no-cache
    
    success "Docker образ пересобран"
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

# Проверка здоровья
check_health() {
    log "Проверяю здоровье контейнера..."
    
    local max_attempts=30
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
        sleep 5
        attempt=$((attempt + 1))
    done
    
    error "Контейнер не стал здоровым за ожидаемое время"
}

# Финальная проверка
final_check() {
    log "Финальная проверка:"
    echo "===================="
    
    # Статус контейнера
    echo "📦 Статус контейнера:"
    docker ps --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo
    
    # Проверка исправленного кода
    echo "🔧 Проверка исправленного кода:"
    if docker exec "$CONTAINER_NAME" grep -q "name: 'instagram/scraper'" /app/dist/services/generateInstagramScraping.js 2>/dev/null; then
        success "✅ Instagram scraper исправлен (instagram/scraper)"
    else
        error "❌ Instagram scraper НЕ исправлен!"
    fi
    
    # Размер образа
    echo "📊 Размер Docker образа:"
    docker images "$IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
}

# Основная функция
main() {
    echo "☢️  Nuclear Reset для bot-farm"
    echo "=============================="
    echo
    
    confirm_action
    
    log "Начинаю Nuclear Reset..."
    
    stop_all_containers
    remove_all_containers
    remove_all_images
    cleanup_docker
    cleanup_project
    reinstall_dependencies
    rebuild_project
    rebuild_docker_image
    start_new_container
    check_health
    final_check
    
    echo
    success "🎉 Nuclear Reset завершен успешно!"
    log "Мониторить логи: docker logs -f $CONTAINER_NAME"
    log "Проверить статус: docker ps | grep $CONTAINER_NAME"
}

# Запуск
main "$@"
