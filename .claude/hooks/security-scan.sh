#!/bin/bash
# Security scanner для автоматической проверки утечек токенов и мусора

set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOG_FILE="$PROJECT_DIR/.claude/security-scan.log"
SECRETS_FOUND=false

echo "🔍 Starting security scan at $(date)" | tee -a "$LOG_FILE"

# Функция для логирования
log_security() {
    echo "[SECURITY] $1" | tee -a "$LOG_FILE"
}

# Функция для проверки файла на секреты
check_file_for_secrets() {
    local file="$1"
    local basename_file=$(basename "$file")
    
    # Пропускаем binary файлы, node_modules, .git
    if [[ "$file" =~ \.(jpg|jpeg|png|gif|pdf|zip|tar|gz|node|exe|dll)$ ]] || \
       [[ "$file" == *"/node_modules/"* ]] || \
       [[ "$file" == *"/.git/"* ]] || \
       [[ "$file" == *"/coverage/"* ]] || \
       [[ "$file" == *"/dist/"* ]]; then
        return 0
    fi
    
    # Проверяем на Telegram Bot токены
    if grep -E "[0-9]{8,10}:[a-zA-Z0-9_-]{35}" "$file" > /dev/null 2>&1; then
        log_security "🚨 TELEGRAM BOT TOKEN найден в файле: $file"
        grep -n -E "[0-9]{8,10}:[a-zA-Z0-9_-]{35}" "$file" | tee -a "$LOG_FILE"
        SECRETS_FOUND=true
    fi
    
    # Проверяем на OpenAI API ключи
    if grep -E "sk-[a-zA-Z0-9]{48,}" "$file" > /dev/null 2>&1; then
        log_security "🚨 OPENAI API KEY найден в файле: $file"
        grep -n -E "sk-[a-zA-Z0-9]{48,}" "$file" | tee -a "$LOG_FILE"
        SECRETS_FOUND=true
    fi
    
    # Проверяем на Supabase ключи
    if grep -E "eyJ[a-zA-Z0-9_-]{100,}" "$file" > /dev/null 2>&1; then
        log_security "🚨 SUPABASE KEY найден в файле: $file"
        grep -n -E "eyJ[a-zA-Z0-9_-]{100,}" "$file" | tee -a "$LOG_FILE"
        SECRETS_FOUND=true
    fi
    
    # Проверяем на потенциальные API ключи
    if grep -iE "(api[_-]?key|secret[_-]?key|access[_-]?token|bearer[_-]?token).*['\"][a-zA-Z0-9_-]{20,}['\"]" "$file" > /dev/null 2>&1; then
        # Исключаем тестовые файлы и примеры
        if [[ ! "$file" =~ (test|spec|example|mock|\.test\.|\.spec\.) ]] && \
           ! grep -q "test\|example\|placeholder\|YOUR_\|xxxx\|dummy" "$file"; then
            log_security "⚠️ Потенциальный API ключ в файле: $file"
            grep -n -iE "(api[_-]?key|secret[_-]?key|access[_-]?token|bearer[_-]?token).*['\"][a-zA-Z0-9_-]{20,}['\"]" "$file" | tee -a "$LOG_FILE"
        fi
    fi
    
    # Проверяем на hardcoded пароли
    if grep -iE "password.*['\"][a-zA-Z0-9]{8,}['\"]" "$file" > /dev/null 2>&1; then
        if [[ ! "$file" =~ (test|spec|example|mock|\.test\.|\.spec\.) ]]; then
            log_security "⚠️ Потенциальный hardcoded пароль в файле: $file"
        fi
    fi
}

# Сканируем все файлы в проекте
log_security "Сканирование файлов проекта..."
find "$PROJECT_DIR" -type f \( -name "*.ts" -o -name "*.js" -o -name "*.json" -o -name "*.md" -o -name "*.txt" -o -name "*.env*" -o -name "*.yaml" -o -name "*.yml" \) -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/coverage/*" | while read -r file; do
    check_file_for_secrets "$file"
done

# Проверяем на опасные скрипты и временные файлы
log_security "Проверка на мусорные файлы..."
TEMP_FILES=$(find "$PROJECT_DIR" -type f \( -name "*.tmp" -o -name "temp_*" -o -name "*.temp" -o -name "*~" -o -name "*.bak" -o -name "*.orig" \) -not -path "*/node_modules/*" 2>/dev/null || true)

if [ -n "$TEMP_FILES" ]; then
    log_security "🧹 Найдены временные файлы:"
    echo "$TEMP_FILES" | tee -a "$LOG_FILE"
fi

# Проверяем на большие файлы (возможно случайно добавленные)
log_security "Проверка на большие файлы..."
LARGE_FILES=$(find "$PROJECT_DIR" -type f -size +10M -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/coverage/*" 2>/dev/null || true)

if [ -n "$LARGE_FILES" ]; then
    log_security "📁 Найдены большие файлы (>10MB):"
    echo "$LARGE_FILES" | while read -r file; do
        size=$(du -h "$file" | cut -f1)
        echo "  $size - $file" | tee -a "$LOG_FILE"
    done
fi

# Проверяем git status на незакоммиченные изменения с секретами
if [ -d "$PROJECT_DIR/.git" ]; then
    log_security "Проверка git статуса..."
    cd "$PROJECT_DIR"
    
    # Проверяем staged файлы
    STAGED_FILES=$(git diff --cached --name-only 2>/dev/null || true)
    if [ -n "$STAGED_FILES" ]; then
        log_security "📋 Проверка staged файлов на секреты:"
        echo "$STAGED_FILES" | while read -r file; do
            if [ -f "$file" ]; then
                check_file_for_secrets "$file"
            fi
        done
    fi
fi

# Итоговый результат
echo "" | tee -a "$LOG_FILE"
if [ "$SECRETS_FOUND" = true ]; then
    log_security "🚨 НАЙДЕНЫ СЕКРЕТЫ! Проверьте файлы выше."
    echo "Лог сохранен в: $LOG_FILE"
    exit 1
else
    log_security "✅ Security scan завершен. Секреты не найдены."
    echo "Лог сохранен в: $LOG_FILE"
    exit 0
fi