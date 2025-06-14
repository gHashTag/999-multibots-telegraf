#!/bin/bash

# Скрипт для локального тестирования PR
# Использование: ./scripts/test-pr-local.sh [PR_NUMBER]

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Функция для вывода
log() {
  local type=$1
  local message=$2
  
  case $type in
    "info")
      echo -e "${BLUE}[INFO]${NC} $message"
      ;;
    "success")
      echo -e "${GREEN}[SUCCESS]${NC} $message"
      ;;
    "error")
      echo -e "${RED}[ERROR]${NC} $message"
      ;;
    "warning")
      echo -e "${YELLOW}[WARNING]${NC} $message"
      ;;
  esac
}

# Проверка аргументов
if [ $# -eq 0 ]; then
    log "error" "Укажите номер PR"
    echo "Использование: $0 [PR_NUMBER]"
    exit 1
fi

PR_NUMBER=$1
PR_PORT_BASE="4${PR_NUMBER}"

# Проверяем, что PR_NUMBER - это число
if ! [[ "$PR_NUMBER" =~ ^[0-9]+$ ]]; then
    log "error" "PR_NUMBER должен быть числом"
    exit 1
fi

log "info" "Запуск локального тестирования PR #${PR_NUMBER}"

# Проверка наличия .env файла
if [ ! -f ".env" ]; then
    log "error" "Файл .env не найден. Создайте его из example.env или скопируйте с сервера"
    exit 1
fi

# Создаем .env.pr если его нет
if [ ! -f ".env.pr" ]; then
    log "info" "Создаю .env.pr из .env"
    cp .env .env.pr
    
    # Добавляем PR-специфичные переменные
    echo "" >> .env.pr
    echo "# PR Test Environment" >> .env.pr
    echo "PR_NUMBER=${PR_NUMBER}" >> .env.pr
    echo "PR_PORT_BASE=${PR_PORT_BASE}" >> .env.pr
    echo "DOMAIN=localhost" >> .env.pr
    echo "WEBHOOK_BASE_URL=http://localhost:${PR_PORT_BASE}00" >> .env.pr
    echo "" >> .env.pr
    echo "# Используем основные токены для локального тестирования" >> .env.pr
    echo "PR_BOT_TOKEN_1=\${BOT_TOKEN_1}" >> .env.pr
    echo "PR_BOT_TOKEN_2=\${BOT_TOKEN_2}" >> .env.pr
    echo "PR_BOT_TOKEN_3=\${BOT_TOKEN_3}" >> .env.pr
    echo "PR_BOT_TOKEN_4=\${BOT_TOKEN_4}" >> .env.pr
    echo "PR_BOT_TOKEN_5=\${BOT_TOKEN_5}" >> .env.pr
    echo "PR_BOT_TOKEN_6=\${BOT_TOKEN_6}" >> .env.pr
    echo "PR_BOT_TOKEN_7=\${BOT_TOKEN_7}" >> .env.pr
    echo "PR_BOT_TOKEN_8=\${BOT_TOKEN_8}" >> .env.pr
    
    log "warning" "Для production используйте отдельные тестовые токены!"
fi

# Останавливаем старые контейнеры
log "info" "Останавливаю старые контейнеры PR #${PR_NUMBER}..."
docker-compose -f docker-compose.pr.yml -p pr-${PR_NUMBER} down

# Проверяем наличие Docker
if ! command -v docker &> /dev/null; then
    log "error" "Docker не установлен"
    exit 1
fi

# Проверяем наличие docker-compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    log "error" "Docker Compose не установлен"
    exit 1
fi

# Собираем проект
log "info" "Собираю проект..."
if command -v npm &> /dev/null; then
    npm run build || {
        log "error" "Ошибка сборки проекта через npm"
        exit 1
    }
elif command -v pnpm &> /dev/null; then
    pnpm build || {
        log "error" "Ошибка сборки проекта через pnpm"
        exit 1
    }
else
    log "warning" "npm/pnpm не найдены, пропускаю сборку"
fi

# Запускаем контейнеры
log "info" "Запускаю контейнеры для PR #${PR_NUMBER}..."
export PR_NUMBER=${PR_NUMBER}
export PR_PORT_BASE=${PR_PORT_BASE}

if command -v docker-compose &> /dev/null; then
    docker-compose -f docker-compose.pr.yml -p pr-${PR_NUMBER} up -d --build
else
    docker compose -f docker-compose.pr.yml -p pr-${PR_NUMBER} up -d --build
fi

# Ждем запуска
log "info" "Жду запуска сервисов..."
sleep 10

# Проверяем статус
log "info" "Проверяю статус контейнеров..."
if command -v docker-compose &> /dev/null; then
    docker-compose -f docker-compose.pr.yml -p pr-${PR_NUMBER} ps
else
    docker compose -f docker-compose.pr.yml -p pr-${PR_NUMBER} ps
fi

# Выводим информацию о доступе
log "success" "PR #${PR_NUMBER} запущен локально!"
echo ""
echo "🚀 Доступ к сервисам:"
echo "   - API: http://localhost:${PR_PORT_BASE}99"
echo "   - Bot 1 webhook: http://localhost:${PR_PORT_BASE}00"
echo "   - Bot 2 webhook: http://localhost:${PR_PORT_BASE}01"
echo "   - И так далее..."
echo ""
echo "📝 Полезные команды:"
echo "   - Логи: docker-compose -f docker-compose.pr.yml -p pr-${PR_NUMBER} logs -f"
echo "   - Стоп: docker-compose -f docker-compose.pr.yml -p pr-${PR_NUMBER} down"
echo "   - Рестарт: docker-compose -f docker-compose.pr.yml -p pr-${PR_NUMBER} restart"
echo ""
echo "🔗 Для тестирования вебхуков используйте ngrok:"
echo "   ngrok http ${PR_PORT_BASE}00"
echo "   Затем установите webhook URL в Telegram для ваших ботов"
echo ""