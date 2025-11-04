#!/bin/bash

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

echo ""
echo "=================================================================="
log_info "ПРОВЕРКА АРХИТЕКТУРЫ"
echo "=================================================================="
echo ""

# 1. Проверка .gitignore
log_info "1. Проверка .gitignore..."
if grep -q "\.env" .gitignore && grep -q "\.env\.local" .gitignore; then
    log_success ".env и .env.local игнорируются git"
else
    log_error ".env или .env.local могут быть закоммичены!"
fi

# 2. Проверка Docker network правила
log_info "2. Проверка Docker команды..."
if grep -q "\-\-network host" deploy.sh; then
    log_success "deploy.sh использует --network host"
else
    log_warning "deploy.sh может не использовать --network host"
fi

# 3. Проверка nginx конфигурации
log_info "3. Проверка nginx.conf..."
if [ -f "nginx/nginx.conf" ]; then
    if grep -q "proxy_pass http://127.0.0.1:3000" nginx/nginx.conf; then
        log_success "nginx.conf проксирует на 127.0.0.1:3000"
    else
        log_warning "nginx.conf может не проксировать правильно"
    fi
else
    log_warning "nginx/nginx.conf не найден"
fi

# 4. Проверка API сервера
log_info "4. Проверка API сервера..."
if grep -q "PORT = '3000'" src/api_server/index.ts; then
    log_success "API сервер настроен на порт 3000"
else
    log_warning "API сервер может быть не на порту 3000"
fi

# 5. Проверка webhook routes
log_info "5. Проверка webhook routes..."
if [ -f "src/api_server/routes/ai-reels-callback.routes.ts" ]; then
    log_success "Webhook routes файл существует"
else
    log_error "Webhook routes файл НЕ НАЙДЕН!"
fi

# 6. Проверка .env.example
log_info "6. Проверка .env.example..."
if [ -f ".env.example" ]; then
    log_success ".env.example существует (безопасный шаблон)"
else
    log_warning ".env.example не найден"
fi

# 7. Проверка тегов
log_info "7. Проверка тегов..."
if git tag | grep -q "v002"; then
    log_success "Тег v002 существует"
    git show v002 --oneline | head -1
else
    log_warning "Тег v002 не найден"
fi

# 8. Проверка .env.local
log_info "8. Проверка .env.local..."
if [ -f ".env.local" ]; then
    log_warning ".env.local существует (должен быть в .gitignore)"
    log_info "Содержит $(wc -l < .env.local) строк"
else
    log_info ".env.local не существует"
fi

# 9. Проверка документации
log_info "9. Проверка документации..."
DOCS_COUNT=$(ls -1 *.md 2>/dev/null | wc -l)
echo "Найдено .md файлов: $DOCS_COUNT"
if [ $DOCS_COUNT -gt 5 ]; then
    log_success "Достаточно документации"
else
    log_warning "Мало документации"
fi

# 10. Проверка последних коммитов
log_info "10. Последние коммиты..."
git log --oneline -3

echo ""
echo "=================================================================="
log_success "ПРОВЕРКА АРХИТЕКТУРЫ ЗАВЕРШЕНА"
echo "=================================================================="
echo ""

echo "Рекомендации:"
echo "1. Если есть ошибки - исправить"
echo "2. .env и .env.local НЕ КОММИТИТЬ"
echo "3. Всегда использовать --network host для Docker"
echo "4. Проксировать nginx на 127.0.0.1:3000"
echo "5. Проверять endpoint после деплоя"
echo ""
