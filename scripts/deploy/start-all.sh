#!/bin/bash

# 🚀 Скрипт для запуска всех компонентов Vibee
# - Backend сервер (Express + Telegraf)
# - Expo мобильное приложение
# - Вебхуки работают через backend

set -e

echo "🎬 Запуск Vibee полной системы..."

# Проверяем зависимости
if ! command -v bun &> /dev/null; then
    echo "❌ Bun не установлен. Установите: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

# Цвета для вывода
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Функция для остановки всех процессов при выходе
cleanup() {
    echo -e "\n${YELLOW}🛑 Остановка всех процессов...${NC}"
    pkill -P $$
    exit 0
}

trap cleanup SIGINT SIGTERM

# Синхронизация окружения
echo -e "${BLUE}🔄 Синхронизация переменных окружения...${NC}"
./scripts/worktree-env-sync.sh

# Убиваем старые процессы на портах
echo -e "${BLUE}🧹 Очистка портов 2999, 3001, 8288, 19000, 19006...${NC}"
node scripts/kill-port.cjs 2999 3001 8288 19000 19006 || true
pkill -f 'bun.*src/index.ts' || true
pkill -f 'expo start' || true

# Установка зависимостей для mobile если нужно
if [ ! -d "mobile/node_modules" ]; then
    echo -e "${BLUE}📦 Установка зависимостей для мобильного приложения...${NC}"
    cd mobile && npm install && cd ..
fi

# Запуск backend сервера
echo -e "${GREEN}🚀 Запуск Backend сервера...${NC}"
bun --watch src/index.ts &
BACKEND_PID=$!

# Даем backend время запуститься
sleep 3

# Запуск Expo
echo -e "${GREEN}📱 Запуск Expo мобильного приложения...${NC}"
cd mobile
npm start &
EXPO_PID=$!
cd ..

echo -e "${GREEN}✅ Все сервисы запущены!${NC}"
echo ""
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${GREEN}📊 Статус сервисов:${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "🔹 Backend:         http://localhost:3001"
echo -e "🔹 API Server:      http://localhost:2999"
echo -e "🔹 Expo DevTools:   http://localhost:19002"
echo -e "🔹 Expo App:        exp://localhost:19000"
echo -e "🔹 Website:         https://three-head-dragon.shop"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}💡 Нажмите Ctrl+C для остановки всех сервисов${NC}"
echo ""

# Ждем завершения
wait
