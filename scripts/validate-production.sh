#!/bin/bash
################################################################################
# 🔍 PRODUCTION VALIDATION SCRIPT
# Проверяет критические конфигурации на production сервере
# Использование: ./scripts/validate-production.sh
################################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

log_error() {
    echo -e "${RED}❌ ERROR:${NC} $1"
    ((ERRORS++))
}

log_warning() {
    echo -e "${YELLOW}⚠️  WARNING:${NC} $1"
    ((WARNINGS++))
}

log_success() {
    echo -e "${GREEN}✅${NC} $1"
}

log_info() {
    echo -e "${BLUE}ℹ️${NC} $1"
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 PRODUCTION VALIDATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Проверка docker-compose.yml
echo "📋 1. Проверка docker-compose.yml"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ! -f "docker-compose.yml" ]; then
    log_error "docker-compose.yml не найден!"
else
    # Проверка портов nginx
    NGINX_PORTS=$(grep -A 10 "container_name: bot-proxy" docker-compose.yml | grep "ports:" -A 5)

    if echo "$NGINX_PORTS" | grep -qE "(8443:443|8080:80)"; then
        log_error "Обнаружены нестандартные порты в docker-compose.yml!"
        echo "  Найдено:"
        echo "$NGINX_PORTS" | grep -E "(8443:443|8080:80)" | sed 's/^/  /'
        echo "  ❌ НЕЛЬЗЯ: 8443:443, 8080:80"
        echo "  ✅ НУЖНО:  443:443, 80:80"
    elif echo "$NGINX_PORTS" | grep -q "443:443" && echo "$NGINX_PORTS" | grep -q "80:80"; then
        log_success "Порты nginx корректны (443:443, 80:80)"
    else
        log_warning "Порты nginx не найдены или неправильные"
    fi

    # Валидация синтаксиса
    if docker compose -f docker-compose.yml config > /dev/null 2>&1; then
        log_success "Синтаксис docker-compose.yml корректен"
    else
        log_error "docker-compose.yml содержит синтаксические ошибки"
    fi
fi
echo ""

# 2. Проверка запущенных контейнеров
echo "🐳 2. Проверка Docker контейнеров"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if ! docker ps > /dev/null 2>&1; then
    log_error "Docker не запущен или нет доступа"
else
    # Проверка 999-multibots
    if docker ps --format '{{.Names}}' | grep -q "999-multibots"; then
        log_success "Контейнер 999-multibots запущен"

        # Проверка uptime
        UPTIME=$(docker ps --format '{{.Names}}\t{{.Status}}' | grep 999-multibots | awk '{print $3, $4}')
        log_info "Uptime: $UPTIME"
    else
        log_error "Контейнер 999-multibots не запущен!"
    fi

    # Проверка bot-proxy
    if docker ps --format '{{.Names}}' | grep -q "bot-proxy"; then
        log_success "Контейнер bot-proxy запущен"

        # Проверка портов bot-proxy
        PROXY_PORTS=$(docker ps --format '{{.Names}}\t{{.Ports}}' | grep bot-proxy)

        if echo "$PROXY_PORTS" | grep -q "0.0.0.0:443->443/tcp" && echo "$PROXY_PORTS" | grep -q "0.0.0.0:80->80/tcp"; then
            log_success "Порты bot-proxy корректны (80, 443)"
        elif echo "$PROXY_PORTS" | grep -qE "(8443|8080)"; then
            log_error "bot-proxy использует нестандартные порты!"
            echo "  Текущие порты:"
            echo "$PROXY_PORTS" | sed 's/^/  /'
        else
            log_warning "Не удалось определить порты bot-proxy"
        fi
    else
        log_error "Контейнер bot-proxy не запущен!"
    fi
fi
echo ""

# 3. Проверка webhook endpoint
echo "🌐 3. Проверка webhook endpoint"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

WEBHOOK_URL="https://three-head-dragon.shop/api/video-callback/test"
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$WEBHOOK_URL" \
    -H 'Content-Type: application/json' \
    -d '{"test":"validation"}' \
    -k --max-time 10 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "202" ] || [ "$HTTP_CODE" = "200" ]; then
    log_success "Webhook endpoint доступен (HTTP $HTTP_CODE)"
else
    log_error "Webhook endpoint недоступен или неправильный ответ (HTTP $HTTP_CODE)"
    log_info "URL: $WEBHOOK_URL"
fi
echo ""

# 4. Проверка git статуса
echo "📦 4. Проверка git"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -d ".git" ]; then
    CURRENT_BRANCH=$(git branch --show-current)
    CURRENT_COMMIT=$(git log --oneline -1)

    log_info "Branch: $CURRENT_BRANCH"
    log_info "Commit: $CURRENT_COMMIT"

    # Проверка на uncommitted changes
    if git diff --quiet && git diff --cached --quiet; then
        log_success "Нет незакоммиченных изменений"
    else
        log_warning "Есть незакоммиченные изменения!"
        git status --short | sed 's/^/  /'
    fi
else
    log_warning "Не найдена .git директория"
fi
echo ""

# 5. Проверка .env файла
echo "🔐 5. Проверка переменных окружения"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f ".env" ]; then
    log_success ".env файл существует"

    # Проверка критических переменных
    REQUIRED_VARS=("BOT_TOKEN_1" "SUPABASE_URL" "KIE_AI_API_KEY")
    for var in "${REQUIRED_VARS[@]}"; do
        if grep -q "^${var}=" .env; then
            log_success "$var установлен"
        else
            log_warning "$var не найден в .env"
        fi
    done
else
    log_error ".env файл не найден!"
fi
echo ""

# Итоговый отчет
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 ИТОГОВЫЙ ОТЧЕТ"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ УСПЕШНО!${NC}"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠️  ЕСТЬ ПРЕДУПРЕЖДЕНИЯ: $WARNINGS${NC}"
    exit 0
else
    echo -e "${RED}❌ ОБНАРУЖЕНЫ ОШИБКИ: $ERRORS${NC}"
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}⚠️  И ПРЕДУПРЕЖДЕНИЯ: $WARNINGS${NC}"
    fi
    echo ""
    echo "📖 См. WEBHOOK_TROUBLESHOOTING.md для решения проблем"
    exit 1
fi
