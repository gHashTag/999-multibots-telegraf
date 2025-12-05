#!/bin/bash

# Проверка production сервера и ботов
# Автор: Claude Code
# Дата: 2025-12-03

echo "================================================================"
echo "🔍 ПРОВЕРКА PRODUCTION СЕРВЕРА"
echo "================================================================"

# Проверяем доступность сервера
echo ""
echo "1. Проверяем доступность сервера..."
if curl -s --connect-timeout 5 http://188.137.250.69/health > /dev/null 2>&1; then
    echo "   ✅ Сервер доступен на 188.137.250.69"
else
    echo "   ❌ Сервер недоступен на 188.137.250.69"
fi

# Проверяем порты ботов
echo ""
echo "2. Проверяем порты ботов (3001-3011)..."
for port in {3001..3011}; do
    if curl -s --connect-timeout 2 http://188.137.250.69:$port/ > /dev/null 2>&1; then
        echo "   ✅ Порт $port: доступен"
    else
        echo "   ❌ Порт $port: недоступен"
    fi
done

# Проверяем логи Docker
echo ""
echo "3. Проверяем логи Docker контейнера..."
if command -v docker &> /dev/null; then
    if docker ps | grep -q "999-multibots"; then
        echo "   ✅ Контейнер 999-multibots запущен"
        echo ""
        echo "📋 Последние 20 строк логов:"
        docker logs 999-multibots --tail 20 2>/dev/null | sed 's/^/   /'
    else
        echo "   ❌ Контейнер 999-multibots не запущен"
    fi
else
    echo "   ⚠️ Docker не установлен или недоступен"
fi

# Проверяем nginx
echo ""
echo "4. Проверяем Nginx конфигурацию..."
if curl -s --connect-timeout 5 -I http://188.137.250.69/OM_AI_Digital_studio_bot > /dev/null 2>&1; then
    echo "   ✅ Nginx маршрут /OM_AI_Digital_studio_bot доступен"
else
    echo "   ❌ Nginx маршрут /OM_AI_Digital_studio_bot недоступен"
fi

# Проверяем webhook URL для OM_AI_Digital_studio_bot
echo ""
echo "5. Проверяем webhook URL для OM_AI_Digital_studio_bot..."
if curl -s --connect-timeout 5 -I http://188.137.250.69/OM_AI_Digital_studio_bot > /dev/null 2>&1; then
    echo "   🌐 Webhook URL: http://188.137.250.69/OM_AI_Digital_studio_bot"
else
    echo "   ⚠️ Не удалось проверить webhook URL"
fi

echo ""
echo "================================================================"
echo "📊 ИТОГОВЫЙ СТАТУС"
echo "================================================================"
echo ""
echo "Для полного тестирования ботов необходимо:"
echo "1. Добавить BOT_TOKEN_11 в Infisical"
echo "2. Выполнить SQL из add_avatar.sql"
echo "3. Перезапустить docker-compose"
echo ""
echo "Дата проверки: $(date)"
echo "================================================================"
