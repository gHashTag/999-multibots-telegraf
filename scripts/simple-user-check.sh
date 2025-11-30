#!/bin/bash

# =====================================================================
# ПРОСТАЯ ПРОВЕРКА ДАННЫХ ПОЛЬЗОВАТЕЛЯ 435572800
# =====================================================================

TELEGRAM_ID="435572800"

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║           🔍 ПРОВЕРКА ДАННЫХ ПОЛЬЗОВАТЕЛЯ $TELEGRAM_ID         ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Проверяем есть ли доступ к Supabase
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_KEY" ]; then
    echo "❌ Переменные окружения Supabase не найдены"
    echo ""
    echo "💡 Попробуйте выполнить:"
    echo "   source .env"
    echo "   npm run env:sync"
    echo ""
    echo "📋 ИЛИ выполните SQL запросы вручную в Supabase:"
    echo "   https://supabase.com/dashboard/project/fd763fa3-35d5-4045-93bd-1795c5f00fc3/sql-editor"
    echo ""
    echo "📄 SQL скрипты готовы в:"
    echo "   - scripts/user-435572800-analysis.sql"
    echo "   - scripts/find-user-data-instructions.md"
else
    echo "✅ Переменные окружения найдены"
    echo "   SUPABASE_URL: ${SUPABASE_URL:0:40}..."
    echo ""

    # Попробуем установить supabase-cli если не установлен
    if ! command -v supabase &> /dev/null; then
        echo "🔧 Устанавливаю Supabase CLI..."
        npm install -g supabase
    fi

    echo "🔍 Выполняю запросы..."

    # Запрос 1: Пользователь
    echo ""
    echo "📋 1. ПОИСК ПОЛЬЗОВАТЕЛЯ..."
    supabase db query "
        SELECT telegram_id, username, first_name, last_name, created_at, level
        FROM users
        WHERE telegram_id = '$TELEGRAM_ID';
    " 2>/dev/null || echo "⚠️  Не удалось выполнить запрос. Попробуйте вручную в SQL Editor."

    # Запрос 2: Платежи
    echo ""
    echo "💳 2. ПЛАТЕЖИ ЗА НЕЙРОФОТО..."
    supabase db query "
        SELECT id, created_at, amount, stars, service_type, status, metadata
        FROM payments_v2
        WHERE telegram_id = '$TELEGRAM_ID'
          AND service_type ILIKE '%neuro%'
        ORDER BY created_at DESC
        LIMIT 10;
    " 2>/dev/null || echo "⚠️  Не удалось выполнить запрос."

    # Запрос 3: Модели
    echo ""
    echo "🎓 3. ОБУЧЕННЫЕ МОДЕЛИ..."
    supabase db query "
        SELECT id, model_name, trigger_word, status, api, created_at
        FROM model_trainings
        WHERE telegram_id = '$TELEGRAM_ID'
        ORDER BY created_at DESC;
    " 2>/dev/null || echo "⚠️  Не удалось выполнить запрос."

    # Запрос 4: История
    echo ""
    echo "🎨 4. ИСТОРИЯ ГЕНЕРАЦИЙ..."
    supabase db query "
        SELECT prompt_id, created_at, prompt, model_type, status
        FROM prompts_history
        WHERE telegram_id = '$TELEGRAM_ID'
          AND mode = 'neuro_photo'
        ORDER BY created_at DESC
        LIMIT 10;
    " 2>/dev/null || echo "⚠️  Не удалось выполнить запрос."
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                    ✅ ИНСТРУКЦИИ                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 РУЧНАЯ ПРОВЕРКА В SUPABASE:"
echo ""
echo "1️⃣ Откройте: https://supabase.com/dashboard"
echo "2️⃣ Проект: fd763fa3-35d5-4045-93bd-1795c5f00fc3"
echo "3️⃣ SQL Editor"
echo ""
echo "🔍 ВЫПОЛНИТЕ ЗАПРОСЫ:"
echo ""
echo "-- Найти себя"
echo "SELECT * FROM users WHERE telegram_id = '435572800';"
echo ""
echo "-- Платежи с metadata"
echo "SELECT id, created_at, service_type, metadata"
echo "FROM payments_v2"
echo "WHERE telegram_id = '435572800' AND service_type ILIKE '%neuro%'"
echo "ORDER BY created_at DESC LIMIT 20;"
echo ""
echo "-- Обученные модели"
echo "SELECT * FROM model_trainings"
echo "WHERE telegram_id = '435572800'"
echo "ORDER BY created_at DESC;"
echo ""
echo "-- История генераций"
echo "SELECT * FROM prompts_history"
echo "WHERE telegram_id = '435572800' AND mode = 'neuro_photo'"
echo "ORDER BY created_at DESC LIMIT 20;"
echo ""
echo "📄 Подробные инструкции в:"
echo "   scripts/find-user-data-instructions.md"
echo "   scripts/user-435572800-analysis.sql"
echo ""

# Предложение запустить Node.js скрипт
if [ -f "scripts/analyze-user-435572800.ts" ]; then
    echo "🚀 Для автоматического анализа запустите:"
    echo "   npx tsx scripts/analyze-user-435572800.ts"
    echo ""
fi

echo "⚡ Результаты пришлите мне - помогу восстановить модели!"
echo ""
