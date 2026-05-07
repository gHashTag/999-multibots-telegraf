#!/bin/bash

echo "🔧 ДИАГНОСТИКА И ИСПРАВЛЕНИЕ WEBHOOK В PRODUCTION"
echo "=================================================="
echo ""

# Шаг 1: Проверим переменные окружения
echo "📋 Шаг 1: Проверка переменных окружения"
echo "----------------------------------------"
if [ -f .env ]; then
    echo "BASE_WEBHOOK_URL=${BASE_WEBHOOK_URL:-'не установлено'}"
    echo "API_SERVER_URL=${API_SERVER_URL:-'не установлено'}"
else
    echo "❌ Файл .env не найден"
fi

# Проверим в продакшн файлах
if [ -f /Users/playra/999-multibots-telegraf/.env ]; then
    source /Users/playra/999-multibots-telegraf/.env
    echo "✅ BASE_WEBHOOK_URL из локального .env: ${BASE_WEBHOOK_URL:-'не установлено'}"
    echo "✅ API_SERVER_URL из локального .env: ${API_SERVER_URL:-'не установлено'}"
fi

echo ""
echo "🔍 Шаг 2: Проверка логики webhook"
echo "-----------------------------------"

# Проверим логику формирования URL в коде
if [ -f src/services/createModelTrainingLocal.ts ]; then
    echo "✅ Найден файл createModelTrainingLocal.ts"

    # Извлечем строки с webhookUrl
    grep -A 2 "webhookUrl" src/services/createModelTrainingLocal.ts | head -10

    # Проверим, есть ли исправление HTTPS
    if grep -q "startsWith('http')" src/services/createModelTrainingLocal.ts; then
        echo "✅ Логика HTTPS исправлена"
    else
        echo "❌ Логика HTTPS НЕ исправлена"
    fi
else
    echo "❌ Файл createModelTrainingLocal.ts не найден"
fi

echo ""
echo "🚨 Шаг 3: ДИАГНОЗ ПРОБЛЕМЫ"
echo "---------------------------"

# Анализируем проблему
if [ -n "$BASE_WEBHOOK_URL" ]; then
    if [[ $BASE_WEBHOOK_URL == http://* ]]; then
        echo "❌ НАЙДЕНА ПРОБЛЕМА: BASE_WEBHOOK_URL начинается с HTTP://"
        echo "   Текущее значение: $BASE_WEBHOOK_URL"
        echo "   Нужно изменить на: https://${BASE_WEBHOOK_URL#http://}"
    elif [[ $BASE_WEBHOOK_URL == https://* ]]; then
        echo "✅ BASE_WEBHOOK_URL корректен (HTTPS)"
    fi
fi

if [ -n "$API_SERVER_URL" ]; then
    if [[ $API_SERVER_URL == http://* ]]; then
        echo "❌ НАЙДЕНА ПРОБЛЕМА: API_SERVER_URL начинается с HTTP://"
        echo "   Текущее значение: $API_SERVER_URL"
        echo "   Нужно изменить на: https://${API_SERVER_URL#http://}"
    elif [[ $API_SERVER_URL == https://* ]]; then
        echo "✅ API_SERVER_URL корректен (HTTPS)"
    fi
fi

echo ""
echo "🔧 Шаг 4: ИСПРАВЛЕНИЕ"
echo "----------------------"

# Создаем бэкап .env
if [ -f .env ]; then
    cp .env .env.backup.$(date +%s)
    echo "✅ Создан бэкап .env"
fi

# Исправляем переменные в .env (если они HTTP)
if [ -f .env ]; then
    if grep -q "^BASE_WEBHOOK_URL=http://" .env; then
        sed -i.bak 's|^BASE_WEBHOOK_URL=http://|BASE_WEBHOOK_URL=https://|g' .env
        echo "✅ Исправлен BASE_WEBHOOK_URL (HTTP → HTTPS)"
    fi

    if grep -q "^API_SERVER_URL=http://" .env; then
        sed -i.bak 's|^API_SERVER_URL=http://|API_SERVER_URL=https://|g' .env
        echo "✅ Исправлен API_SERVER_URL (HTTP → HTTPS)"
    fi
fi

echo ""
echo "✅ ДИАГНОСТИКА ЗАВЕРШЕНА"
echo "========================"
echo ""
echo "📝 ИНСТРУКЦИИ:"
echo "1. Если были найдены проблемы - переменные исправлены в .env"
echo "2. Нужно пересобрать и задеплоить код на сервер"
echo "3. После деплоя webhook будет работать корректно"
echo ""
echo "🚀 Для деплоя:"
echo "   ./deploy.sh production"
