#!/bin/bash

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Переменная для определения, нужно ли сохранять временные файлы
KEEP_TEMP=false

# Проверяем аргументы
for arg in "$@"
do
    if [ "$arg" == "--keep-temp" ] || [ "$arg" == "-k" ]; then
        KEEP_TEMP=true
        echo -e "${YELLOW}Временные файлы будут сохранены после выполнения тестов${NC}"
    fi
done

# Создаем временную директорию
TEMP_DIR="./temp_test_files"
mkdir -p $TEMP_DIR

echo -e "${YELLOW}Запуск тестов сцен...${NC}"

# Копируем основной файл запуска тестов
cp src/test-utils/runScenesTests.ts $TEMP_DIR/

# Создаем временный файл для запуска
cat > $TEMP_DIR/runTests.ts << EOL
import { runScenesTests } from './runScenesTests';

// Запуск всех тестов
(async () => {
  const results = await runScenesTests();
  
  // Вывод результатов
  console.log('\n\n==== РЕЗУЛЬТАТЫ ТЕСТОВ ====');
  
  let successful = 0;
  let failed = 0;
  
  results.forEach(result => {
    if (result.success) {
      console.log('✅ ' + result.name + ': ' + result.message);
      successful++;
    } else {
      console.log('❌ ' + result.name + ': ' + result.message);
      failed++;
    }
  });
  
  console.log('\n==== ИТОГИ ====');
  console.log('Всего тестов: ' + results.length);
  console.log('Успешно: ' + successful);
  console.log('Неудачно: ' + failed);
  
  // Завершаем процесс с соответствующим кодом возврата
  process.exit(failed > 0 ? 1 : 0);
})();
EOL

# Запускаем тесты с помощью ts-node с поддержкой ES модулей
echo -e "${YELLOW}Компиляция и запуск тестов...${NC}"
NODE_OPTIONS="--experimental-specifier-resolution=node" ts-node --esm $TEMP_DIR/runTests.ts

# Проверяем результат
if [ $? -eq 0 ]; then
    echo -e "${GREEN}Все тесты прошли успешно!${NC}"
    EXIT_CODE=0
else
    echo -e "${RED}Некоторые тесты завершились с ошибками.${NC}"
    EXIT_CODE=1
fi

# Удаляем временные файлы, если не нужно их сохранять
if [ "$KEEP_TEMP" = false ]; then
    echo -e "${YELLOW}Удаление временных файлов...${NC}"
    rm -rf $TEMP_DIR
else
    echo -e "${YELLOW}Временные файлы сохранены в директории: $TEMP_DIR${NC}"
fi

exit $EXIT_CODE 