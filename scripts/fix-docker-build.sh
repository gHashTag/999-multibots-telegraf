#!/bin/bash
set -e

echo "🔍 Проверка состояния проекта..."

# Проверяем текущую структуру проекта
if [ ! -f "tsconfig.json" ] || [ ! -f "package.json" ]; then
  echo "❌ Ошибка: отсутствуют базовые файлы проекта!"
  exit 1
fi

echo "📦 Создаем временную директорию и собираем необходимые файлы..."
mkdir -p temp_build
# Копируем исходники
cp -r src temp_build/
# Копируем конфигурационные файлы
cp package*.json tsconfig*.json temp_build/
cp -r scripts temp_build/

# Упаковываем
echo "📦 Архивируем проект..."
cd temp_build
tar -czf ../project.tar.gz .
cd ..

echo "🚀 Выгружаем на сервер..."
scp -i ~/.ssh/id_rsa project.tar.gz root@999-multibots-u14194.vm.elestio.app:/tmp/

echo "🔧 Настраиваем проект на сервере..."
ssh -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio.app "
echo '📂 Распаковываем проект на сервере...' &&
cd /app &&
mkdir -p /app/temp &&
tar -xzf /tmp/project.tar.gz -C /app/temp &&
echo '📝 Проверяем структуру загруженных файлов...' &&
ls -la /app/temp &&
echo '🏗️ Устанавливаем зависимости и собираем проект...' &&
cd /app/temp &&
npm install &&
npm run build:nocheck &&
echo '✅ Сборка успешно завершена!' &&
echo '📋 Проверяем структуру собранного проекта...' &&
ls -la dist &&
echo '🚚 Перемещаем собранные файлы...' &&
rm -rf /app/dist &&
mv dist /app/ &&
echo '🚀 Перезапускаем контейнеры...' &&
cd /app &&
docker-compose down &&
docker-compose up -d &&
echo '🧹 Очищаем временные файлы...' &&
rm -rf /app/temp /tmp/project.tar.gz
"

echo "🧹 Очищаем временные локальные файлы..."
rm -rf temp_build project.tar.gz

echo "✅ Процесс исправления завершен!" 