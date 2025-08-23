#!/bin/bash
# ⚡ БЫСТРАЯ ПРОВЕРКА БИЛДА
# Минимальная проверка для ежедневной разработки

set -e

echo "⚡ [QUICK CHECK] Быстрая проверка билда..."

# Функция для быстрого выхода при ошибке
quick_fail() {
    echo "❌ $1"
    echo "💡 Запустите 'npm run build:nocheck' для детальной диагностики"
    exit 1
}

# Проверка только критических вещей
echo "🔨 Проверка основного билда..."
if ! npm run build:nocheck > /dev/null 2>&1; then
    quick_fail "Билд сломан!"
fi

echo "🔍 Проверка синтаксиса основных файлов..."
node -c dist/bot.js > /dev/null 2>&1 || quick_fail "bot.js содержит синтаксические ошибки"

echo "✅ [OK] Быстрая проверка пройдена!"
echo "💡 Для полной проверки запустите: ./scripts/check-build-health.sh"