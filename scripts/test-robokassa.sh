#!/bin/bash

# Эмодзи для логирования
INFO="ℹ️"
SUCCESS="✅"
ERROR="❌"
START="🚀"
END="🏁"
CLEAN="🧹"
BUILD="🔨"
TEST="🧪"
LOG="📋"
PAYMENT="💰"

echo "${START} Запуск тестов платежной системы Робокасса..."

# Проверка Docker
./scripts/check-docker.sh
if [ $? -ne 0 ]; then
    echo "${ERROR} Проверка Docker не пройдена"
    exit 1
fi

# Создание директории для логов если она не существует
LOGS_DIR="./logs/robokassa"
mkdir -p "$LOGS_DIR"
echo "${INFO} Директория для логов создана: $LOGS_DIR"

# Остановка и удаление существующих контейнеров
echo "${CLEAN} Останавливаю и удаляю существующие контейнеры..."
docker-compose -f docker-compose.test.yml down -v

# Устанавливаем переменные окружения для тестирования Робокассы
export TEST_PAYMENT_PROCESSOR=robokassa
export TEST_CATEGORY=ru-payment

# Сборка и запуск тестового окружения
echo "${BUILD} Собираю и запускаю тестовое окружение для Робокассы..."
docker-compose -f docker-compose.test.yml up --build -d

# Проверка, что контейнеры успешно запустились
if [ $? -ne 0 ]; then
    echo "${ERROR} Не удалось запустить тестовое окружение"
    exit 1
fi

# Ждем инициализации контейнеров
echo "${INFO} Ожидание инициализации контейнеров (10 секунд)..."
sleep 10

# Имя файла лога
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="$LOGS_DIR/robokassa-tests-$TIMESTAMP.log"

# Вывод логов тестового контейнера
echo "${LOG} ${PAYMENT} Запуск тестов платежной системы Робокасса (логи: $LOG_FILE):"
docker logs -f neuro-blogger-telegram-bot-test | tee "$LOG_FILE"

# Получаем статус контейнера
TEST_EXIT_CODE=$(docker inspect --format='{{.State.ExitCode}}' neuro-blogger-telegram-bot-test)

# Останавливаем тестовое окружение
echo "${CLEAN} Останавливаю тестовое окружение..."
docker-compose -f docker-compose.test.yml down

# Очистка переменных окружения
unset TEST_PAYMENT_PROCESSOR
unset TEST_CATEGORY

# Проверяем результат тестов
if [ "$TEST_EXIT_CODE" = "0" ]; then
    echo "${SUCCESS} ${END} Все тесты Робокассы успешно выполнены! Код выхода: ${TEST_EXIT_CODE}"
    echo "${INFO} Подробный отчет доступен в: $LOG_FILE"
    exit 0
else
    echo "${ERROR} ${END} Тесты Робокассы завершились с ошибкой. Код выхода: ${TEST_EXIT_CODE}"
    echo "${INFO} Подробные логи доступны в: $LOG_FILE"
    exit 1
fi 