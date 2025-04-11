#!/bin/bash

# Название скрипта и определение переменных
SCRIPT_NAME="run-pulse-tests.sh"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
LOG_DIR="logs"
LOG_FILE="$LOG_DIR/pulse-tests-$TIMESTAMP.log"

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
log_message "🚀 Запуск тестов Pulse медиа $TIMESTAMP"
log_message "📝 Логи будут сохранены в файл $LOG_FILE"

# Устанавливаем переменную окружения для тестирования
export NODE_ENV=test

# Запуск тестов
log_message "⚙️ Запуск тестов Pulse через ts-node..."
npx ts-node src/test-utils/runPulseMediaTests.ts | tee -a "$LOG_FILE"

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