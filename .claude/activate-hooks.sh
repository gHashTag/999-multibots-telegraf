#!/bin/bash
# Активационный скрипт для Claude Code Security Hooks

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLAUDE_DIR="$PROJECT_DIR/.claude"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"

echo "🔧 Claude Code Security Hooks - Активация"
echo "========================================"
echo ""
echo "Проект: $PROJECT_DIR"
echo "Настройки: $SETTINGS_FILE"
echo ""

# Проверяем что файлы существуют
if [ ! -f "$SETTINGS_FILE" ]; then
    echo "❌ Файл настроек не найден: $SETTINGS_FILE"
    exit 1
fi

# Проверяем исполняемые права
echo "🔍 Проверка исполняемых прав на скрипты..."
chmod +x "$CLAUDE_DIR/hooks"/*.sh
echo "✅ Права установлены"

# Создаем директории для логов
mkdir -p "$CLAUDE_DIR/logs"
echo "✅ Директория логов создана"

# Проверяем синтаксис настроек
echo "🔍 Проверка синтаксиса настроек..."
if command -v jq >/dev/null 2>&1; then
    if jq empty "$SETTINGS_FILE" 2>/dev/null; then
        echo "✅ Синтаксис settings.json корректен"
    else
        echo "❌ Ошибка в синтаксисе settings.json"
        exit 1
    fi
else
    echo "⚠️ jq не найден, пропуск проверки JSON"
fi

# Предлагаем активацию
echo ""
echo "📋 Варианты активации:"
echo ""
echo "1) Глобальная активация (рекомендуется):"
echo "   Хуки будут работать во всех проектах с Claude Code"
echo "   mkdir -p ~/.claude && ln -sf \"$SETTINGS_FILE\" ~/.claude/settings.json"
echo ""
echo "2) Локальная активация:"
echo "   Хуки уже настроены локально в проекте"
echo "   Будут работать только в этом проекте при запуске Claude Code из корня"
echo ""

read -p "Выберите вариант активации (1/2) или нажмите Enter для пропуска: " choice

case $choice in
    1)
        echo "🌍 Активация глобальных хуков..."
        mkdir -p ~/.claude
        ln -sf "$SETTINGS_FILE" ~/.claude/settings.json
        echo "✅ Глобальные хуки активированы!"
        echo "   Файл: ~/.claude/settings.json -> $SETTINGS_FILE"
        ;;
    2|"")
        echo "📁 Используются локальные настройки"
        echo "✅ Хуки будут активны при запуске Claude Code из: $PROJECT_DIR"
        ;;
    *)
        echo "❌ Неверный выбор"
        exit 1
        ;;
esac

# Тестовый запуск security сканера
echo ""
echo "🧪 Тестовый запуск security сканера..."
if bash "$CLAUDE_DIR/hooks/security-scan.sh"; then
    echo "✅ Security сканер работает корректно"
else
    echo "⚠️ Security сканер завершился с предупреждениями (это нормально при первом запуске)"
fi

# Создаем summary файл
cat > "$CLAUDE_DIR/activation-summary.txt" << EOF
Claude Code Security Hooks - Активированы $(date)

Проект: $PROJECT_DIR
Настройки: $SETTINGS_FILE

Активированные хуки:
✓ UserPromptSubmit - Автоматический запуск Claude Flow для промптов
✓ PostToolUse - Проверка после каждого действия
✓ Stop - Финальная проверка при завершении
✓ PreToolUse - Предупреждения перед опасными действиями

Автоматические функции:
✓ Claude Flow интеграция (hive-mind spawn для каждого промпта)
✓ Сканирование токенов (Telegram, OpenAI, Supabase)
✓ Проверка git staged файлов
✓ Очистка временных файлов
✓ Контроль размера проекта
✓ Валидация критичных конфигов

Логи: $CLAUDE_DIR/logs/
Документация: $CLAUDE_DIR/README.md
EOF

echo ""
echo "🎉 Активация завершена!"
echo "📋 Summary: $CLAUDE_DIR/activation-summary.txt"
echo ""
echo "📚 Документация: $CLAUDE_DIR/README.md"
echo "🔍 Логи: $CLAUDE_DIR/logs/"
echo ""
echo "🚀 Система готова к работе!"
echo "   Теперь Claude Code будет автоматически:"
echo "   • 🤖 Запускать Claude Flow для каждого промпта"
echo "   • 🛡️ Проверять код на утечки токенов"
echo "   • 🧹 Очищать мусор после задач"  
echo "   • 🚨 Блокировать небезопасные операции"
echo "   • 📊 Вести подробные логи"
echo ""
echo "🧪 ТЕСТИРОВАНИЕ И ВАЛИДАЦИЯ:"
echo "============================"
echo ""
echo "1. Валидация интеграции:"
echo "   bash $CLAUDE_DIR/validate-claude-flow.sh"
echo ""
echo "2. Тестирование Claude Flow:"
echo "   bash $CLAUDE_DIR/test-claude-flow.sh"
echo ""
echo "3. Проверка логов интеграции:"
echo "   ls -la $CLAUDE_DIR/logs/claude-flow-integration_*.log"
echo ""
echo "4. Проверка hive-mind сессий:"
echo "   ls -la .hive-mind/sessions/"
echo ""
echo "🎯 ПОДТВЕРЖДЕНИЕ РАБОТЫ Claude Flow:"
echo "===================================="
echo ""
echo "После отправки любого промпта в Claude Code проверьте:"
echo "• Появились ли логи в .claude/logs/claude-flow-integration_*.log"
echo "• Создались ли сессии в .hive-mind/sessions/"
echo "• Сгенерировался ли .claude/claude-flow-report.md"
echo ""
echo "Если Claude Flow не запускается автоматически:"
echo "• Убедитесь что используете настройки этого проекта"
echo "• Установите Claude Flow: npm install -g claude-flow@alpha"
echo "• Проверьте переменную CLAUDE_PROJECT_DIR"
echo ""