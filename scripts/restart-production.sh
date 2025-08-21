#!/bin/bash

# Скрипт для перезапуска ботов в продакшене
# Автор: Claude Code AI
# Дата: 21.08.2025

SERVER="ai-server-u14194.vm.elestio.app"
USER="playra"

echo "🔧 Диагностика и перезапуск ботов в продакшене"
echo "================================================"

# Функция для выполнения команд на сервере
run_remote() {
    echo "📡 Выполняем: $1"
    ssh -o ConnectTimeout=10 "$USER@$SERVER" "$1"
}

# Проверка доступности сервера
echo "🌐 Проверяем доступность сервера..."
if curl -I "https://$SERVER" 2>/dev/null | grep -q "502"; then
    echo "⚠️  Сервер возвращает 502 Bad Gateway - контейнеры недоступны"
elif curl -I "https://$SERVER" 2>/dev/null | grep -q "200\|404"; then
    echo "✅ Сервер доступен"
else
    echo "❌ Сервер недоступен"
    exit 1
fi

# Проверка SSH подключения
echo "🔑 Проверяем SSH подключение..."
if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$USER@$SERVER" "echo 'SSH OK'" 2>/dev/null; then
    echo "❌ SSH подключение недоступно. Необходимо настроить ключи."
    echo "💡 Для настройки SSH:"
    echo "   1. Сгенерируйте ключ: ssh-keygen -t rsa -b 4096"
    echo "   2. Скопируйте ключ: ssh-copy-id $USER@$SERVER"
    echo "   3. Или добавьте ключ вручную в ~/.ssh/authorized_keys на сервере"
    exit 1
fi

echo "✅ SSH подключение работает"

# Диагностика контейнеров
echo "🐳 Проверяем состояние Docker контейнеров..."
run_remote "docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"

echo ""
echo "📊 Проверяем docker-compose сервисы..."
run_remote "cd /app && docker-compose ps 2>/dev/null || echo 'docker-compose.yml не найден или не в /app'"

# Проверка логов
echo ""
echo "📝 Последние логи контейнера с ботами..."
run_remote "docker logs --tail 20 999-multibots 2>/dev/null || echo 'Контейнер 999-multibots не найден'"

# Проверка nginx
echo ""
echo "🌐 Проверяем статус nginx..."
run_remote "docker logs --tail 10 bot-proxy 2>/dev/null || echo 'Контейнер bot-proxy не найден'"

# Перезапуск сервисов
echo ""
read -p "🔄 Хотите перезапустить сервисы? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🔄 Перезапускаем сервисы..."
    
    # Остановка
    run_remote "cd /app && docker-compose down || docker stop 999-multibots bot-proxy"
    
    # Очистка
    echo "🧹 Очищаем старые контейнеры..."
    run_remote "docker system prune -f"
    
    # Запуск
    echo "🚀 Запускаем сервисы..."
    run_remote "cd /app && docker-compose up -d || echo 'Ошибка запуска docker-compose'"
    
    # Ожидание запуска
    echo "⏳ Ждем запуска контейнеров (30 сек)..."
    sleep 30
    
    # Проверка после перезапуска
    echo "✅ Проверяем статус после перезапуска..."
    run_remote "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
fi

# Проверка вебхуков
echo ""
echo "🔗 Проверяем статус вебхуков..."
if [ ! -z "$BOT_TOKEN_1" ]; then
    webhook_info=$(curl -s "https://api.telegram.org/bot${BOT_TOKEN_1}/getWebhookInfo")
    webhook_url=$(echo "$webhook_info" | jq -r '.result.url // "не установлен"')
    pending_count=$(echo "$webhook_info" | jq -r '.result.pending_update_count // 0')
    last_error=$(echo "$webhook_info" | jq -r '.result.last_error_message // "нет"')
    
    echo "📊 Вебхук BOT_TOKEN_1:"
    echo "   URL: $webhook_url"
    echo "   Ожидающих обновлений: $pending_count"
    echo "   Последняя ошибка: $last_error"
else
    echo "⚠️  BOT_TOKEN_1 не установлен в локальных переменных"
fi

echo ""
echo "🏁 Диагностика завершена"
echo "💡 Если проблемы остались:"
echo "   1. Проверьте .env файл на сервере"
echo "   2. Убедитесь что docker-compose.yml находится в правильной директории"
echo "   3. Проверьте nginx конфигурацию"
echo "   4. Посмотрите полные логи: docker logs 999-multibots"