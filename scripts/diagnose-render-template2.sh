#!/bin/bash

echo "🔍 ДИАГНОСТИКА TEMPLATE 2 - AI REELS RENDER"
echo "==========================================="
echo ""

echo "📋 Проверка критичных ENV переменных:"
echo "--------------------------------------"

# Проверяем RENDER_INNGEST_EVENT_KEY
if [ -z "$RENDER_INNGEST_EVENT_KEY" ]; then
    echo "❌ RENDER_INNGEST_EVENT_KEY: НЕ УСТАНОВЛЕН"
    echo "   📝 Требуется для отправки в Inngest Cloud"
else
    echo "✅ RENDER_INNGEST_EVENT_KEY: УСТАНОВЛЕН (${RENDER_INNGEST_EVENT_KEY:0:20}...)"
fi

# Проверяем RENDER_INNGEST_SIGNING_KEY
if [ -z "$RENDER_INNGEST_SIGNING_KEY" ]; then
    echo "❌ RENDER_INNGEST_SIGNING_KEY: НЕ УСТАНОВЛЕН"
    echo "   📝 Требуется для подписи запросов к Inngest"
else
    echo "✅ RENDER_INNGEST_SIGNING_KEY: УСТАНОВЛЕН (${RENDER_INNGEST_SIGNING_KEY:0:20}...)"
fi

# Проверяем ELEVENLABS_API_KEY
if [ -z "$ELEVENLABS_API_KEY" ]; then
    echo "❌ ELEVENLABS_API_KEY: НЕ УСТАНОВЛЕН"
    echo "   📝 Требуется для синтеза речи"
else
    echo "✅ ELEVENLABS_API_KEY: УСТАНОВЛЕН (${ELEVENLABS_API_KEY:0:20}...)"
fi

# Проверяем HEDRA_API_KEY
if [ -z "$HEDRA_API_KEY" ]; then
    echo "❌ HEDRA_API_KEY: НЕ УСТАНОВЛЕН"
    echo "   📝 Требуется для Hedra аватаров"
else
    echo "✅ HEDRA_API_KEY: УСТАНОВЛЕН (${HEDRA_API_KEY:0:20}...)"
fi

# Проверяем HeyGen ключи
if [ -z "$HEYGEN_COCOAGE_API_KEY" ] && [ -z "$HEYGEN_HAIM_API_KEY" ]; then
    echo "❌ HeyGen API keys: НЕ УСТАНОВЛЕНЫ"
    echo "   📝 Требуется HEYGEN_COCOAGE_API_KEY или HEYGEN_HAIM_API_KEY"
else
    if [ -n "$HEYGEN_COCOAGE_API_KEY" ]; then
        echo "✅ HEYGEN_COCOAGE_API_KEY: УСТАНОВЛЕН (${HEYGEN_COCOAGE_API_KEY:0:20}...)"
    fi
    if [ -n "$HEYGEN_HAIM_API_KEY" ]; then
        echo "✅ HEYGEN_HAIM_API_KEY: УСТАНОВЛЕН (${HEYGEN_HAIM_API_KEY:0:20}...)"
    fi
fi

# Проверяем BOT_INNGEST_EVENT_KEY
if [ -z "$BOT_INNGEST_EVENT_KEY" ]; then
    echo "⚠️  BOT_INNGEST_EVENT_KEY: НЕ УСТАНОВЛЕН"
    echo "   📝 Может требоваться для некоторых операций"
else
    echo "✅ BOT_INNGEST_EVENT_KEY: УСТАНОВЛЕН (${BOT_INNGEST_EVENT_KEY:0:20}...)"
fi

echo ""
echo "🧪 Тест инициализации InngestProvider:"
echo "--------------------------------------"

# Проверяем создание InngestProvider
node -e "
const { inngestProvider } = require('./dist/inngest_app/inngest-provider.js');
console.log('✅ InngestProvider успешно создан');
try {
    const config = inngestProvider.getConfig('RENDER');
    if (config) {
        console.log('✅ RENDER instance настроен');
        console.log('   Event Key:', config.eventKey ? 'УСТАНОВЛЕН' : 'ОТСУТСТВУЕТ');
        console.log('   Client:', config.client ? 'НАСТРОЕН' : 'ОТСУТСТВУЕТ');
    } else {
        console.log('❌ RENDER instance НЕ настроен');
        console.log('   Возможные причины:');
        console.log('   1. RENDER_INNGEST_EVENT_KEY не установлен');
        console.log('   2. ENV переменные не загружены при старте');
    }
} catch (error) {
    console.log('❌ Ошибка инициализации:', error.message);
}
" 2>&1 || echo "⚠️  Не удалось протестировать InngestProvider (возможно не собран)"

echo ""
echo "🌐 Проверка доступности сервисов:"
echo "--------------------------------------"

# Проверяем доступность Inngest Cloud
echo -n "⏳ Inngest Cloud (inn.gs): "
if curl -s --head https://inn.gs > /dev/null 2>&1; then
    echo "✅ ДОСТУПЕН"
else
    echo "❌ НЕДОСТУПЕН"
fi

# Проверяем доступность Railway render-server
echo -n "⏳ Railway render-server: "
if curl -s --head https://render-v3-production.up.railway.app > /dev/null 2>&1; then
    echo "✅ ДОСТУПЕН"
else
    echo "❌ НЕДОСТУПЕН"
fi

# Проверяем доступность callback
echo -n "⏳ Callback webhook: "
if curl -s --head https://three-head-dragon.shop/api/telegram/ai-reels-callback > /dev/null 2>&1; then
    echo "✅ ДОСТУПЕН"
else
    echo "❌ НЕДОСТУПЕН"
fi

echo ""
echo "📊 ИТОГОВЫЙ ОТЧЕТ:"
echo "==========================================="

if [ -z "$RENDER_INNGEST_EVENT_KEY" ]; then
    echo "❌ КРИТИЧНО: RENDER_INNGEST_EVENT_KEY не установлен"
    echo "   🔧 Исправление: Добавить RENDER_INNGEST_EVENT_KEY в .env"
    echo "   📝 Получить ключ в https://app.inngest.com"
else
    echo "✅ Ключ RENDER_INNGEST_EVENT_KEY установлен"
fi

echo ""
echo "🔄 Для применения изменений в .env:"
echo "   1. Перезапустить приложение"
echo "   2. Или использовать dotenv в начале приложения"
echo ""
