#!/bin/bash

# Остановить все текущие контейнеры
echo "🔄 Останавливаем текущие контейнеры..."
docker compose down

# Пересобрать образы и запустить ВСЕ сервисы
echo "🔨 Собираем и запускаем все сервисы..."
docker compose up --build -d

# Дожидаемся запуска (можно улучшить проверкой)
echo "⏳ Ждем запуска сервисов (15 секунд)..."
sleep 15

# Запустить Ansible Ping изнутри контейнера app
echo "🚀 Проверяем Ansible Ping из контейнера app..."
# Отключаем проверку ключа хоста и запускаем ping
docker exec 999-multibots /bin/sh -c "export ANSIBLE_HOST_KEY_CHECKING=False; . /opt/ansible-venv/bin/activate && ansible elestio_server -i inventory -m ping"

# Перезапустить nginx...
# echo "🔄 Перезапускаем nginx-proxy..."
# docker compose up -d --force-recreate nginx-proxy

echo "✅ Скрипт update-docker.sh (тест ping) завершен." 