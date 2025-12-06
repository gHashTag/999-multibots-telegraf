#!/bin/bash

# Быстрый деплой скрипт для экстренных случаев
# Использовать только когда Claude Code недоступен

set -e

echo "🚀 БЫСТРЫЙ ДЕПЛОЙ В ПРОДАКШН"
echo "=============================="

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Конфигурация
PROD_HOST="185.161.67.53"
PROD_USER="root"
SSH_KEY="$HOME/.ssh/selectel"
PROD_PROJECT="/root/999-agents-vibecoder"
PROD_SUBMODULE="/root/999-agents-vibecoder/services/bot-farm"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Функция для выполнения SSH команд
ssh_exec() {
    ssh -i "$SSH_KEY" "$PROD_USER@$PROD_HOST" "$1"
}

# 1. Проверка git статуса
log_info "Проверка git статуса..."
if ! git status --porcelain | grep -q .; then
    log_warn "Нет незакоммиченных изменений"
else
    log_info "Обнаружены изменения, готов к деплою"
fi

# 2. Сборка проекта
log_info "Сборка проекта..."
if npm run build; then
    log_success "Проект успешно собран"
else
    log_error "Ошибка при сборке проекта"
    exit 1
fi

# 3. Коммит и пуш (если есть изменения)
if git status --porcelain | grep -q .; then
    log_info "Создание коммита..."
    git add -A
    
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    COMMIT_MSG="⚡ QUICK-DEPLOY: $TIMESTAMP

Быстрый деплой через shell скрипт

🤖 Generated with quick-deploy.sh"

    if git commit -m "$COMMIT_MSG"; then
        log_success "Коммит создан"
        
        log_info "Отправка в production..."
        if git push origin production; then
            log_success "Изменения отправлены"
        else
            log_error "Ошибка при отправке изменений"
            exit 1
        fi
    else
        log_error "Ошибка при создании коммита"
        exit 1
    fi
fi

# 4. Обновление на продакшн сервере
log_info "Обновление подмодуля на продакшн сервере..."

if ssh_exec "cd $PROD_SUBMODULE && git fetch origin production && git reset --hard origin/production"; then
    log_success "Подмодуль обновлен"
else
    log_error "Ошибка при обновлении подмодуля"
    exit 1
fi

# 5. Компиляция на сервере
log_info "Компиляция TypeScript на сервере..."
if ssh_exec "cd $PROD_SUBMODULE && npx tsc"; then
    log_success "TypeScript скомпилирован"
else
    log_warn "Предупреждение при компиляции TypeScript"
fi

# 6. Обновление главного проекта
log_info "Обновление ссылки на подмодуль..."
ssh_exec "cd $PROD_PROJECT && git add services/bot-farm && git commit -m 'Quick-deploy: update bot-farm submodule' || true"

# 7. Перезапуск сервиса
log_info "Перезапуск сервиса на продакшн..."
if ssh_exec "cd $PROD_PROJECT && docker-compose restart app"; then
    log_success "Сервис перезапущен"
else
    log_error "Ошибка при перезапуске сервиса"
    exit 1
fi

# 8. Проверка статуса
log_info "Ожидание запуска сервиса..."
sleep 10

log_info "Проверка статуса сервиса..."
ssh_exec "cd $PROD_PROJECT && docker-compose ps app"

log_info "Проверка логов на ошибки..."
if ssh_exec "cd $PROD_PROJECT && docker-compose logs --tail=10 app | grep -i error" > /dev/null 2>&1; then
    log_warn "Обнаружены ошибки в логах, проверьте состояние сервиса"
else
    log_success "Логи не содержат критических ошибок"
fi

# 9. Финальный отчет
echo ""
echo -e "${CYAN}=============================="
echo -e "📋 ОТЧЕТ О БЫСТРОМ ДЕПЛОЕ"
echo -e "=============================${NC}"
echo -e "${GREEN}✅ Деплой завершен успешно${NC}"
echo -e "🕐 Время: $(date '+%Y-%m-%d %H:%M:%S')"
echo -e "🌿 Ветка: production"
echo -e "🔄 Сервис перезапущен: app"
echo -e "${CYAN}=============================="
echo -e "${NC}"

log_success "Быстрый деплой завершен!"