#!/bin/bash
set -e

echo "🔧 Начинаю исправление сборки..."

# Очищаем директорию dist
echo "🧹 Очистка директории dist..."
rm -rf dist

# Запускаем полную сборку с обработкой алиасов
echo "🛠️ Запуск полной сборки..."
npm run build

# Проверяем наличие bot.js
if [ ! -f "dist/bot.js" ]; then
  echo "❌ Ошибка: файл dist/bot.js не создан!"
  exit 1
fi

echo "✅ Файл dist/bot.js создан успешно!"

# Проверяем, что в bot.js нет алиасов @/
if grep -q "@/utils/launch" dist/bot.js; then
  echo "⚠️ Предупреждение: В файле dist/bot.js все еще есть алиасы @/!"
  echo "🔍 Исправляем алиасы вручную..."
  
  # Заменяем алиасы на относительные пути
  sed -i '' 's|@/utils/launch|./utils/launch|g' dist/bot.js
  
  echo "✅ Алиасы исправлены!"
fi

echo "📦 Архивируем собранные файлы..."
tar -czf dist.tar.gz dist

echo "🚀 Выгружаем на сервер..."
scp -i ~/.ssh/id_rsa dist.tar.gz root@999-multibots-u14194.vm.elestio.app:/tmp/

echo "📋 Установка на сервере..."
ssh -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio.app "
cd /app && 
rm -rf dist &&
tar -xzf /tmp/dist.tar.gz -C . &&
ls -la dist &&
echo '✅ Установка завершена! Перезапуск контейнера...' &&
docker-compose down &&
docker-compose up -d
"

echo "✅ Процесс исправления завершен!" 