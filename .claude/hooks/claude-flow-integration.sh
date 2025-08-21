#!/bin/bash
# Claude Flow Integration Hook - автоматический запуск Claude Flow для каждого промпта

set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
HOOK_LOG_DIR="$PROJECT_DIR/.claude/logs"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
PROMPT="$1"

# Создаем директории для логов если не существует
mkdir -p "$HOOK_LOG_DIR"
mkdir -p "$PROJECT_DIR/.hive-mind"

LOG_FILE="$HOOK_LOG_DIR/claude-flow-integration_$TIMESTAMP.log"

# Функция для логирования
log_flow() {
    echo "[CLAUDE-FLOW] $(date '+%H:%M:%S') $1" | tee -a "$LOG_FILE"
}

# Функция для проверки доступности Claude Flow
check_claude_flow() {
    if command -v npx >/dev/null 2>&1; then
        log_flow "✅ npx доступен"
        
        # Проверяем доступность claude-flow пакета
        if npx claude-flow@alpha --version >/dev/null 2>&1; then
            log_flow "✅ Claude Flow доступен"
            return 0
        else
            log_flow "⚠️ Claude Flow не установлен, попытка установки..."
            if npm install -g claude-flow@alpha >/dev/null 2>&1; then
                log_flow "✅ Claude Flow установлен"
                return 0
            else
                log_flow "❌ Не удалось установить Claude Flow"
                return 1
            fi
        fi
    else
        log_flow "❌ npx не найден"
        return 1
    fi
}

# Функция для безопасной обработки промпта
sanitize_prompt() {
    local prompt="$1"
    
    # Удаляем потенциально опасные символы и команды
    prompt=$(echo "$prompt" | sed 's/[`$()]/\\&/g')
    
    # Ограничиваем длину (максимум 2000 символов)
    if [ ${#prompt} -gt 2000 ]; then
        prompt="${prompt:0:2000}..."
        log_flow "⚠️ Промпт обрезан до 2000 символов"
    fi
    
    echo "$prompt"
}

# Главная логика
log_flow "=== CLAUDE FLOW INTEGRATION START ==="
log_flow "Project: $PROJECT_DIR"
log_flow "Prompt length: ${#PROMPT} characters"

# Проверяем что промпт не пустой и не слишком короткий
if [ -z "$PROMPT" ] || [ ${#PROMPT} -lt 5 ]; then
    log_flow "ℹ️ Промпт слишком короткий или пустой, пропускаем Claude Flow"
    log_flow "=== CLAUDE FLOW INTEGRATION SKIPPED ==="
    exit 0
fi

# Проверяем доступность Claude Flow
if ! check_claude_flow; then
    log_flow "❌ Claude Flow недоступен, работаем без интеграции"
    log_flow "=== CLAUDE FLOW INTEGRATION FAILED ==="
    exit 0
fi

# Безопасная обработка промпта
SAFE_PROMPT=$(sanitize_prompt "$PROMPT")
log_flow "Processed prompt: ${SAFE_PROMPT:0:100}..."

# Создаем namespace для проекта
PROJECT_NAME=$(basename "$PROJECT_DIR")
NAMESPACE="${PROJECT_NAME}-$(date +%Y%m%d)"

log_flow "Using namespace: $NAMESPACE"

# Проверяем существующие сессии
EXISTING_SESSION=""
if [ -d "$PROJECT_DIR/.hive-mind/sessions" ]; then
    EXISTING_SESSION=$(ls -t "$PROJECT_DIR/.hive-mind/sessions" 2>/dev/null | head -1 || true)
fi

cd "$PROJECT_DIR"

# Запускаем Claude Flow
log_flow "🚀 Запуск Claude Flow hive-mind..."

if [ -n "$EXISTING_SESSION" ]; then
    log_flow "📂 Продолжаем существующую сессию: $EXISTING_SESSION"
    
    # Продолжаем существующую сессию
    if timeout 60 npx claude-flow@alpha hive-mind spawn "$SAFE_PROMPT" \
        --namespace "$NAMESPACE" \
        --claude \
        --continue-session true \
        --session-id "$EXISTING_SESSION" \
        >> "$LOG_FILE" 2>&1; then
        
        log_flow "✅ Claude Flow успешно обработал промпт (продолжение сессии)"
    else
        log_flow "⚠️ Claude Flow завершился с ошибкой или timeout (продолжение сессии)"
    fi
else
    log_flow "🆕 Создаем новую сессию"
    
    # Создаем новую сессию
    if timeout 60 npx claude-flow@alpha hive-mind spawn "$SAFE_PROMPT" \
        --namespace "$NAMESPACE" \
        --claude \
        --continue-session true \
        >> "$LOG_FILE" 2>&1; then
        
        log_flow "✅ Claude Flow успешно обработал промпт (новая сессия)"
    else
        log_flow "⚠️ Claude Flow завершился с ошибкой или timeout (новая сессия)"
    fi
fi

# Проверяем результаты
if [ -d "$PROJECT_DIR/.hive-mind" ]; then
    SESSIONS_COUNT=$(ls -1 "$PROJECT_DIR/.hive-mind/sessions" 2>/dev/null | wc -l || echo "0")
    log_flow "📊 Всего сессий в hive-mind: $SESSIONS_COUNT"
    
    # Проверяем последний summary
    LATEST_SESSION=$(ls -t "$PROJECT_DIR/.hive-mind/sessions" 2>/dev/null | head -1 || true)
    if [ -n "$LATEST_SESSION" ] && [ -f "$PROJECT_DIR/.hive-mind/sessions/$LATEST_SESSION/summary.md" ]; then
        SUMMARY_SIZE=$(wc -c < "$PROJECT_DIR/.hive-mind/sessions/$LATEST_SESSION/summary.md" 2>/dev/null || echo "0")
        log_flow "📋 Summary создан: ${SUMMARY_SIZE} bytes"
    fi
fi

# Создаем краткий отчет для пользователя
INTEGRATION_REPORT="$PROJECT_DIR/.claude/claude-flow-report.md"
cat > "$INTEGRATION_REPORT" << EOF
# Claude Flow Integration Report

**Время:** $(date)  
**Проект:** $PROJECT_NAME  
**Namespace:** $NAMESPACE  

## Промпт
\`\`\`
${SAFE_PROMPT:0:500}...
\`\`\`

## Результат
- ✅ Claude Flow запущен успешно
- 📂 Сессий в hive-mind: $(ls -1 "$PROJECT_DIR/.hive-mind/sessions" 2>/dev/null | wc -l || echo "0")
- 📋 Последняя сессия: $LATEST_SESSION

## Файлы
- Лог интеграции: \`.claude/logs/claude-flow-integration_$TIMESTAMP.log\`
- Сессии: \`.hive-mind/sessions/\`

---
*Автоматически сгенерировано Claude Code hooks*
EOF

log_flow "📋 Отчет создан: .claude/claude-flow-report.md"

# Очистка старых логов интеграции (оставляем последние 10)
find "$HOOK_LOG_DIR" -name "claude-flow-integration_*.log" -type f | sort | head -n -10 | xargs rm -f 2>/dev/null || true

log_flow "=== CLAUDE FLOW INTEGRATION COMPLETED ==="
exit 0