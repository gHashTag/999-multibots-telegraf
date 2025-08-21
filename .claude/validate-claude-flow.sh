#!/bin/bash
# Валидация Claude Flow интеграции - проверяет что все настроено и работает

set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
CLAUDE_DIR="$PROJECT_DIR/.claude"
VALIDATION_LOG="$CLAUDE_DIR/validation-$(date +%Y%m%d_%H%M%S).log"

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функции для цветного вывода
success() { echo -e "${GREEN}✅ $1${NC}" | tee -a "$VALIDATION_LOG"; }
warning() { echo -e "${YELLOW}⚠️  $1${NC}" | tee -a "$VALIDATION_LOG"; }
error() { echo -e "${RED}❌ $1${NC}" | tee -a "$VALIDATION_LOG"; }
info() { echo -e "${BLUE}ℹ️  $1${NC}" | tee -a "$VALIDATION_LOG"; }

# Счетчики результатов
CHECKS_TOTAL=0
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNINGS=0

check() {
    local description="$1"
    local command="$2"
    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
    
    info "Проверка: $description"
    
    if eval "$command" >> "$VALIDATION_LOG" 2>&1; then
        success "$description"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
        return 0
    else
        error "$description"
        CHECKS_FAILED=$((CHECKS_FAILED + 1))
        return 1
    fi
}

check_warning() {
    local description="$1"
    local command="$2"
    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
    
    info "Проверка: $description"
    
    if eval "$command" >> "$VALIDATION_LOG" 2>&1; then
        success "$description"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
        return 0
    else
        warning "$description"
        CHECKS_WARNINGS=$((CHECKS_WARNINGS + 1))
        return 1
    fi
}

echo "🔍 Claude Flow Integration Validation"
echo "====================================="
echo ""
info "Проект: $PROJECT_DIR"
info "Время: $(date)"
info "Лог: $VALIDATION_LOG"
echo ""

# 1. Проверка основных файлов
echo "📁 Проверка файловой структуры:"
check "Файл настроек существует" "[ -f '$CLAUDE_DIR/settings.json' ]"
check "Скрипт интеграции существует" "[ -f '$CLAUDE_DIR/hooks/claude-flow-integration.sh' ]"
check "Скрипт интеграции исполняемый" "[ -x '$CLAUDE_DIR/hooks/claude-flow-integration.sh' ]"
check "Директория логов существует" "[ -d '$CLAUDE_DIR/logs' ]"

# 2. Проверка настроек JSON
echo ""
echo "⚙️ Проверка конфигурации:"
if command -v jq >/dev/null 2>&1; then
    check "Синтаксис settings.json корректен" "jq empty '$CLAUDE_DIR/settings.json'"
    check "UserPromptSubmit хук настроен" "jq -e '.hooks[] | select(.event == \"UserPromptSubmit\" and .matchers[0].user_prompt == \".*\")' '$CLAUDE_DIR/settings.json' > /dev/null"
else
    warning "jq не найден, пропуск проверки JSON"
    CHECKS_WARNINGS=$((CHECKS_WARNINGS + 1))
fi

# 3. Проверка системных зависимостей
echo ""
echo "🔧 Проверка зависимостей:"
check "Node.js доступен" "command -v node >/dev/null 2>&1"
check "npm доступен" "command -v npm >/dev/null 2>&1"
check "npx доступен" "command -v npx >/dev/null 2>&1"

# 4. Проверка Claude Flow
echo ""
echo "🤖 Проверка Claude Flow:"
check_warning "Claude Flow глобально установлен" "npx claude-flow@alpha --version >/dev/null 2>&1"

# Если Claude Flow не установлен, пробуем установить
if ! npx claude-flow@alpha --version >/dev/null 2>&1; then
    info "Попытка установки Claude Flow..."
    if npm install -g claude-flow@alpha >/dev/null 2>&1; then
        success "Claude Flow установлен успешно"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    else
        warning "Не удалось установить Claude Flow автоматически"
        info "Выполните: npm install -g claude-flow@alpha"
    fi
fi

# 5. Тестовый запуск интеграции
echo ""
echo "🧪 Тестовый запуск:"
TEST_PROMPT="Тестовый промпт для проверки Claude Flow интеграции"

# Создаем тестовую среду
mkdir -p "$PROJECT_DIR/.hive-mind"

if bash "$CLAUDE_DIR/hooks/claude-flow-integration.sh" "$TEST_PROMPT" >/dev/null 2>&1; then
    success "Скрипт интеграции выполняется без ошибок"
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
else
    error "Ошибка при выполнении скрипта интеграции"
    CHECKS_FAILED=$((CHECKS_FAILED + 1))
fi
CHECKS_TOTAL=$((CHECKS_TOTAL + 1))

# 6. Проверка результатов интеграции
echo ""
echo "📊 Проверка результатов:"
check_warning "Директория .hive-mind создана" "[ -d '$PROJECT_DIR/.hive-mind' ]"

if [ -d "$PROJECT_DIR/.hive-mind/sessions" ]; then
    SESSIONS_COUNT=$(ls -1 "$PROJECT_DIR/.hive-mind/sessions" 2>/dev/null | wc -l || echo "0")
    if [ "$SESSIONS_COUNT" -gt 0 ]; then
        success "Найдено сессий Claude Flow: $SESSIONS_COUNT"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    else
        warning "Сессии Claude Flow не найдены"
        CHECKS_WARNINGS=$((CHECKS_WARNINGS + 1))
    fi
    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
fi

# 7. Проверка логов
echo ""
echo "📝 Проверка логирования:"
INTEGRATION_LOGS=$(ls -1 "$CLAUDE_DIR/logs/claude-flow-integration_"*.log 2>/dev/null | wc -l || echo "0")
if [ "$INTEGRATION_LOGS" -gt 0 ]; then
    success "Найдено логов интеграции: $INTEGRATION_LOGS"
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
    
    # Показываем последний лог
    LATEST_LOG=$(ls -t "$CLAUDE_DIR/logs/claude-flow-integration_"*.log 2>/dev/null | head -1)
    if [ -f "$LATEST_LOG" ]; then
        info "Последний лог интеграции:"
        echo ""
        tail -5 "$LATEST_LOG" | sed 's/^/  /'
        echo ""
    fi
else
    warning "Логи интеграции не найдены"
    CHECKS_WARNINGS=$((CHECKS_WARNINGS + 1))
fi
CHECKS_TOTAL=$((CHECKS_TOTAL + 1))

# 8. Проверка отчетов
if [ -f "$PROJECT_DIR/.claude/claude-flow-report.md" ]; then
    success "Отчет интеграции создан"
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
else
    warning "Отчет интеграции не найден"  
    CHECKS_WARNINGS=$((CHECKS_WARNINGS + 1))
fi
CHECKS_TOTAL=$((CHECKS_TOTAL + 1))

# Итоговый отчет
echo ""
echo "📊 РЕЗУЛЬТАТЫ ВАЛИДАЦИИ:"
echo "======================="
echo ""
echo "Всего проверок: $CHECKS_TOTAL"
echo -e "${GREEN}✅ Успешно: $CHECKS_PASSED${NC}"
echo -e "${YELLOW}⚠️  Предупреждения: $CHECKS_WARNINGS${NC}" 
echo -e "${RED}❌ Ошибки: $CHECKS_FAILED${NC}"
echo ""

# Общий статус
if [ $CHECKS_FAILED -eq 0 ]; then
    if [ $CHECKS_WARNINGS -eq 0 ]; then
        echo -e "${GREEN}🎉 ВСЕ ПРОВЕРКИ ПРОШЛИ УСПЕШНО!${NC}"
        echo -e "${GREEN}Claude Flow полностью интегрирован и готов к работе.${NC}"
        OVERALL_STATUS="SUCCESS"
    else
        echo -e "${YELLOW}⚠️  ИНТЕГРАЦИЯ РАБОТАЕТ С ПРЕДУПРЕЖДЕНИЯМИ${NC}"
        echo -e "${YELLOW}Некоторые компоненты могут работать не оптимально.${NC}"
        OVERALL_STATUS="WARNING"
    fi
else
    echo -e "${RED}❌ ОБНАРУЖЕНЫ КРИТИЧЕСКИЕ ОШИБКИ${NC}"
    echo -e "${RED}Интеграция Claude Flow требует исправлений.${NC}"
    OVERALL_STATUS="ERROR"
fi

echo ""
echo "🔧 РЕКОМЕНДАЦИИ:"
echo "==============="

if [ $CHECKS_FAILED -gt 0 ]; then
    echo "1. Исправьте критические ошибки выше"
    echo "2. Проверьте права доступа к файлам (chmod +x)"
    echo "3. Убедитесь что все зависимости установлены"
fi

if [ $CHECKS_WARNINGS -gt 0 ]; then
    echo "4. Установите Claude Flow глобально: npm install -g claude-flow@alpha"
    echo "5. Проверьте настройки хуков в .claude/settings.json"
fi

echo "6. Запустите тестовый промпт в Claude Code для проверки"
echo "7. Проверьте логи в .claude/logs/ для отладки"
echo ""

# Создание summary файла
SUMMARY_FILE="$CLAUDE_DIR/validation-summary.md"
cat > "$SUMMARY_FILE" << EOF
# Claude Flow Integration Validation Summary

**Дата:** $(date)  
**Статус:** $OVERALL_STATUS  
**Проект:** $(basename "$PROJECT_DIR")

## Результаты
- ✅ Успешно: $CHECKS_PASSED/$CHECKS_TOTAL
- ⚠️ Предупреждения: $CHECKS_WARNINGS
- ❌ Ошибки: $CHECKS_FAILED

## Проверенные компоненты
- [$([ $CHECKS_FAILED -eq 0 ] && echo "x" || echo " ")] Файловая структура
- [$([ -f "$CLAUDE_DIR/settings.json" ] && echo "x" || echo " ")] Конфигурация хуков
- [$(command -v npx >/dev/null 2>&1 && echo "x" || echo " ")] Системные зависимости
- [$(npx claude-flow@alpha --version >/dev/null 2>&1 && echo "x" || echo " ")] Claude Flow доступность
- [$([ -d "$PROJECT_DIR/.hive-mind" ] && echo "x" || echo " ")] Рабочая среда

## Действия при ошибках
1. Проверьте лог валидации: \`$VALIDATION_LOG\`
2. Исправьте критические ошибки
3. Повторите валидацию: \`bash .claude/validate-claude-flow.sh\`

## Тестирование
После исправления ошибок протестируйте:
\`\`\`bash
# Отправьте любой промпт в Claude Code
# Проверьте логи интеграции
ls -la .claude/logs/claude-flow-integration_*.log

# Проверьте создание сессий
ls -la .hive-mind/sessions/
\`\`\`

---
*Автоматически сгенерировано системой валидации*
EOF

echo "📋 Summary сохранен: $SUMMARY_FILE"
echo "📝 Полный лог: $VALIDATION_LOG"

# Exit код в зависимости от результатов
if [ $CHECKS_FAILED -gt 0 ]; then
    exit 1
elif [ $CHECKS_WARNINGS -gt 0 ]; then
    exit 2  
else
    exit 0
fi