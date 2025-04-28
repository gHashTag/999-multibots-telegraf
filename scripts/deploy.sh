#!/bin/bash

# Script for deploying to remote server

SSH_KEY="~/.ssh/id_rsa"
SERVER="root@999-multibots-u14194.vm.elestio.app"
APP_DIR="/opt/app/999-multibots-telegraf"

echo "🚀 Подключаюсь к серверу и запускаю обновление..."
ssh -i $SSH_KEY $SERVER "cd $APP_DIR && git pull && chmod +x update-docker.sh && ./update-docker.sh"

<<<<<<< HEAD
echo "✅ Команда обновления отправлена на сервер!" 
=======
# Проверка наличия SSH ключа
if [ ! -f "$SSH_KEY" ]; then
  log "error" "SSH ключ не найден: $SSH_KEY"
  exit 1
fi

# Начинаем деплой
log "info" "Начинаем деплой на сервер: $SERVER_HOST"

# Шаг 1: Сборка проекта
log "info" "Шаг 1: Сборка проекта"
# pnpm build
bun run build
if [ $? -ne 0 ]; then
  log "error" "Ошибка сборки проекта"
  exit 1
fi
log "success" "Проект успешно собран"

# Шаг 2: Создание временной директории для файлов деплоя
log "info" "Шаг 2: Подготовка файлов для деплоя"
DEPLOY_DIR="deploy_tmp"
rm -rf $DEPLOY_DIR
mkdir -p $DEPLOY_DIR

# Копирование необходимых файлов
cp -r dist $DEPLOY_DIR/
cp docker-compose.*.yml $DEPLOY_DIR/
cp Dockerfile.* $DEPLOY_DIR/
cp bun.lockb $DEPLOY_DIR/
cp package.json $DEPLOY_DIR/
cp tsconfig.json $DEPLOY_DIR/

# Проверка наличия nginx директории
if [ -d "nginx" ]; then
  cp -r nginx $DEPLOY_DIR/
fi

# Создание архива
ARCHIVE_NAME="deploy.tar.gz"
tar -czf $ARCHIVE_NAME -C $DEPLOY_DIR .
if [ $? -ne 0 ]; then
  log "error" "Ошибка создания архива"
  rm -rf $DEPLOY_DIR
  exit 1
fi
log "success" "Файлы подготовлены и упакованы в архив: $ARCHIVE_NAME"

# Шаг 3: Копирование архива на сервер
log "info" "Шаг 3: Копирование файлов на сервер"
scp -i $SSH_KEY $ARCHIVE_NAME $SERVER_USER@$SERVER_HOST:$SERVER_PATH/
if [ $? -ne 0 ]; then
  log "error" "Ошибка копирования архива на сервер"
  rm -rf $DEPLOY_DIR $ARCHIVE_NAME
  exit 1
fi
log "success" "Архив успешно скопирован на сервер"

# Шаг 4: Распаковка архива на сервере
log "info" "Шаг 4: Распаковка архива на сервере"
ssh -i $SSH_KEY $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && tar -xzf $ARCHIVE_NAME && rm $ARCHIVE_NAME"
if [ $? -ne 0 ]; then
  log "error" "Ошибка распаковки архива на сервере"
  rm -rf $DEPLOY_DIR $ARCHIVE_NAME
  exit 1
fi
log "success" "Архив успешно распакован на сервере"

# Шаг 5: Запуск контейнеров на сервере
log "info" "Шаг 5: Запуск контейнеров на сервере"
ssh -i $SSH_KEY $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && docker-compose -f docker-compose.webhook.yml down && docker-compose -f docker-compose.webhook.yml up -d --build"
if [ $? -ne 0 ]; then
  log "error" "Ошибка запуска контейнеров на сервере"
  rm -rf $DEPLOY_DIR $ARCHIVE_NAME
  exit 1
fi
log "success" "Контейнеры успешно запущены на сервере"

# Очистка временных файлов
rm -rf $DEPLOY_DIR $ARCHIVE_NAME
log "info" "Временные файлы удалены"

# Деплой завершен
log "success" "Деплой успешно завершен"
log "info" "Проверьте статус контейнеров: ssh -i $SSH_KEY $SERVER_USER@$SERVER_HOST 'cd $SERVER_PATH && docker-compose -f docker-compose.webhook.yml ps'"
log "info" "Просмотр логов: ssh -i $SSH_KEY $SERVER_USER@$SERVER_HOST 'cd $SERVER_PATH && docker-compose -f docker-compose.webhook.yml logs -f'"

exit 0 
>>>>>>> origin/feat/vitest-integration
