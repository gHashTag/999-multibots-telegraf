#!/bin/bash

# Остановить все текущие контейнеры
echo "🔄 Останавливаем текущие контейнеры..."
docker compose down

# Пересобрать образы и запустить ВСЕ сервисы (включая app с Ansible)
echo "🔨 Собираем и запускаем все сервисы..."
docker compose up --build -d

# Дожидаемся запуска (можно улучшить проверкой)
echo "⏳ Ждем запуска контейнера app (10 секунд)..."
sleep 10

# Запустить Ansible изнутри контейнера app
echo "🔧 Запускаем Ansible внутри контейнера app для генерации конфигов Nginx в volume..."
docker exec -e ANSIBLE_HOST_KEY_CHECKING=False 999-multibots ansible-playbook /app/playbook.yml -i /app/inventory
ANSIBLE_EXIT_CODE=$?

if [ $ANSIBLE_EXIT_CODE -ne 0 ]; then
  echo "❌ Ошибка при выполнении Ansible! Проверьте логи."
  exit $ANSIBLE_EXIT_CODE
fi

echo "✅ Ansible успешно сгенерировал конфиги."

# Перезапустить nginx, чтобы он подхватил конфиги из volume
echo "🔄 Перезапускаем nginx-proxy для применения новых конфигов..."
docker compose restart nginx-proxy

echo "🎉 Развертывание успешно завершено." 