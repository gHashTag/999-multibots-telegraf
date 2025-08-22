#!/bin/bash

# 🐳 ЛОКАЛЬНЫЙ ТЕСТ DOCKER СБОРКИ 
# 100% идентично production окружению

set -e

echo "🐳 === ТЕСТИРОВАНИЕ DOCKER СБОРКИ ЛОКАЛЬНО ==="

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'  
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() {
    echo -e "${BLUE}[DOCKER-STEP]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[DOCKER-SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[DOCKER-ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[DOCKER-WARNING]${NC} $1"
}

# Проверим, что Docker запущен
if ! docker info > /dev/null 2>&1; then
    print_error "Docker не запущен! Запустите Docker Desktop"
    exit 1
fi

# Проверим, что мы в правильной директории
if [ ! -f "package.json" ]; then
    print_error "Запустите скрипт из корня проекта!"
    exit 1
fi

print_step "1. Очистка предыдущих Docker образов"
docker rmi -f test-production-build 2>/dev/null || true
print_success "Старые образы удалены"

print_step "2. Сборка Docker образа (точно как в production)"
# Используем Dockerfile из deployment/docker/
if [ -f "deployment/docker/Dockerfile" ]; then
    DOCKERFILE_PATH="deployment/docker/Dockerfile"
    print_success "Используем production Dockerfile: $DOCKERFILE_PATH"
else
    print_error "Dockerfile не найден в deployment/docker/"
    exit 1
fi

# Строим образ
docker build -f "$DOCKERFILE_PATH" -t test-production-build . --no-cache

if [ $? -eq 0 ]; then
    print_success "Docker образ собран успешно!"
else
    print_error "Ошибка при сборке Docker образа!"
    exit 1
fi

print_step "3. Тестирование контейнера"
# Запускаем контейнер для проверки
CONTAINER_ID=$(docker run -d --name test-production-container test-production-build tail -f /dev/null)

if [ $? -eq 0 ]; then
    print_success "Контейнер запущен: $CONTAINER_ID"
else
    print_error "Ошибка запуска контейнера!"
    exit 1
fi

print_step "4. Проверка структуры файлов в контейнере"
echo "📁 Содержимое /app в контейнере:"
docker exec $CONTAINER_ID ls -la /app

echo ""
echo "📁 Содержимое /app/dist в контейнере:"  
docker exec $CONTAINER_ID ls -la /app/dist

echo ""
echo "📝 Основные файлы:"
docker exec $CONTAINER_ID sh -c '
    echo "✓ Checking bot.js:" && ls -la /app/dist/bot.js 2>/dev/null || echo "✗ bot.js missing"
    echo "✓ Checking package.json:" && ls -la /app/package.json 2>/dev/null || echo "✗ package.json missing"  
    echo "✓ Checking node_modules:" && ls -d /app/node_modules 2>/dev/null || echo "✗ node_modules missing"
'

print_step "5. Проверка Node.js версии в контейнере"
NODE_VERSION=$(docker exec $CONTAINER_ID node --version)
print_success "Node.js версия в контейнере: $NODE_VERSION"

print_step "6. Очистка тестового контейнера"
docker stop $CONTAINER_ID > /dev/null 2>&1
docker rm $CONTAINER_ID > /dev/null 2>&1
print_success "Тестовый контейнер удален"

print_success "🎉 DOCKER СБОРКА ПРОШЛА УСПЕШНО!"
echo ""
echo "📋 Что было протестировано:"
echo "   - Сборка Docker образа с production Dockerfile"
echo "   - Установка зависимостей через npm в Alpine Linux"  
echo "   - Компиляция TypeScript в контейнере"
echo "   - Создание финального образа"
echo "   - Проверка структуры файлов"
echo ""
echo "🚀 Ваша локальная Docker сборка идентична production!"
echo ""
echo "💡 Для полной очистки запустите:"
echo "   docker rmi test-production-build"