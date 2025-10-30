#!/bin/bash

# 🎛️ Deploy Menu для bot-farm (PRODUCTION MODE)
# Главное меню управления деплоем в production окружении

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Конфигурация
CONTAINER_NAME="999-multibots"
IMAGE_NAME="999-agents-vibecoder_app"

# Автоматическое обновление саб-модулей
auto_update_submodules() {
    log "🔄 Автоматическое обновление саб-модулей..."
    
    # Переходим в корневую директорию проекта
    cd /root/999-agents-vibecoder
    
    # Автоматически коммитим все изменения в bot-farm если есть
    if [ -d "services/bot-farm" ]; then
        cd services/bot-farm
        if [ -n "$(git status --porcelain)" ]; then
            log "Автоматически коммичу изменения в bot-farm..."
            git add .
            git commit -m "Auto-commit: $(date '+%Y-%m-%d %H:%M:%S') - Automated deployment changes" || true
            success "Изменения в bot-farm закоммичены"
        fi
        cd /root/999-agents-vibecoder
    fi
    
    # Переключаемся на production
    current_branch=$(git rev-parse --abbrev-ref HEAD)
    if [ "$current_branch" != "production" ]; then
        git checkout production
    fi
    
    # Обновляем remote и ветку
    git fetch origin
    git pull origin production
    
    # Обновляем саб-модули
    git submodule update --remote
    
    # Переходим в каждый саб-модуль и переключаемся на production/main
    for submodule in services/ai-server services/bot-farm services/web; do
        if [ -d "$submodule" ]; then
            cd "$submodule"
            case "$submodule" in
                "services/web")
                    # Web сервис использует main ветку
                    current_branch=$(git rev-parse --abbrev-ref HEAD)
                    if [ "$current_branch" != "main" ]; then
                        git checkout main
                    fi
                    git pull origin main
                    ;;
                *)
                    # Остальные сервисы используют production
                    current_branch=$(git rev-parse --abbrev-ref HEAD)
                    if [ "$current_branch" != "production" ]; then
                        git checkout production
                    fi
                    git pull origin production
                    ;;
            esac
            cd /root/999-agents-vibecoder
        fi
    done
    
    # Автоматически коммитим обновления саб-модулей
    if [ -n "$(git status --porcelain)" ]; then
        git add services/ai-server services/bot-farm services/web
        git commit -m "Auto-update submodules: $(date '+%Y-%m-%d %H:%M:%S')" || true
        success "Обновления саб-модулей закоммичены"
    fi
    
    # Автоматически пушим изменения
    log "Автоматически пушу изменения..."
    git push origin production || true
    success "Изменения запушены в production"
    
    # Возвращаемся в bot-farm
    cd services/bot-farm
    
    success "🔄 Автоматическое обновление завершено!"
}

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
}

info() {
    echo -e "${PURPLE}ℹ️ $1${NC}"
}

# Показать текущий статус
show_current_status() {
    echo
    log "📊 Текущий статус системы:"
    echo "=========================="

    # Статус ветки
    current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
    echo "🌿 Текущая ветка: ${CYAN}$current_branch${NC}"

    # Статус субмодулей
    echo
    echo "📂 Статус субмодулей:"
    echo "---------------------"
    for submodule in services/ai-server services/bot-farm services/web; do
        if [ -d "$submodule" ]; then
            cd "$submodule"
            sub_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
            if [ "$submodule" = "services/web" ] && [ "$sub_branch" = "main" ]; then
                echo "  $submodule: ${GREEN}$sub_branch${NC} ✅"
            elif [ "$sub_branch" = "production" ]; then
                echo "  $submodule: ${GREEN}$sub_branch${NC} ✅"
            else
                echo "  $submodule: ${YELLOW}$sub_branch${NC} ⚠️"
            fi
            cd /root/999-agents-vibecoder
        fi
    done

    echo

    # Статус контейнера
    if docker ps --filter "name=$CONTAINER_NAME" | grep -q "$CONTAINER_NAME"; then
        echo "📦 Контейнер: ${GREEN}ЗАПУЩЕН${NC}"
        docker ps --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    else
        echo "📦 Контейнер: ${RED}ОСТАНОВЛЕН${NC}"
    fi

    echo

    # Статус образа
    if docker images "$IMAGE_NAME" | grep -q "$IMAGE_NAME"; then
        echo "🐳 Образ: ${GREEN}СУЩЕСТВУЕТ${NC}"
        docker images "$IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
    else
        echo "🐳 Образ: ${RED}НЕ НАЙДЕН${NC}"
    fi

    echo

    # Проверка ботов
    if docker ps --filter "name=$CONTAINER_NAME" | grep -q "$CONTAINER_NAME"; then
        echo "🤖 Проверка ботов:"
        bot_count=$(docker logs "$CONTAINER_NAME" 2>/dev/null | grep -c "🚀 Бот.*запущен" || echo "0")
        if [ "$bot_count" -gt 0 ]; then
            success "Найдено $bot_count запущенных ботов"
        else
            error "Боты не найдены в логах"
        fi
    fi

    echo
}

# Показать меню
show_menu() {
    echo
    echo "🎛️  Меню управления деплоем bot-farm (PRODUCTION)"
    echo "=================================================="
    echo
    echo "1️⃣  📊 Показать текущий статус"
    echo "2️⃣  🔄 Быстрый перезапуск (без пересборки)"
    echo "3️⃣  🚀 Quick Deploy (пересборка образа)"
    echo "4️⃣  ☢️  Nuclear Reset (полная очистка)"
    echo "5️⃣  🧹 Очистить Docker (убрать мусор)"
    echo "6️⃣  📋 Показать логи"
    echo "7️⃣  🔍 Проверить здоровье"
    echo "8️⃣  🔗 Тестировать SSH к серверу"
    echo "9️⃣  🚪 Выход"
    echo
}

# Очистка Docker
cleanup_docker() {
    log "Очищаю Docker систему..."
    
    docker system prune -f
    
    success "Docker очищен"
}

# Проверка здоровья
check_health() {
    log "Проверяю здоровье контейнера..."

    if ! docker ps --filter "name=$CONTAINER_NAME" | grep -q "$CONTAINER_NAME"; then
        error "Контейнер не запущен"
        return
    fi

    if docker exec "$CONTAINER_NAME" timeout 5 sh -c "nc -z localhost 3000" 2>/dev/null; then
        success "Контейнер здоров и готов к работе!"
    else
        error "Контейнер не отвечает на API"
    fi
}

# Тестирование SSH подключения
test_ssh_connection() {
    log "Тестирую SSH подключение к серверу..."

    # Проверяем наличие SSH ключа
    if [ ! -f ~/.ssh/selectel ]; then
        error "SSH ключ ~/.ssh/selectel не найден!"
        warning "Создайте SSH ключ командой: ssh-keygen -t ed25519 -f ~/.ssh/selectel"
        return
    fi

    # Тестируем подключение
    if ssh -i ~/.ssh/selectel -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@185.161.67.53 "echo 'SSH подключение успешно!'" 2>/dev/null; then
        success "SSH подключение к серверу 185.161.67.53 работает!"
        info "Можно использовать команду:"
        info "ssh -i ~/.ssh/selectel root@185.161.67.53"
    else
        error "SSH подключение к серверу 185.161.67.53 не работает!"
        warning "Проверьте:"
        warning "1. SSH ключ добавлен в Selectel панель"
        warning "2. Firewall разрешает SSH (порт 22)"
        warning "3. IP адрес сервера корректен"
    fi
}

# Показать логи
show_logs() {
    log "Показываю логи контейнера..."
    
    if ! docker ps --filter "name=$CONTAINER_NAME" | grep -q "$CONTAINER_NAME"; then
        error "Контейнер не запущен"
        return
    fi
    
    echo "📋 Последние 20 строк логов:"
    echo "============================="
    docker logs "$CONTAINER_NAME" --tail 20
}

# Обработка выбора
handle_choice() {
    local choice=$1

    case $choice in
        1)
            show_current_status
            ;;
        2)
            log "Запускаю быстрый перезапуск..."
            bash scripts/quick-restart.sh
            ;;
        3)
            log "Запускаю Quick Deploy..."
            bash scripts/quick-deploy.sh
            ;;
        4)
            log "Запускаю Nuclear Reset..."
            bash scripts/nuclear-reset.sh
            ;;
        5)
            cleanup_docker
            ;;
        6)
            show_logs
            ;;
        7)
            check_health
            ;;
        8)
            test_ssh_connection
            ;;
        9)
            echo
            success "До свидания! 👋"
            exit 0
            ;;
        *)
            error "Неверный выбор: $choice"
            ;;
    esac
}

# Основной цикл
main() {
    # Автоматически обновляем саб-модули при каждом запуске
    auto_update_submodules
    
    while true; do
        show_menu
        show_current_status
        
        echo
        read -p "🎯 Выберите действие (1-9): " -n 1 -r
        echo
        
        handle_choice $REPLY
        
        echo
        read -p "Нажмите Enter для продолжения..."
        echo
    done
}

# Запуск
main "$@"
