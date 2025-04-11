#!/bin/bash

# Скрипт для запуска тестов аватар-ботов

# Устанавливаем переменную окружения NODE_ENV в 'test'
export NODE_ENV=test

# Текущая дата и время для имени файла логов
timestamp=$(date +"%Y%m%d_%H%M%S")
log_file="logs/avatar-bot-tests-${timestamp}.log"

# Создаем директорию для логов, если она не существует
mkdir -p logs

echo "🚀 Запуск тестов аватар-ботов..."

# Запускаем тесты аватар-ботов и записываем вывод в лог-файл
npx ts-node -r tsconfig-paths/register src/test-utils/runAvatarBotTests.ts | tee "${log_file}"

# Проверяем результат выполнения команды 
# (PIPESTATUS[0] - результат первой команды в пайпе)
result=${PIPESTATUS[0]}

# В зависимости от результата выводим сообщение
if [ $result -eq 0 ]; then
  echo "✅ Тесты аватар-ботов успешно выполнены"
else
  echo "❌ Ошибка при выполнении тестов аватар-ботов. Код ошибки: $result"
  echo "📋 Подробности смотрите в файле: ${log_file}"
fi

# Возвращаем код результата выполнения тестов
exit $result 