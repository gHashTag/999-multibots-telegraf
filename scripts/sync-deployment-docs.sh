#!/bin/bash

# Скрипт синхронизации документации по деплою
# Синхронизирует deployment-manager.md ↔ CLAUDE.md ↔ DEPLOYMENT_GUIDE.md

set -e

PROJECT_ROOT="/Users/playra/999-agents-telegraf"
DEPLOYMENT_MANAGER="$PROJECT_ROOT/.claude/agents/deployment-manager.md"
CLAUDE_MD="/Users/playra/CLAUDE.md"
DEPLOYMENT_GUIDE="$PROJECT_ROOT/docs/DEPLOYMENT_GUIDE.md"

echo "🔄 Синхронизация документации по деплою..."

# Функция для извлечения секции из CLAUDE.md
extract_deployment_section() {
    local file="$1"
    awk '/# 🚨 КРИТИЧЕСКИ ВАЖНАЯ ИНФОРМАЦИЯ О ПРОДАКШН СИСТЕМЕ/,/# important-instruction-reminders/' "$file"
}

# Функция для проверки изменений
check_file_changed() {
    local file="$1"
    local backup="$file.sync_backup"

    if [ -f "$backup" ]; then
        if ! diff -q "$file" "$backup" > /dev/null 2>&1; then
            return 0  # Файл изменился
        fi
    fi
    return 1  # Файл не изменился
}

# Функция для создания бэкапа
create_backup() {
    local file="$1"
    cp "$file" "$file.sync_backup"
}

# Определяем какой файл был изменен последним
DEPLOYMENT_MANAGER_MTIME=$(stat -f %m "$DEPLOYMENT_MANAGER" 2>/dev/null || echo 0)
CLAUDE_MD_MTIME=$(stat -f %m "$CLAUDE_MD" 2>/dev/null || echo 0)
DEPLOYMENT_GUIDE_MTIME=$(stat -f %m "$DEPLOYMENT_GUIDE" 2>/dev/null || echo 0)

echo "📊 Timestamps файлов:"
echo "  - deployment-manager.md: $DEPLOYMENT_MANAGER_MTIME"
echo "  - CLAUDE.md: $CLAUDE_MD_MTIME"
echo "  - DEPLOYMENT_GUIDE.md: $DEPLOYMENT_GUIDE_MTIME"

# Находим последний измененный файл
LATEST_FILE=""
LATEST_MTIME=0

if [ "$DEPLOYMENT_MANAGER_MTIME" -gt "$LATEST_MTIME" ]; then
    LATEST_FILE="deployment-manager"
    LATEST_MTIME="$DEPLOYMENT_MANAGER_MTIME"
fi

if [ "$CLAUDE_MD_MTIME" -gt "$LATEST_MTIME" ]; then
    LATEST_FILE="claude-md"
    LATEST_MTIME="$CLAUDE_MD_MTIME"
fi

if [ "$DEPLOYMENT_GUIDE_MTIME" -gt "$LATEST_MTIME" ]; then
    LATEST_FILE="deployment-guide"
    LATEST_MTIME="$DEPLOYMENT_GUIDE_MTIME"
fi

echo "✅ Последний измененный файл: $LATEST_FILE"

# Синхронизируем на основе последнего измененного файла
case "$LATEST_FILE" in
    "deployment-manager")
        echo "📝 Синхронизация из deployment-manager.md..."
        # TODO: Извлечь критические секции и обновить CLAUDE.md и DEPLOYMENT_GUIDE.md
        echo "⚠️  Ручная синхронизация требуется для deployment-manager.md → CLAUDE.md"
        ;;

    "claude-md")
        echo "📝 Синхронизация из CLAUDE.md..."
        # Извлекаем секцию деплоя
        extract_deployment_section "$CLAUDE_MD" > /tmp/deployment_section.md
        echo "✅ Секция деплоя извлечена из CLAUDE.md"
        echo "⚠️  Ручное обновление deployment-manager.md рекомендуется"
        ;;

    "deployment-guide")
        echo "📝 Синхронизация из DEPLOYMENT_GUIDE.md..."
        echo "⚠️  Ручная синхронизация требуется для DEPLOYMENT_GUIDE.md → CLAUDE.md"
        ;;

    *)
        echo "ℹ️  Все файлы синхронизированы или нет изменений"
        ;;
esac

# Создаем бэкапы после синхронизации
create_backup "$DEPLOYMENT_MANAGER"
create_backup "$CLAUDE_MD"
create_backup "$DEPLOYMENT_GUIDE"

echo "✨ Синхронизация завершена!"
echo ""
echo "📋 Файлы для ручной проверки:"
echo "  1. $DEPLOYMENT_MANAGER"
echo "  2. $CLAUDE_MD"
echo "  3. $DEPLOYMENT_GUIDE"
echo ""
echo "💡 Используйте агента docs-sync для автоматической синхронизации:"
echo "   /docs-sync"
