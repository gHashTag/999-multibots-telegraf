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

# Проверяем наличие модуля dotenv и устанавливаем его если нет
echo "📦 Проверка наличия модуля dotenv..."
if [ ! -d "/app/node_modules/dotenv" ]; then
  echo "⚠️ Модуль dotenv не найден. Устанавливаем..."
  cd /app && npm install dotenv --save
else
  echo "✅ Модуль dotenv найден."
fi

# Проверяем наличие необходимых модулей
echo "📦 Проверка наличия модуля winston..."
if [ ! -d "/app/node_modules/winston" ]; then
  echo "⚠️ Модуль winston не найден. Устанавливаем..."
  cd /app && npm install winston --save
else
  echo "✅ Модуль winston найден."
fi

# Проверяем существование и создаем .env файл если его нет
if [ ! -f "/app/.env" ]; then
  echo "⚠️ Файл .env не найден. Создаем базовый .env файл..."
  cat > /app/.env << EOF
# Базовый .env файл, созданный автоматически
NODE_ENV=production
DEBUG=true
DOCKER_ENVIRONMENT=true

# Базовые настройки
LOG_FORMAT=combined
ADMIN_IDS=144022504,1254048880,352374518,1852726961

# Замените эти значения реальными токенами в docker-compose.yml
BOT_TOKEN_1=REPLACE_WITH_REAL_TOKEN_1
BOT_TOKEN_2=REPLACE_WITH_REAL_TOKEN_2
BOT_TOKEN_3=REPLACE_WITH_REAL_TOKEN_3
BOT_TOKEN_4=REPLACE_WITH_REAL_TOKEN_4
BOT_TOKEN_5=REPLACE_WITH_REAL_TOKEN_5
BOT_TOKEN_6=REPLACE_WITH_REAL_TOKEN_6
BOT_TOKEN_7=REPLACE_WITH_REAL_TOKEN_7
BOT_TOKEN_8=REPLACE_WITH_REAL_TOKEN_8

# Другие настройки
ORIGIN=https://999-multibots-telegraf-u14194.vm.elestio.app
SECRET_KEY=REPLACE_WITH_PRODUCTION_SECRET_KEY
EOF
  echo "✅ Базовый .env файл создан. Обязательно обновите настоящие токены через переменные окружения."
else
  echo "✅ Файл .env найден."
fi

# Проверяем существование файла bot.js
if [ ! -f "/app/dist/bot.js" ]; then
  echo "❌ Файл /app/dist/bot.js не найден. Выполняем сборку..."
  cd /app && npm run build
  
  # Проверяем снова
  if [ ! -f "/app/dist/bot.js" ]; then
    echo "❌ Критическая ошибка: Не удалось создать файл bot.js. Проверяем содержимое директории dist:"
    ls -la /app/dist/
    echo "Содержимое src директории:"
    ls -la /app/src/
  fi
else
  echo "✅ Файл /app/dist/bot.js найден."
fi

# Проверяем наличие токенов ботов
echo "Bot tokens check in ENV:"
echo "BOT_TOKEN_1 exists: $([ ! -z "$BOT_TOKEN_1" ] && echo "true" || echo "false")"
echo "BOT_TOKEN_2 exists: $([ ! -z "$BOT_TOKEN_2" ] && echo "true" || echo "false")"
echo "BOT_TOKEN_3 exists: $([ ! -z "$BOT_TOKEN_3" ] && echo "true" || echo "false")"
echo "BOT_TOKEN_4 exists: $([ ! -z "$BOT_TOKEN_4" ] && echo "true" || echo "false")"
echo "BOT_TOKEN_5 exists: $([ ! -z "$BOT_TOKEN_5" ] && echo "true" || echo "false")"
echo "BOT_TOKEN_6 exists: $([ ! -z "$BOT_TOKEN_6" ] && echo "true" || echo "false")"
echo "BOT_TOKEN_7 exists: $([ ! -z "$BOT_TOKEN_7" ] && echo "true" || echo "false")"
echo "BOT_TOKEN_8 exists: $([ ! -z "$BOT_TOKEN_8" ] && echo "true" || echo "false")"
echo "BOT_TOKEN_9 exists: $([ ! -z "$BOT_TOKEN_9" ] && echo "true" || echo "false")"

# Выводим переменные окружения (без значений, только имена) для диагностики
echo "🔧 Проверка настроенных переменных окружения:"
env | grep -v "TOKEN\|KEY\|SECRET" | cut -d= -f1 | sort

# Запускаем node приложение
echo "🚀 Запуск приложения..."
cd /app
ls -la /app/dist
exec "$@" 