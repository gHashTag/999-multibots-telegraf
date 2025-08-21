#!/bin/bash

# Скрипт для проверки статуса вебхуков всех ботов
# Автор: Claude Code AI

echo "🔗 Проверка статуса вебхуков ботов"
echo "=================================="

# Загружаем переменные окружения если есть .env файл
if [ -f ".env" ]; then
    source .env
    echo "✅ Загружены переменные из .env"
else
    echo "⚠️  .env файл не найден, используем переменные окружения"
fi

# Функция проверки вебхука
check_webhook() {
    local token=$1
    local bot_name=$2
    
    if [ -z "$token" ]; then
        echo "❌ $bot_name: токен не установлен"
        return
    fi
    
    echo "🤖 Проверяем $bot_name..."
    
    webhook_info=$(curl -s "https://api.telegram.org/bot${token}/getWebhookInfo")
    
    if echo "$webhook_info" | jq -e '.ok' > /dev/null 2>&1; then
        webhook_url=$(echo "$webhook_info" | jq -r '.result.url // "не установлен"')
        pending_count=$(echo "$webhook_info" | jq -r '.result.pending_update_count // 0')
        last_error=$(echo "$webhook_info" | jq -r '.result.last_error_message // "нет"')
        last_error_date=$(echo "$webhook_info" | jq -r '.result.last_error_date // 0')
        
        if [ "$last_error_date" != "0" ]; then
            error_date=$(date -d "@$last_error_date" 2>/dev/null || date -r "$last_error_date" 2>/dev/null || echo "неизвестно")
        else
            error_date="нет"
        fi
        
        echo "   URL: $webhook_url"
        echo "   Ожидающих: $pending_count"
        echo "   Ошибка: $last_error"
        echo "   Дата ошибки: $error_date"
        
        # Проверяем доступность URL если он установлен
        if [ "$webhook_url" != "не установлен" ] && [ ! -z "$webhook_url" ]; then
            if curl -I -s --connect-timeout 5 "$webhook_url" | head -n1 | grep -q "200\|404\|405"; then
                echo "   🟢 Webhook URL доступен"
            else
                echo "   🔴 Webhook URL недоступен"
            fi
        fi
        echo ""
    else
        echo "   ❌ Ошибка получения информации о вебхуке"
        echo "   Ответ API: $webhook_info"
        echo ""
    fi
}

# Проверяем все боты
check_webhook "$BOT_TOKEN_1" "BOT_1"
check_webhook "$BOT_TOKEN_2" "BOT_2" 
check_webhook "$BOT_TOKEN_3" "BOT_3"
check_webhook "$BOT_TOKEN_4" "BOT_4"
check_webhook "$BOT_TOKEN_5" "BOT_5"
check_webhook "$BOT_TOKEN_6" "BOT_6"
check_webhook "$BOT_TOKEN_7" "BOT_7"
check_webhook "$BOT_TOKEN_8" "BOT_8"
check_webhook "$BOT_TOKEN_9" "BOT_9"
check_webhook "$BOT_TOKEN_10" "BOT_10"

echo "🏁 Проверка завершена"
echo ""
echo "💡 Если вебхуки не установлены:"
echo "   1. Убедитесь что сервер запущен и доступен"
echo "   2. Проверьте WEBHOOK_DOMAIN в .env"
echo "   3. Перезапустите боты командой: npm run build && npm start"
echo ""
echo "🔧 Для сброса вебхуков (переключение на polling):"
echo "   bash scripts/remove-webhooks.sh"