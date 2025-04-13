#!/bin/bash

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Проверяем, передано ли имя теста
if [ $# -lt 1 ]; then
    echo -e "${RED}Ошибка: Пожалуйста укажите имя теста, например:${NC}"
    echo -e "${YELLOW}./run-test-scene-manual.sh textToVideoWizard${NC}"
    exit 1
fi

TEST_NAME=$1
KEEP_TEMP=false

# Проверяем дополнительные аргументы
for arg in "${@:2}"
do
    if [ "$arg" == "--keep-temp" ] || [ "$arg" == "-k" ]; then
        KEEP_TEMP=true
        echo -e "${YELLOW}Временные файлы будут сохранены после выполнения тестов${NC}"
    fi
done

# Проверяем существование файла теста
TEST_FILE="src/test-utils/tests/scenes/${TEST_NAME}.test.ts"
if [ ! -f "$TEST_FILE" ]; then
    echo -e "${RED}Ошибка: Файл теста $TEST_FILE не найден${NC}"
    
    # Показываем список доступных тестов
    echo -e "${YELLOW}Доступные тесты:${NC}"
    ls src/test-utils/tests/scenes/*.test.ts | sed 's/.*\/\(.*\)\.test\.ts/\1/'
    exit 1
fi

echo -e "${YELLOW}Запуск теста ${TEST_NAME}...${NC}"

# Создаем временный файл
TEMP_FILE=$(mktemp)
FUNC_NAME="run${TEST_NAME}Tests"

# Создаем временный скрипт, который импортирует нужную функцию и запускает её
cat > $TEMP_FILE << EOL
// Устанавливаем тестовое окружение
process.env.NODE_ENV = 'test';

import { $FUNC_NAME } from "./src/test-utils/tests/scenes/${TEST_NAME}.test";

async function runTests() {
    try {
        console.log("🧪 Запуск тестов для ${TEST_NAME}...");
        const results = await $FUNC_NAME();
        
        // Вывод результатов
        console.log("");
        console.log("==== РЕЗУЛЬТАТЫ ТЕСТОВ ====");
        
        let successCount = 0;
        let failCount = 0;
        
        results.forEach(result => {
            if (result.success) {
                console.log(\`✅ \${result.name}: \${result.message}\`);
                successCount++;
            } else {
                console.log(\`❌ \${result.name}: \${result.message}\`);
                failCount++;
            }
        });
        
        console.log("");
        console.log(\`📊 Всего тестов: \${results.length}, Успешно: \${successCount}, Ошибки: \${failCount}\`);
        
        process.exit(failCount > 0 ? 1 : 0);
    } catch (error) {
        console.error("❌ Ошибка при запуске тестов:", error);
        process.exit(1);
    }
}

runTests();
EOL

# Запускаем тесты напрямую с помощью ts-node, используя ES модули
echo -e "${YELLOW}Запуск теста ${TEST_NAME} с использованием ESM...${NC}"
NODE_OPTIONS="--experimental-specifier-resolution=node" npx tsx $TEMP_FILE

# Сохраняем код возврата
EXIT_CODE=$?

# Удаляем временный файл
if [ "$KEEP_TEMP" = false ]; then
    rm $TEMP_FILE
else
    echo -e "${YELLOW}Временный файл сохранен: $TEMP_FILE${NC}"
fi

# Выводим итоговый результат
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}Тесты успешно пройдены!${NC}"
else
    echo -e "${RED}Некоторые тесты завершились с ошибками.${NC}"
fi

exit $EXIT_CODE 