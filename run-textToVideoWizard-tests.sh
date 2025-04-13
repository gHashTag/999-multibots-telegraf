#!/bin/bash

# Название скрипта и определение переменных
SCRIPT_NAME="run-textToVideoWizard-tests.sh"
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

# Функция для конвертации импортов из ESM в CommonJS
convert_to_commonjs() {
  local file="$1"
  local output="$2"
  
  # Создаем директорию для выходного файла, если она не существует
  mkdir -p "$(dirname "$output")"
  
  # Преобразуем ESM импорты в CommonJS
  sed 's/import \(.*\) from \(.*\);/const \1 = require(\2);/g' "$file" > "$output"
  
  log_message "🔄 Преобразован файл $file в CommonJS формат"
}

# Начало выполнения
log_message "🚀 Запуск тестов textToVideoWizard $TIMESTAMP"
log_message "📝 Логи будут сохранены в файл $LOG_FILE"

# Устанавливаем переменную окружения для тестирования
export NODE_ENV=test

# Копируем и конвертируем необходимые файлы для тестов
log_message "📋 Подготовка файлов тестов..."

# Создаем временный файл tsconfig.json для тестов
cat > "$TEMP_DIR/tsconfig.json" << EOF
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "module": "commonjs",
    "esModuleInterop": true,
    "paths": {
      "@/*": ["../src/*"]
    }
  }
}
EOF

log_message "✅ Создан временный tsconfig.json с настройкой module=commonjs"

# Копируем файл теста во временную директорию
cp src/test-utils/tests/scenes/textToVideoWizard.test.ts "$TEMP_DIR/"
log_message "✅ Файл теста скопирован во временную директорию"

# Создаем простой runner для тестов
cat > "$TEMP_DIR/run-test.js" << EOF
const path = require('path');
process.env.NODE_ENV = 'test';

// Регистрируем ts-node с опцией для CommonJS
require('ts-node').register({
  project: path.join(__dirname, 'tsconfig.json'),
  transpileOnly: true
});

// Регистрируем aliases для путей
require('tsconfig-paths').register({
  baseUrl: path.join(__dirname, '..'),
  paths: { 
    '@/*': ['src/*'] 
  }
});

// Загружаем и запускаем тесты
async function runTests() {
  try {
    const { runTextToVideoWizardTests } = require('./textToVideoWizard.test.ts');
    const results = await runTextToVideoWizardTests();
    
    // Выводим результаты
    console.log('\\n📊 Результаты тестирования:');
    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;
    
    console.log(\`Всего: \${results.length}, Успешно: \${successCount}, Ошибки: \${failCount}\`);
    
    if (failCount > 0) {
      console.log('❌ Обнаружены ошибки в следующих тестах:');
      results.filter(r => !r.success).forEach(result => {
        console.log(\`   - \${result.name}: \${result.message}\`);
      });
      process.exit(1);
    } else {
      console.log('✅ Все тесты успешно пройдены!');
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Ошибка при запуске тестов:', error);
    process.exit(1);
  }
}

runTests();
EOF

log_message "✅ Создан файл запуска тестов run-test.js"

# Запуск тестов
log_message "⚙️ Запуск тестов textToVideoWizard..."
node "$TEMP_DIR/run-test.js" | tee -a "$LOG_FILE"

# Проверка результата выполнения
RESULT=${PIPESTATUS[0]}
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