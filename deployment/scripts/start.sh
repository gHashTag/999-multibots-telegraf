#!/bin/sh
set -e

echo "🔍 Проверка рабочей директории и файловой структуры..."
pwd
ls -la /app
ls -la /app/dist || echo "Директория dist не существует!"

# Создаем необходимые директории
echo "📁 Создание необходимых директорий..."
mkdir -p /app/logs
mkdir -p /app/dist/utils
mkdir -p /app/dist/helpers/error
mkdir -p /app/dist/interfaces
mkdir -p /app/dist/core/bot
mkdir -p /app/dist/core/supabase

# Проверяем наличие необходимых модулей
echo "📦 Проверка зависимостей..."
if [ ! -d "/app/node_modules" ]; then
  echo "⚠️ node_modules не найден. Устанавливаем зависимости..."
  npm install --omit=dev --no-package-lock --no-audit
else
  echo "✅ node_modules найден."
fi

# Проверяем существование файла bot.js
if [ ! -f "/app/dist/bot.js" ]; then
  echo "❌ Файл /app/dist/bot.js не найден. Сборка не удалась."
  echo "Содержимое директории dist:"
  ls -la /app/dist/
  exit 1
else
  echo "✅ Файл /app/dist/bot.js найден."
fi

# Проверка критических переменных окружения
echo "🔑 Проверка критических переменных окружения..."
if [ -z "$ORIGIN" ]; then
  echo "❌ Переменная ORIGIN не установлена. Используем значение по умолчанию."
  export ORIGIN=https://999-multibots-telegraf-u14194.vm.elestio.app
fi

if [ -z "$PORT" ]; then
  echo "❌ Переменная PORT не установлена. Используем значение по умолчанию."
  export PORT=2999
fi

echo "✅ Настройки сервера:"
echo "🌐 ORIGIN: $ORIGIN"
echo "🔌 PORT: $PORT"

# Запускаем node приложение
echo "🚀 Запуск приложения..."
cd /app
exec node dist/bot.js 