#!/bin/bash

# Остановить все текущие контейнеры
echo "🔄 Останавливаем текущие контейнеры..."
docker compose down

# Пересобрать и запустить ТОЛЬКО сервис app (с Ansible внутри)
echo "🔨 Собираем и запускаем сервис app..."
docker compose up --build -d app

# Дожидаемся запуска app (простая пауза, можно улучшить проверкой)
echo "⏳ Ждем запуска app (10 секунд)..."
sleep 10

# Запустить Ansible изнутри контейнера app
echo "🚀 Запускаем Ansible внутри контейнера app..."
# Активируем venv и запускаем ansible-playbook
docker exec 999-multibots /bin/sh -c ". /opt/ansible-venv/bin/activate && ansible-playbook playbook.yml -i inventory"

# Перезапустить nginx, чтобы он подхватил конфиги (если Ansible отработал)
echo "🔄 Перезапускаем nginx-proxy..."
docker compose restart nginx-proxy

echo "✅ Скрипт update-docker.sh завершен." 