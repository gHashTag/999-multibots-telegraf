#!/bin/bash

# Сначала создаем директорию dist если её нет
mkdir -p dist

# Запустить компиляцию
echo "🚀 Запуск компиляции TypeScript..."
npm run build

echo "🔍 Поиск проблемных импортов в скомпилированных файлах..."

# Поиск файлов с проблемным импортом
echo "Файлы с импортом '../src/utils/logger':"
grep -r "../src/utils/logger" dist/ || echo "Не найдено"

# Проверить файл dist/config/index.js и показать текущее содержимое
if [ -f "dist/config/index.js" ]; then
  echo "📄 Содержимое dist/config/index.js до исправления:"
  head -n 20 dist/config/index.js

  # Заменяем '../src/utils/logger' на '../utils/logger'
  echo "✏️ Исправление путей импорта..."
  sed -i 's/\.\.\/src\/utils\/logger/\.\.\/utils\/logger/g' dist/config/index.js
  
  echo "📄 Содержимое dist/config/index.js после исправления:"
  head -n 20 dist/config/index.js
else
  echo "❌ Файл dist/config/index.js не найден!"
fi

# Заменяем 'Logger as logger' на просто 'logger'
echo "✏️ Исправление импортов Logger..."
find dist -type f -name "*.js" -exec sed -i 's/Logger as logger/logger/g' {} \;

# Заменяем относительные пути более глобально
echo "✏️ Глобальное исправление путей импорта..."
find dist -type f -name "*.js" -exec sed -i 's/\.\.\/src\//\.\.\//g' {} \;

echo "✏️ Проверка структуры каталогов dist:"
find dist -type d | sort

echo "✅ Пути импорта успешно исправлены." 