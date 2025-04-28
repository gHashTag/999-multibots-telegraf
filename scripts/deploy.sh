#!/bin/bash

# Script for deploying to remote server

SSH_KEY="~/.ssh/id_rsa"
SERVER="root@999-multibots-u14194.vm.elestio.app"
APP_DIR="/opt/app/999-multibots-telegraf"

echo "🚀 Подключаюсь к серверу и запускаю обновление..."
ssh -i $SSH_KEY $SERVER "cd $APP_DIR && git pull && chmod +x update-docker.sh && ./update-docker.sh"

echo "✅ Команда обновления отправлена на сервер!" 