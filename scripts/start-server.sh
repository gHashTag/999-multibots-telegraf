#!/bin/bash

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Функция для вывода сообщений
print_message() {
    local type=$1
    local message=$2
    case $type in
        "info")
            echo -e "${YELLOW}[INFO]${NC} $message"
            ;;
        "success")
            echo -e "${GREEN}[SUCCESS]${NC} $message"
            ;;
        "error")
            echo -e "${RED}[ERROR]${NC} $message"
            ;;
        "header")
            echo -e "\n${BLUE}=== $message ===${NC}\n"
            ;;
    esac
}

# Функция проверки статуса выполнения
check_status() {
    if [ $? -eq 0 ]; then
        print_message "success" "$1"
        return 0
    else
        print_message "error" "$2"
        return 1
    fi
}

print_message "header" "🚀 Запуск NeuroBlogger Server"

# Проверка наличия .env файла
if [ ! -f .env ]; then
    print_message "error" ".env файл не найден!"
    exit 1
fi

# Очистка предыдущей сборки
print_message "info" "Очистка предыдущей сборки..."
rm -rf dist/
check_status "Очистка завершена" "Ошибка при очистке" || exit 1

# Установка зависимостей
print_message "info" "Установка зависимостей..."
bun install
check_status "Зависимости установлены" "Ошибка при установке зависимостей" || exit 1

# Проверка TypeScript
print_message "info" "Проверка TypeScript..."
bun run typecheck
if [ $? -ne 0 ]; then
    print_message "info" "Пробуем использовать production конфигурацию..."
    bun run build:prod
    check_status "TypeScript проверка пройдена (prod)" "Ошибка при проверке TypeScript" || exit 1
else
    print_message "success" "TypeScript проверка пройдена"
fi

# Сборка проекта
print_message "info" "Сборка проекта..."
bun run build:prod
check_status "Проект собран успешно" "Ошибка при сборке проекта" || exit 1

# Проверка занятости порта
port=2999
if lsof -i :$port > /dev/null; then
    print_message "info" "Порт $port занят, освобождаем..."
    pid=$(lsof -t -i :$port)
    kill -9 $pid
    check_status "Порт освобожден" "Ошибка при освобождении порта"
fi

print_message "header" "🔄 Запуск сервера"

# Запуск сервера
print_message "info" "Запуск сервера..."

# Остановка всех процессов pm2 если есть
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true

if [ "$NODE_ENV" = "production" ]; then
    # Запуск в production режиме через pm2
    pm2 start dist/bot.js --name neuroblogger
else
    # Запуск в development режиме через nodemon
    NODE_ENV=development bun run dev &
    DEV_PID=$!
fi

# Ждем запуска сервера
print_message "info" "Ожидание запуска сервера..."
sleep 10

# Проверка работоспособности
print_message "header" "✅ Проверка работоспособности"

# Проверка что процесс запущен
if [ "$NODE_ENV" = "production" ]; then
    if ! pm2 pid neuroblogger > /dev/null; then
        print_message "error" "Процесс не запущен!"
        exit 1
    fi
else
    if ! ps -p $DEV_PID > /dev/null; then
        print_message "error" "Процесс не запущен!"
        exit 1
    fi
fi

# Проверка что порт слушается
if ! lsof -i :$port > /dev/null; then
    print_message "error" "Порт $port не прослушивается!"
    print_message "info" "Проверьте логи для деталей"
    exit 1
fi

# Проверка логов на ошибки
if [ -d "logs" ]; then
    if grep -i "error" logs/* > /dev/null; then
        print_message "error" "Найдены ошибки в логах!"
        print_message "info" "Проверьте логи командой: pm2 logs neuroblogger"
        exit 1
    fi
fi

print_message "header" "🎉 Сервер успешно запущен!"

print_message "info" "Полезные команды:"
echo -e "${YELLOW}Просмотр логов:${NC}    pm2 logs neuroblogger"
echo -e "${YELLOW}Статус сервера:${NC}    pm2 status"
echo -e "${YELLOW}Перезапуск:${NC}        pm2 restart neuroblogger"
echo -e "${YELLOW}Остановка:${NC}         pm2 stop neuroblogger"
echo -e "${YELLOW}Мониторинг:${NC}        pm2 monit"

print_message "info" "Сервер доступен на порту: $port" 