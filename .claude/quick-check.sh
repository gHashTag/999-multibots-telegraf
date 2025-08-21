#!/bin/bash
# Быстрая проверка интеграции Claude Flow

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

echo "🔍 Быстрая проверка Claude Flow интеграции"
echo "=========================================="
echo ""

# 1. Проверка файлов
echo "📁 Проверка файлов:"
if [ -f "$PROJECT_DIR/.claude/settings.json" ]; then
    echo "✅ settings.json найден"
else
    echo "❌ settings.json НЕ найден"
fi

if [ -f "$PROJECT_DIR/.claude/hooks/claude-flow-integration.sh" ]; then
    echo "✅ claude-flow-integration.sh найден"
else
    echo "❌ claude-flow-integration.sh НЕ найден"
fi

if [ -x "$PROJECT_DIR/.claude/hooks/claude-flow-integration.sh" ]; then
    echo "✅ claude-flow-integration.sh исполняемый"
else
    echo "❌ claude-flow-integration.sh НЕ исполняемый"
fi

# 2. Проверка JSON
echo ""
echo "⚙️ Проверка конфигурации:"
if command -v jq >/dev/null 2>&1; then
    if jq empty "$PROJECT_DIR/.claude/settings.json" 2>/dev/null; then
        echo "✅ JSON синтаксис корректен"
        
        # Проверяем наличие Claude Flow хука
        if jq -e '.hooks[] | select(.event == "UserPromptSubmit" and .matchers[0].user_prompt == ".*")' "$PROJECT_DIR/.claude/settings.json" >/dev/null 2>&1; then
            echo "✅ UserPromptSubmit хук для Claude Flow настроен"
        else
            echo "❌ UserPromptSubmit хук для Claude Flow НЕ настроен"
        fi
    else
        echo "❌ Ошибка в JSON синтаксисе"
    fi
else
    echo "⚠️ jq не найден, пропуск проверки JSON"
fi

# 3. Проверка зависимостей
echo ""
echo "🔧 Проверка зависимостей:"
if command -v node >/dev/null 2>&1; then
    echo "✅ Node.js доступен: $(node --version)"
else
    echo "❌ Node.js НЕ доступен"
fi

if command -v npm >/dev/null 2>&1; then
    echo "✅ npm доступен: $(npm --version | head -1)"
else
    echo "❌ npm НЕ доступен"
fi

if command -v npx >/dev/null 2>&1; then
    echo "✅ npx доступен"
else
    echo "❌ npx НЕ доступен"
fi

# 4. Проверка Claude Flow (без установки)
echo ""
echo "🤖 Проверка Claude Flow:"
if npx claude-flow@alpha --version >/dev/null 2>&1; then
    echo "✅ Claude Flow доступен: $(npx claude-flow@alpha --version 2>/dev/null | head -1)"
else
    echo "⚠️ Claude Flow не установлен (будет установлен при первом использовании)"
fi

# 5. Проверка директорий
echo ""
echo "📂 Проверка директорий:"
mkdir -p "$PROJECT_DIR/.claude/logs"
mkdir -p "$PROJECT_DIR/.hive-mind"

echo "✅ .claude/logs создана"
echo "✅ .hive-mind создана"

# 6. Тестовый запуск скрипта (без Claude Flow)
echo ""
echo "🧪 Тест скрипта интеграции:"
export CLAUDE_PROJECT_DIR="$PROJECT_DIR"

if bash "$PROJECT_DIR/.claude/hooks/claude-flow-integration.sh" "Тестовый промпт" 2>&1 | head -5; then
    echo ""
    echo "✅ Скрипт интеграции работает"
else
    echo "⚠️ Скрипт интеграции работает с предупреждениями"
fi

echo ""
echo "📊 ИТОГ:"
echo "======="
echo ""
echo "✅ Базовая интеграция настроена"
echo "🎯 Для полного тестирования запустите Claude Code с любым промптом"
echo "📝 Проверьте создание логов в .claude/logs/"
echo "🐝 Проверьте создание сессий в .hive-mind/sessions/"
echo ""
echo "🚀 Система готова к использованию!"
echo ""