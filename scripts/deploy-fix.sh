#!/bin/bash

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Конфигурация
SERVER_USER="root"
SERVER_HOST="999-multibots-u14194.vm.elestio.app"
SERVER_PATH="/opt/app/999-multibots-telegraf"
SSH_KEY="$HOME/.ssh/id_rsa"

# Функция для форматированного вывода
log() {
  local type=$1
  local message=$2
  
  case $type in
    "info")
      echo -e "${BLUE}[INFO]${NC} $message"
      ;;
    "success")
      echo -e "${GREEN}[SUCCESS]${NC} $message"
      ;;
    "error")
      echo -e "${RED}[ERROR]${NC} $message"
      ;;
    "warning")
      echo -e "${YELLOW}[WARNING]${NC} $message"
      ;;
    *)
      echo -e "$message"
      ;;
  esac
}

# Проверка наличия SSH ключа
if [ ! -f "$SSH_KEY" ]; then
  log "error" "SSH ключ не найден: $SSH_KEY"
  exit 1
fi

# Начинаем деплой
log "info" "Начинаем исправление проблемы на сервере: $SERVER_HOST"

# Шаг 1: Сборка проекта с пропуском проверки типов (nocheck)
log "info" "Шаг 1: Сборка проекта без проверки типов"
pnpm build:nocheck
if [ $? -ne 0 ]; then
  log "error" "Ошибка сборки проекта"
  exit 1
fi
log "success" "Проект успешно собран"

# Шаг 1.1: Проверяем сборку
log "info" "Проверка наличия файла bot.js"
if [ ! -f "dist/bot.js" ]; then
  log "error" "Файл dist/bot.js не найден после сборки!"
  exit 1
fi
log "success" "Файл dist/bot.js успешно создан"

# Шаг 2: Создание временной директории для файлов деплоя
log "info" "Шаг 2: Подготовка файлов для деплоя"
DEPLOY_DIR="deploy_tmp"
rm -rf $DEPLOY_DIR
mkdir -p $DEPLOY_DIR

# Копирование необходимых файлов
cp -r dist $DEPLOY_DIR/
cp docker-compose.yml $DEPLOY_DIR/
cp Dockerfile $DEPLOY_DIR/
cp package.json $DEPLOY_DIR/
cp -r scripts $DEPLOY_DIR/
cp tsconfig.json $DEPLOY_DIR/
cp tsconfig.prod.json $DEPLOY_DIR/

# Проверка наличия nginx директории
if [ -d "nginx-config" ]; then
  cp -r nginx-config $DEPLOY_DIR/
fi

# Шаг 2.1: Создаем необходимые директории если их нет
log "info" "Создание необходимых директорий"
mkdir -p $DEPLOY_DIR/dist/utils
mkdir -p $DEPLOY_DIR/dist/core/bot
mkdir -p $DEPLOY_DIR/dist/core/supabase

# Создание архива
ARCHIVE_NAME="deploy-fix.tar.gz"
tar -czf $ARCHIVE_NAME -C $DEPLOY_DIR .
if [ $? -ne 0 ]; then
  log "error" "Ошибка создания архива"
  rm -rf $DEPLOY_DIR
  exit 1
fi
log "success" "Файлы подготовлены и упакованы в архив: $ARCHIVE_NAME"

# Шаг 3: Копирование архива на сервер
log "info" "Шаг 3: Копирование файлов на сервер"
scp -i $SSH_KEY $ARCHIVE_NAME $SERVER_USER@$SERVER_HOST:/tmp/
if [ $? -ne 0 ]; then
  log "error" "Ошибка копирования архива на сервер"
  rm -rf $DEPLOY_DIR $ARCHIVE_NAME
  exit 1
fi
log "success" "Архив успешно скопирован на сервер"

# Шаг 4: Распаковка архива на сервере в заданную директорию
log "info" "Шаг 4: Распаковка архива на сервере в /app"
ssh -i $SSH_KEY $SERVER_USER@$SERVER_HOST "cd /app && tar -xzf /tmp/$ARCHIVE_NAME && rm /tmp/$ARCHIVE_NAME"
if [ $? -ne 0 ]; then
  log "error" "Ошибка распаковки архива на сервере"
  rm -rf $DEPLOY_DIR $ARCHIVE_NAME
  exit 1
fi
log "success" "Архив успешно распакован на сервере в директорию /app"

# Шаг 5: Проверка структуры директории
log "info" "Шаг 5: Проверка структуры директории на сервере"
ssh -i $SSH_KEY $SERVER_USER@$SERVER_HOST "ls -la /app/dist"
if [ $? -ne 0 ]; then
  log "error" "Ошибка при проверке структуры директории"
  rm -rf $DEPLOY_DIR $ARCHIVE_NAME
  exit 1
fi
log "success" "Структура директории проверена"

# Шаг 6: Перезапуск контейнеров
log "info" "Шаг 6: Перезапуск контейнеров на сервере"
ssh -i $SSH_KEY $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && docker-compose down && docker-compose up -d --build"
if [ $? -ne 0 ]; then
  log "error" "Ошибка при перезапуске контейнеров"
  rm -rf $DEPLOY_DIR $ARCHIVE_NAME
  exit 1
fi
log "success" "Контейнеры успешно перезапущены"

# Очистка временных файлов
rm -rf $DEPLOY_DIR $ARCHIVE_NAME
log "info" "Временные файлы удалены"

# Деплой завершен
log "success" "Исправление успешно завершено"
log "info" "Проверьте статус контейнеров: ssh -i $SSH_KEY $SERVER_USER@$SERVER_HOST 'cd $SERVER_PATH && docker-compose ps'"
log "info" "Просмотр логов: ssh -i $SSH_KEY $SERVER_USER@$SERVER_HOST 'cd $SERVER_PATH && docker-compose logs -f'"

exit 0 