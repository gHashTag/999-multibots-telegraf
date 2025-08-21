#!/bin/bash
# Cleanup script для автоматической очистки мусора после выполнения задач

set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOG_FILE="$PROJECT_DIR/.claude/cleanup.log"
CLEANUP_ACTIONS=0

echo "🧹 Starting cleanup at $(date)" | tee -a "$LOG_FILE"

# Функция для логирования
log_cleanup() {
    echo "[CLEANUP] $1" | tee -a "$LOG_FILE"
}

# Функция безопасного удаления
safe_remove() {
    local target="$1"
    local description="$2"
    
    if [ -e "$target" ]; then
        log_cleanup "Удаляем $description: $target"
        rm -rf "$target"
        CLEANUP_ACTIONS=$((CLEANUP_ACTIONS + 1))
    fi
}

# 1. Очистка временных файлов
log_cleanup "Очистка временных файлов..."

# Стандартные временные файлы
find "$PROJECT_DIR" -type f \( \
    -name "*.tmp" -o \
    -name "temp_*" -o \
    -name "*.temp" -o \
    -name "*~" -o \
    -name "*.bak" -o \
    -name "*.orig" -o \
    -name "*.swp" -o \
    -name ".DS_Store" -o \
    -name "Thumbs.db" \
\) -not -path "*/node_modules/*" -not -path "*/.git/*" -exec rm -f {} \; -print | tee -a "$LOG_FILE"

# Временные папки
find "$PROJECT_DIR" -type d \( \
    -name "tmp_*" -o \
    -name "temp_*" -o \
    -name ".tmp" \
\) -not -path "*/node_modules/*" -not -path "*/.git/*" -exec rm -rf {} \; -print 2>/dev/null | tee -a "$LOG_FILE" || true

# 2. Очистка логов и cache
log_cleanup "Очистка кэша и логов..."

safe_remove "$PROJECT_DIR/.next/cache" "Next.js cache"
safe_remove "$PROJECT_DIR/.cache" "общий cache"
safe_remove "$PROJECT_DIR/tmp" "tmp директория"
safe_remove "$PROJECT_DIR/temp" "temp директория"
safe_remove "$PROJECT_DIR/tmp_tests" "временные тесты"

# Очистка старых логов (старше 7 дней)
if [ -d "$PROJECT_DIR/logs" ]; then
    find "$PROJECT_DIR/logs" -name "*.log" -type f -mtime +7 -exec rm -f {} \; -print | while read -r file; do
        log_cleanup "Удален старый лог: $file"
        CLEANUP_ACTIONS=$((CLEANUP_ACTIONS + 1))
    done
fi

# 3. Очистка Node.js artifacts
log_cleanup "Очистка Node.js артефактов..."

# npm cache в проекте
safe_remove "$PROJECT_DIR/.npm" "npm cache"
safe_remove "$PROJECT_DIR/npm-debug.log" "npm debug log"
safe_remove "$PROJECT_DIR/yarn-debug.log" "yarn debug log"
safe_remove "$PROJECT_DIR/yarn-error.log" "yarn error log"

# Jest cache
safe_remove "$PROJECT_DIR/.jest" "Jest cache"
if [ -f "$PROJECT_DIR/jest.config.js" ]; then
    JEST_CACHE_DIR=$(grep -o "cacheDirectory.*" "$PROJECT_DIR/jest.config.js" | cut -d"'" -f2 2>/dev/null || true)
    if [ -n "$JEST_CACHE_DIR" ] && [ -d "$PROJECT_DIR/$JEST_CACHE_DIR" ]; then
        safe_remove "$PROJECT_DIR/$JEST_CACHE_DIR" "Jest custom cache"
    fi
fi

# 4. Очистка build артефактов
log_cleanup "Очистка build артефактов..."

# TypeScript build info
find "$PROJECT_DIR" -name "*.tsbuildinfo" -not -path "*/node_modules/*" -exec rm -f {} \; -print | tee -a "$LOG_FILE"

# 5. Очистка IDE файлов
log_cleanup "Очистка IDE файлов..."

safe_remove "$PROJECT_DIR/.vscode/settings.json.backup" "VSCode backup"
safe_remove "$PROJECT_DIR/.idea" "IntelliJ IDEA files"

# 6. Проверка и очистка больших файлов
log_cleanup "Поиск больших файлов..."

LARGE_FILES=$(find "$PROJECT_DIR" -type f -size +50M -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null || true)
if [ -n "$LARGE_FILES" ]; then
    log_cleanup "⚠️ Найдены большие файлы (>50MB). Проверьте, нужны ли они:"
    echo "$LARGE_FILES" | while read -r file; do
        size=$(du -h "$file" | cut -f1)
        echo "  $size - $file" | tee -a "$LOG_FILE"
    done
fi

# 7. Очистка пустых директорий
log_cleanup "Удаление пустых директорий..."

find "$PROJECT_DIR" -type d -empty -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/.claude/*" | while read -r dir; do
    if [ -d "$dir" ]; then
        log_cleanup "Удаляем пустую директорию: $dir"
        rmdir "$dir" 2>/dev/null || true
        CLEANUP_ACTIONS=$((CLEANUP_ACTIONS + 1))
    fi
done

# 8. Проверка git статуса и очистка untracked мусора
if [ -d "$PROJECT_DIR/.git" ]; then
    log_cleanup "Очистка git untracked файлов..."
    cd "$PROJECT_DIR"
    
    # Показываем untracked файлы для информации
    UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null | head -20 || true)
    if [ -n "$UNTRACKED" ]; then
        log_cleanup "📋 Найдены untracked файлы (первые 20):"
        echo "$UNTRACKED" | tee -a "$LOG_FILE"
    fi
    
    # Автоматически удаляем явно мусорные untracked файлы
    git clean -fd --dry-run 2>/dev/null | grep -E "\.(tmp|temp|bak|orig|swp|log)$" | sed 's/Would remove //' | while read -r file; do
        if [ -e "$file" ]; then
            log_cleanup "Удаляем untracked мусор: $file"
            rm -f "$file"
            CLEANUP_ACTIONS=$((CLEANUP_ACTIONS + 1))
        fi
    done 2>/dev/null || true
fi

# 9. Финальная проверка размера проекта
PROJECT_SIZE=$(du -sh "$PROJECT_DIR" 2>/dev/null | cut -f1 || echo "unknown")
log_cleanup "Текущий размер проекта: $PROJECT_SIZE"

# Итоговый результат
echo "" | tee -a "$LOG_FILE"
if [ $CLEANUP_ACTIONS -gt 0 ]; then
    log_cleanup "✅ Cleanup завершен. Выполнено действий: $CLEANUP_ACTIONS"
else
    log_cleanup "✅ Cleanup завершен. Мусор не найден."
fi

echo "Лог сохранен в: $LOG_FILE"
exit 0