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
DATA="💾"

echo "${START} Запуск тестов платежной системы в Docker..."

# Проверка Docker
./scripts/check-docker.sh
if [ $? -ne 0 ]; then
    echo "${ERROR} Проверка Docker не пройдена"
    exit 1
fi

# Создание директории для логов если она не существует
mkdir -p logs
echo "${INFO} Директория для логов создана (если не существовала)"

# Создание временного каталога для тестовых данных
TEST_DATA_DIR="./test-data-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$TEST_DATA_DIR"
echo "${DATA} Создан временный каталог для тестовых данных: $TEST_DATA_DIR"

# Остановка и удаление существующих контейнеров
echo "${CLEAN} Останавливаю и удаляю существующие контейнеры..."
docker-compose -f docker-compose.test.yml down -v

# Сборка и запуск тестового окружения
echo "${BUILD} Собираю и запускаю тестовое окружение..."
docker-compose -f docker-compose.test.yml up --build -d

# Проверка, что контейнеры успешно запустились
if [ $? -ne 0 ]; then
    echo "${ERROR} Не удалось запустить тестовое окружение"
    # Очистка временных данных
    rm -rf "$TEST_DATA_DIR"
    exit 1
fi

# Ждем инициализации контейнеров
echo "${INFO} Ожидание инициализации контейнеров (10 секунд)..."
sleep 10

# Имя файла лога
LOG_FILE="logs/tests-$(date +%Y%m%d-%H%M%S).log"

# Вывод логов тестового контейнера
echo "${LOG} Вывод логов тестового контейнера (записываются в $LOG_FILE):"
docker logs -f neuro-blogger-telegram-bot-test | tee "$LOG_FILE"

# Получаем статус контейнера
TEST_EXIT_CODE=$(docker inspect --format='{{.State.ExitCode}}' neuro-blogger-telegram-bot-test)

# Останавливаем тестовое окружение
echo "${CLEAN} Останавливаю тестовое окружение..."
docker-compose -f docker-compose.test.yml down

# Очистка временных данных
echo "${CLEAN} Очистка временных тестовых данных..."
rm -rf "$TEST_DATA_DIR"

# Проверяем результат тестов
if [ "$TEST_EXIT_CODE" = "0" ]; then
    echo "${SUCCESS} ${END} Все тесты успешно выполнены! Код выхода: ${TEST_EXIT_CODE}"
    exit 0
else
    echo "${ERROR} ${END} Тесты завершились с ошибкой. Код выхода: ${TEST_EXIT_CODE}"
    echo "${INFO} Подробные логи доступны в: $LOG_FILE"
    exit 1
fi 