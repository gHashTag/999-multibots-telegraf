#!/bin/bash

# Эмодзи для логирования
INFO="ℹ️ "
SUCCESS="✅ "
ERROR="❌ "
START="🚀 "
END="🏁 "
DEBUG="🔍 "

# Проверка параметров командной строки
if [ $# -eq 0 ]; then
    TEST_CATEGORY="payment-processor"
    echo "${INFO} Категория тестов не указана, используется значение по умолчанию: ${TEST_CATEGORY}"
else
    TEST_CATEGORY="$1"
    echo "${INFO} Запуск тестов категории: ${TEST_CATEGORY}"
fi

# Создание директории для логов
mkdir -p logs
echo "${INFO} Директория для логов создана/проверена"

# Остановка предыдущих контейнеров
echo "${START} Останавливаем существующие контейнеры..."
docker-compose -f docker-compose.test.yml down -v

# Модификация команды в docker-compose.test.yml для запуска нужных тестов
echo "${DEBUG} Настройка окружения для тестов категории: ${TEST_CATEGORY}"
ORIGINAL_COMMAND="command:.*"
NEW_COMMAND="command: [\"npm\", \"run\", \"test:${TEST_CATEGORY}\"]  # Автоматически запускать тесты выбранной категории"
sed -i.bak "s|${ORIGINAL_COMMAND}|${NEW_COMMAND}|g" docker-compose.test.yml

# Запуск тестовой среды
echo "${START} Запускаем тестовую среду..."
docker-compose -f docker-compose.test.yml up --build -d

# Проверка успешного запуска контейнеров
if [ $? -ne 0 ]; then
    echo "${ERROR} Не удалось запустить тестовое окружение"
    exit 1
fi

echo "${INFO} Ожидаем инициализации контейнеров..."
sleep 5

# Вывод логов контейнера в реальном времени
echo "${INFO} Вывод логов тестового контейнера:"
docker logs -f neuro-blogger-telegram-bot-test | tee logs/test-${TEST_CATEGORY}.log || true

# Получение статуса выполнения тестов
TEST_EXIT_CODE=$(docker inspect --format='{{.State.ExitCode}}' neuro-blogger-telegram-bot-test)

# Остановка тестовой среды
echo "${END} Останавливаем тестовую среду..."
docker-compose -f docker-compose.test.yml down -v

# Восстановление исходного файла docker-compose.test.yml
mv docker-compose.test.yml.bak docker-compose.test.yml

# Проверка результатов тестов
if [ "$TEST_EXIT_CODE" -eq 0 ]; then
    echo "${SUCCESS} Тесты категории '${TEST_CATEGORY}' успешно пройдены!"
    exit 0
else
    echo "${ERROR} Тесты категории '${TEST_CATEGORY}' завершились с ошибками. Код: ${TEST_EXIT_CODE}"
    echo "${INFO} Для деталей проверьте файл logs/test-${TEST_CATEGORY}.log"
    exit $TEST_EXIT_CODE
fi 