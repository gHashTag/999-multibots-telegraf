#!/bin/bash

# Сначала создаем директорию dist если её нет
mkdir -p dist

# Запустить компиляцию
npm run build

# Проверить файл dist/config/index.js и заменить неправильный путь к логгеру
# Заменяем '../src/utils/logger' на '../utils/logger'
find dist -type f -name "*.js" -exec sed -i 's/\.\.\/src\/utils\/logger/\.\.\/utils\/logger/g' {} \;

# Заменяем any Logger as logger на просто logger
find dist -type f -name "*.js" -exec sed -i 's/Logger as logger/logger/g' {} \;

echo "✅ Пути импорта успешно исправлены." 