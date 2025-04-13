#!/bin/bash

# Название скрипта и определение переменных
SCRIPT_NAME="run-textToVideoWizard-test.sh"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
LOG_DIR="logs"
LOG_FILE="$LOG_DIR/textToVideoWizard-tests-$TIMESTAMP.log"
TEMP_DIR="temp-test-dir"

# Проверка и создание директории для логов
if [ ! -d "$LOG_DIR" ]; then
  mkdir -p "$LOG_DIR"
  echo "📁 Создана директория для логов: $LOG_DIR"
fi

# Проверка и создание временной директории
if [ ! -d "$TEMP_DIR" ]; then
  mkdir -p "$TEMP_DIR"
  echo "📁 Создана временная директория: $TEMP_DIR"
fi

# Функция для вывода сообщений с эмодзи
log_message() {
  echo "$1"
  echo "$1" >> "$LOG_FILE"
}

# Начало выполнения
log_message "🚀 Запуск тестов textToVideoWizard $TIMESTAMP"
log_message "📝 Логи будут сохранены в файл $LOG_FILE"

# Устанавливаем переменную окружения для тестирования
export NODE_ENV=test

# Создаем временный файл для запуска тестов
cat > "$TEMP_DIR/runner.js" << EOF
const path = require('path');
process.env.NODE_ENV = 'test';

// Регистрируем ts-node для работы с TypeScript
require('ts-node').register({
  transpileOnly: true
});

// Для импортов с @ (изменяем import paths)
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function(request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    const newRequest = path.resolve(__dirname, '../src', request.substr(2));
    return originalResolveFilename.call(this, newRequest, parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// Загружаем и запускаем тесты
async function runTests() {
  try {
    log("🧪 Запуск тестов textToVideoWizard...");
    const { runTextToVideoWizardTests } = require('../src/test-utils/tests/scenes/textToVideoWizard.test.ts');
    
    if (!runTextToVideoWizardTests || typeof runTextToVideoWizardTests !== 'function') {
      throw new Error("Функция runTextToVideoWizardTests не найдена или не является функцией");
    }
    
    const results = await runTextToVideoWizardTests();
    
    // Выводим результаты
    log("\n📊 Результаты тестирования:");
    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;
    
    log(\`Всего: \${results.length}, Успешно: \${successCount}, Ошибки: \${failCount}\`);
    
    results.forEach(result => {
      log(\`\${result.success ? '✅' : '❌'} \${result.name}: \${result.message}\`);
    });
    
    if (failCount > 0) {
      log('❌ Обнаружены ошибки в тестах');
      process.exit(1);
    } else {
      log('✅ Все тесты успешно пройдены!');
      process.exit(0);
    }
  } catch (error) {
    log('❌ Ошибка при запуске тестов: ' + error);
    console.error(error);
    process.exit(1);
  }
}

function log(message) {
  console.log(message);
}

runTests();
EOF

log_message "✅ Создан файл запуска тестов runner.js"

# Запуск тестов
log_message "⚙️ Запуск тестов textToVideoWizard..."
cd "$TEMP_DIR" && node runner.js | tee -a "../$LOG_FILE"

# Проверка результата выполнения
RESULT=${PIPESTATUS[0]}
cd ..
if [ $RESULT -eq 0 ]; then
  log_message "✅ Тесты textToVideoWizard успешно выполнены"
else
  log_message "❌ Тесты textToVideoWizard завершились с ошибкой (код $RESULT)"
fi

# Очистка временной директории
log_message "🧹 Очистка временных файлов..."
rm -rf "$TEMP_DIR"
log_message "✅ Временные файлы удалены"

log_message "🏁 Выполнение скрипта $SCRIPT_NAME завершено $TIMESTAMP"
exit $RESULT 