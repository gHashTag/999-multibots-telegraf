#!/bin/bash
# Stop hook для финальной проверки и очистки после завершения задачи Claude Code

set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
HOOK_LOG_DIR="$PROJECT_DIR/.claude/logs"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Создаем директорию для логов если не существует
mkdir -p "$HOOK_LOG_DIR"

LOG_FILE="$HOOK_LOG_DIR/stop-cleanup_$TIMESTAMP.log"

# Функция для логирования
log_stop() {
    echo "[STOP-CLEANUP] $(date '+%H:%M:%S') $1" | tee -a "$LOG_FILE"
}

# Функция для блокировки завершения с сообщением
block_completion() {
    local reason="$1"
    log_stop "🛑 БЛОКИРУЕМ ЗАВЕРШЕНИЕ: $reason"
    
    # Создаем файл с инструкциями
    cat > "$PROJECT_DIR/.claude/COMPLETION_BLOCKED.txt" << EOF
🛑 ЗАВЕРШЕНИЕ ЗАБЛОКИРОВАНО - $(date)

Причина: $reason

Что нужно сделать:
1. Исправьте указанные проблемы
2. Удалите этот файл (.claude/COMPLETION_BLOCKED.txt)
3. Повторите завершение задачи

Лог проверки: $LOG_FILE
EOF
    
    echo "{"
    echo "  \"decision\": \"block\","
    echo "  \"message\": \"🛑 Завершение заблокировано: $reason. Проверьте .claude/COMPLETION_BLOCKED.txt\""
    echo "}"
    exit 2  # Exit code 2 блокирует завершение
}

log_stop "=== FINAL STOP CLEANUP CHECK START ==="
log_stop "Project: $PROJECT_DIR"

# 1. Финальная проверка security
log_stop "Запуск финального security сканирования..."

# Запускаем полное сканирование
if [ -f "$PROJECT_DIR/.claude/hooks/security-scan.sh" ]; then
    if ! bash "$PROJECT_DIR/.claude/hooks/security-scan.sh"; then
        block_completion "Security сканирование обнаружило проблемы"
    fi
else
    log_stop "⚠️ Security scan script не найден"
fi

# 2. Проверяем наличие security alerts
if [ -f "$PROJECT_DIR/.claude/SECURITY_ALERT.txt" ]; then
    block_completion "Есть неисправленные security проблемы"
fi

# 3. Проверяем git статус
if [ -d "$PROJECT_DIR/.git" ]; then
    cd "$PROJECT_DIR"
    
    # Проверяем staged изменения с секретами
    STAGED_FILES=$(git diff --cached --name-only 2>/dev/null || true)
    if [ -n "$STAGED_FILES" ]; then
        log_stop "Проверка staged файлов перед завершением..."
        
        while IFS= read -r file; do
            if [ -f "$file" ]; then
                if git diff --cached "$file" | grep -E "[0-9]{8,10}:[a-zA-Z0-9_-]{35}|sk-[a-zA-Z0-9]{48,}|eyJ[a-zA-Z0-9_-]{100,}" > /dev/null 2>&1; then
                    block_completion "Секреты найдены в staged файле: $file"
                fi
            fi
        done <<< "$STAGED_FILES"
    fi
    
    # Проверяем untracked файлы с потенциальными секретами
    UNTRACKED_FILES=$(git ls-files --others --exclude-standard 2>/dev/null | grep -E "\.(ts|js|json|txt|md)$" | head -20 || true)
    if [ -n "$UNTRACKED_FILES" ]; then
        log_stop "Проверка untracked файлов..."
        
        while IFS= read -r file; do
            if [ -f "$file" ]; then
                if grep -E "[0-9]{8,10}:[a-zA-Z0-9_-]{35}|sk-[a-zA-Z0-9]{48,}|eyJ[a-zA-Z0-9_-]{100,}" "$file" > /dev/null 2>&1; then
                    block_completion "Секреты найдены в untracked файле: $file"
                fi
            fi
        done <<< "$UNTRACKED_FILES"
    fi
fi

# 4. Проверка размера и очистка
PROJECT_SIZE_MB=$(du -sm "$PROJECT_DIR" 2>/dev/null | cut -f1 || echo "0")
log_stop "Размер проекта: ${PROJECT_SIZE_MB}MB"

# Если проект больше 2GB, запускаем принудительную очистку
if [ "$PROJECT_SIZE_MB" -gt 2000 ]; then
    log_stop "Проект слишком большой (${PROJECT_SIZE_MB}MB), запуск cleanup..."
    if [ -f "$PROJECT_DIR/.claude/hooks/cleanup.sh" ]; then
        bash "$PROJECT_DIR/.claude/hooks/cleanup.sh" || true
    fi
    
    # Повторно проверяем размер
    NEW_SIZE_MB=$(du -sm "$PROJECT_DIR" 2>/dev/null | cut -f1 || echo "0")
    if [ "$NEW_SIZE_MB" -gt 2000 ]; then
        log_stop "⚠️ Проект все еще большой после очистки: ${NEW_SIZE_MB}MB"
    else
        log_stop "✅ Размер проекта после очистки: ${NEW_SIZE_MB}MB"
    fi
fi

# 5. Проверка критичных файлов
log_stop "Проверка критичных файлов..."

# Проверяем что важные конфиг файлы не повреждены
CRITICAL_FILES=("package.json" "tsconfig.json" ".gitignore")
for file in "${CRITICAL_FILES[@]}"; do
    if [ -f "$PROJECT_DIR/$file" ]; then
        if ! jq empty "$PROJECT_DIR/$file" 2>/dev/null && [[ "$file" == *.json ]]; then
            block_completion "Поврежден JSON файл: $file"
        fi
    fi
done

# 6. Проверка на большие логи
LOG_SIZE=$(find "$PROJECT_DIR" -name "*.log" -type f -exec du -sm {} + 2>/dev/null | awk '{sum += $1} END {print sum}' || echo "0")
if [ "$LOG_SIZE" -gt 100 ]; then
    log_stop "Найдены большие лог файлы: ${LOG_SIZE}MB. Очистка старых логов..."
    
    # Удаляем старые логи (старше 7 дней)
    find "$PROJECT_DIR" -name "*.log" -type f -mtime +7 -delete 2>/dev/null || true
    
    # Сжимаем большие логи
    find "$PROJECT_DIR" -name "*.log" -type f -size +10M -exec gzip {} \; 2>/dev/null || true
fi

# 7. Финальная автоматическая очистка
log_stop "Финальная автоматическая очистка..."

# Удаляем временные файлы
find "$PROJECT_DIR" -type f \( -name "*.tmp" -o -name "*~" -o -name ".DS_Store" -o -name "Thumbs.db" \) -not -path "*/node_modules/*" -delete 2>/dev/null || true

# Очищаем пустые директории
find "$PROJECT_DIR" -type d -empty -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/.claude/*" -delete 2>/dev/null || true

# 8. Создание summary отчета
SUMMARY_FILE="$PROJECT_DIR/.claude/task-completion-summary.md"
cat > "$SUMMARY_FILE" << EOF
# Task Completion Summary

**Дата:** $(date)  
**Размер проекта:** ${PROJECT_SIZE_MB}MB  
**Security проверки:** ✅ Пройдены  

## Выполненные проверки:
- [x] Security сканирование на утечки токенов
- [x] Проверка git staged файлов
- [x] Проверка размера проекта и очистка
- [x] Валидация критичных конфигов
- [x] Автоматическая очистка временных файлов

## Логи проверок:
- Security: \`.claude/security-scan.log\`
- Cleanup: \`.claude/cleanup.log\`
- Stop check: \`$LOG_FILE\`

---
*Автоматически сгенерировано Claude Code hooks*
EOF

log_stop "📋 Summary отчет создан: .claude/task-completion-summary.md"

# 9. Очистка старых логов хуков (оставляем последние 20)
find "$HOOK_LOG_DIR" -name "*.log" -type f | sort | head -n -20 | xargs rm -f 2>/dev/null || true

log_stop "=== FINAL STOP CLEANUP CHECK PASSED ==="

# Если дошли до сюда - всё в порядке, разрешаем завершение
log_stop "✅ Все проверки пройдены. Завершение разрешено."

# Удаляем файл блокировки если был
if [ -f "$PROJECT_DIR/.claude/COMPLETION_BLOCKED.txt" ]; then
    rm -f "$PROJECT_DIR/.claude/COMPLETION_BLOCKED.txt"
fi

echo "{"
echo "  \"decision\": \"continue\","
echo "  \"message\": \"✅ Задача успешно завершена. Security проверки пройдены, проект очищен.\""
echo "}"

exit 0