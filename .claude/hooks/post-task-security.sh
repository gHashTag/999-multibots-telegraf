#!/bin/bash
# Основной post-task security хук для Claude Code
# Запускается после каждого инструмента для проверки безопасности

set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
HOOK_LOG_DIR="$PROJECT_DIR/.claude/logs"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Создаем директорию для логов если не существует
mkdir -p "$HOOK_LOG_DIR"

LOG_FILE="$HOOK_LOG_DIR/post-task-security_$TIMESTAMP.log"

# Функция для логирования
log_hook() {
    echo "[POST-TASK-SECURITY] $(date '+%H:%M:%S') $1" | tee -a "$LOG_FILE"
}

# Функция для отправки уведомления об ошибке
notify_security_issue() {
    local issue="$1"
    log_hook "🚨 SECURITY ISSUE: $issue"
    
    # Создаем файл с предупреждением
    cat > "$PROJECT_DIR/.claude/SECURITY_ALERT.txt" << EOF
🚨 SECURITY ALERT - $(date)

Обнаружена проблема безопасности:
$issue

Проверьте лог: $LOG_FILE

Рекомендуемые действия:
1. Проверьте файлы на наличие секретов
2. Удалите или замените найденные токены
3. Добавьте секреты в .env файлы
4. Обновите .gitignore если нужно

После исправления удалите этот файл.
EOF

    echo "⚠️  SECURITY ALERT создан в .claude/SECURITY_ALERT.txt"
}

# Получаем информацию о последнем использованном инструменте
TOOL_NAME="$1"
TOOL_INPUT="$2"

log_hook "=== POST-TASK SECURITY CHECK START ==="
log_hook "Tool used: $TOOL_NAME"
log_hook "Project: $PROJECT_DIR"

# 1. Быстрая проверка на секреты в недавно измененных файлах
log_hook "Проверка недавно измененных файлов..."

# Находим файлы, измененные за последние 5 минут
RECENT_FILES=$(find "$PROJECT_DIR" -type f \( -name "*.ts" -o -name "*.js" -o -name "*.json" -o -name "*.md" -o -name "*.txt" -o -name "*.env*" \) -not -path "*/node_modules/*" -not -path "*/.git/*" -newermt "5 minutes ago" 2>/dev/null || true)

SECURITY_ISSUES_FOUND=false

if [ -n "$RECENT_FILES" ]; then
    log_hook "Найдены недавно измененные файлы:"
    echo "$RECENT_FILES" | tee -a "$LOG_FILE"
    
    # Проверяем каждый файл на секреты
    while IFS= read -r file; do
        if [ -f "$file" ]; then
            # Telegram Bot токены
            if grep -E "[0-9]{8,10}:[a-zA-Z0-9_-]{35}" "$file" > /dev/null 2>&1; then
                notify_security_issue "Telegram Bot Token найден в файле: $file"
                SECURITY_ISSUES_FOUND=true
            fi
            
            # OpenAI API ключи
            if grep -E "sk-[a-zA-Z0-9]{48,}" "$file" > /dev/null 2>&1; then
                notify_security_issue "OpenAI API Key найден в файле: $file"
                SECURITY_ISSUES_FOUND=true
            fi
            
            # Supabase ключи
            if grep -E "eyJ[a-zA-Z0-9_-]{100,}" "$file" > /dev/null 2>&1; then
                notify_security_issue "Supabase Key найден в файле: $file"
                SECURITY_ISSUES_FOUND=true
            fi
        fi
    done <<< "$RECENT_FILES"
fi

# 2. Проверяем git staged файлы
if [ -d "$PROJECT_DIR/.git" ]; then
    cd "$PROJECT_DIR"
    STAGED_FILES=$(git diff --cached --name-only 2>/dev/null || true)
    
    if [ -n "$STAGED_FILES" ]; then
        log_hook "Проверка staged файлов..."
        while IFS= read -r file; do
            if [ -f "$file" ] && [[ "$file" =~ \.(ts|js|json|md|txt|env)$ ]]; then
                # Проверяем staged изменения
                if git diff --cached "$file" | grep -E "[0-9]{8,10}:[a-zA-Z0-9_-]{35}|sk-[a-zA-Z0-9]{48,}|eyJ[a-zA-Z0-9_-]{100,}" > /dev/null 2>&1; then
                    notify_security_issue "Секреты найдены в staged изменениях файла: $file"
                    SECURITY_ISSUES_FOUND=true
                fi
            fi
        done <<< "$STAGED_FILES"
    fi
fi

# 3. Проверка специфичных инструментов
case "$TOOL_NAME" in
    "Write"|"Edit"|"MultiEdit")
        log_hook "Дополнительная проверка для инструмента записи файлов..."
        
        # Если создавались или редактировались .env файлы
        if echo "$TOOL_INPUT" | grep -q "\.env"; then
            log_hook "⚠️ Обнаружено изменение .env файла. Проверьте .gitignore"
            
            # Проверяем что .env файлы в .gitignore
            if [ -f "$PROJECT_DIR/.gitignore" ]; then
                if ! grep -q "\.env" "$PROJECT_DIR/.gitignore"; then
                    notify_security_issue ".env файлы не найдены в .gitignore"
                    SECURITY_ISSUES_FOUND=true
                fi
            fi
        fi
        ;;
        
    "Bash")
        log_hook "Проверка bash команд на безопасность..."
        
        # Проверяем на опасные команды в логах
        if echo "$TOOL_INPUT" | grep -E "(rm -rf|sudo|chmod 777|curl.*\|.*sh|wget.*\|.*sh)" > /dev/null 2>&1; then
            log_hook "⚠️ Обнаружена потенциально опасная bash команда"
        fi
        ;;
esac

# 4. Проверка размера проекта
PROJECT_SIZE=$(du -sm "$PROJECT_DIR" 2>/dev/null | cut -f1 || echo "0")
if [ "$PROJECT_SIZE" -gt 1000 ]; then # Больше 1GB
    log_hook "⚠️ Размер проекта: ${PROJECT_SIZE}MB. Возможно нужна очистка."
fi

# 5. Автоматический cleanup мелкого мусора
log_hook "Автоматическая очистка мелкого мусора..."

# Удаляем временные файлы
find "$PROJECT_DIR" -type f \( -name "*.tmp" -o -name "*~" -o -name ".DS_Store" \) -not -path "*/node_modules/*" -delete 2>/dev/null || true

# Итоговый результат
if [ "$SECURITY_ISSUES_FOUND" = true ]; then
    log_hook "🚨 НАЙДЕНЫ ПРОБЛЕМЫ БЕЗОПАСНОСТИ! Проверьте .claude/SECURITY_ALERT.txt"
    log_hook "=== POST-TASK SECURITY CHECK FAILED ==="
    exit 1
else
    log_hook "✅ Security проверка пройдена успешно"
    
    # Удаляем старый security alert если всё в порядке
    if [ -f "$PROJECT_DIR/.claude/SECURITY_ALERT.txt" ]; then
        rm -f "$PROJECT_DIR/.claude/SECURITY_ALERT.txt"
        log_hook "🗑️ Предыдущий security alert удален"
    fi
    
    log_hook "=== POST-TASK SECURITY CHECK PASSED ==="
fi

# Очистка старых логов (оставляем последние 10)
find "$HOOK_LOG_DIR" -name "post-task-security_*.log" -type f | sort | head -n -10 | xargs rm -f 2>/dev/null || true

exit 0