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

# Запустить Ansible изнутри контейнера app
echo "🚀 Запускаем Ansible внутри контейнера app для конфигурации хоста..."
# Отключаем проверку ключа хоста и запускаем ansible-playbook
docker exec 999-multibots /bin/sh -c "export ANSIBLE_HOST_KEY_CHECKING=False; . /opt/ansible-venv/bin/activate && ansible-playbook playbook.yml -i inventory"

# Перезапустить nginx, чтобы он подхватил конфиги (если Ansible отработал)
echo "🔄 Перезапускаем nginx-proxy..."
docker compose restart nginx-proxy

echo "✅ Скрипт update-docker.sh завершен." 