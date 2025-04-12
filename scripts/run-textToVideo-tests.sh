#!/bin/bash

# Название скрипта и определение переменных
SCRIPT_NAME="run-textToVideo-tests.sh"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
LOG_DIR="logs"
LOG_FILE="$LOG_DIR/text-to-video-tests-$TIMESTAMP.log"

# Проверка и создание директории для логов
if [ ! -d "$LOG_DIR" ]; then
  mkdir -p "$LOG_DIR"
  echo "📁 Создана директория для логов: $LOG_DIR"
fi

# Функция для вывода сообщений с эмодзи
log_message() {
  echo "$1"
  echo "$1" >> "$LOG_FILE"
}

# Начало выполнения
log_message "🚀 Запуск тестов Text-to-Video $TIMESTAMP"
log_message "📝 Логи будут сохранены в файл $LOG_FILE"

# Устанавливаем переменную окружения для тестирования
export NODE_ENV=test

# Запуск тестов Text-to-Video
log_message "⚙️ Запуск тестов Text-to-Video через ts-node..."
npx ts-node src/test-utils/tests/neuro/text-to-video/index.ts | tee -a "$LOG_FILE"

# Проверка результата выполнения
RESULT=${PIPESTATUS[0]}
if [ $RESULT -eq 0 ]; then
  log_message "✅ Тесты Text-to-Video успешно выполнены"
else
  log_message "❌ Тесты Text-to-Video завершились с ошибкой (код $RESULT)"
  exit $RESULT
fi

# Запуск тестов Pulse для проверки отправки видео
log_message "⚙️ Запуск тестов Pulse для проверки отправки видео..."
npx ts-node src/test-utils/tests/pulse/pulseMediaTest.ts | tee -a "$LOG_FILE"

# Проверка результата выполнения
RESULT=${PIPESTATUS[0]}
if [ $RESULT -eq 0 ]; then
  log_message "✅ Тесты Pulse успешно выполнены"
else
  log_message "❌ Тесты Pulse завершились с ошибкой (код $RESULT)"
  exit $RESULT
fi

log_message "🏁 Выполнение скрипта $SCRIPT_NAME завершено $TIMESTAMP"
exit 0 