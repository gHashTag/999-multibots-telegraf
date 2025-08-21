#!/bin/bash

# 🚀 Скрипт для полного перезапуска бота с проверкой ngrok
# Автор: НейроКодер
# Назначение: НАВСЕГДА решить проблему кэширования URL

echo "🚀 === ПОЛНЫЙ ПЕРЕЗАПУСК БОТА С NGROK ===" 

# 1. Убиваем ВСЕ процессы
echo "🔥 Убиваем все процессы bun и node..."
pkill -f "bun" 2>/dev/null || true
pkill -f "node" 2>/dev/null || true
sleep 3

# 2. Проверяем ngrok статус  
echo "🔍 Проверяем ngrok..."
NGROK_URL=$(grep "LOCAL_SERVER_URL" .env | cut -d'=' -f2)
echo "📋 URL в .env: $NGROK_URL"

if [ ! -z "$NGROK_URL" ]; then
    echo "🌐 Проверяем доступность ngrok..."
    if curl -s "$NGROK_URL" | grep -q "API Server is alive"; then
        echo "✅ Ngrok работает правильно!"
    else
        echo "❌ Ngrok НЕ переадресует на API!"
        echo "🚨 НУЖНО ПЕРЕЗАПУСТИТЬ NGROK:"
        echo "   1. Останови ngrok (Ctrl+C)"
        echo "   2. Запусти: ngrok http 2999" 
        echo "   3. Скопируй новый URL"
        echo "   4. Обнови .env: LOCAL_SERVER_URL=https://новый-url.ngrok.app"
        echo "   5. Запусти этот скрипт снова"
        exit 1
    fi
else
    echo "❌ LOCAL_SERVER_URL не найден в .env!"
    exit 1
fi

# 3. Запускаем API сервер
echo "🖥️ Запускаем API сервер..."
bun --watch src/bot.ts &
BOT_PID=$!

# 4. Ждем запуска
echo "⏳ Ждем запуска API сервера..."
sleep 10

# 5. Проверяем API
echo "🔍 Проверяем API сервер..."
if curl -s http://localhost:2999/ | grep -q "API Server is alive"; then
    echo "✅ API сервер запущен!"
else
    echo "❌ API сервер не отвечает!"
    kill $BOT_PID 2>/dev/null || true
    exit 1
fi

# 6. Финальная проверка ngrok
echo "🌐 Финальная проверка ngrok..."
if curl -s "$NGROK_URL" | grep -q "API Server is alive"; then
    echo "🎉 ВСЁ РАБОТАЕТ! Бот запущен с правильным URL!"
    echo "📋 API URL: $NGROK_URL"
    echo "🤖 PID бота: $BOT_PID"
    echo ""
    echo "📝 Для остановки бота: kill $BOT_PID"
    echo "📊 Для мониторинга: curl $NGROK_URL"
else
    echo "❌ Ngrok все еще не работает!"
    kill $BOT_PID 2>/dev/null || true
    exit 1
fi 