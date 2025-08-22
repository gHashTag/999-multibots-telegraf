#!/bin/bash
# Тестовый скрипт для проверки работы Claude Flow интеграции

set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
TEST_LOG="$PROJECT_DIR/.claude/test-$(date +%Y%m%d_%H%M%S).log"

# Цвета
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

success() { echo -e "${GREEN}✅ $1${NC}" | tee -a "$TEST_LOG"; }
warning() { echo -e "${YELLOW}⚠️  $1${NC}" | tee -a "$TEST_LOG"; }
error() { echo -e "${RED}❌ $1${NC}" | tee -a "$TEST_LOG"; }
info() { echo -e "${BLUE}ℹ️  $1${NC}" | tee -a "$TEST_LOG"; }

echo "🧪 Claude Flow Integration Test"
echo "==============================="
echo ""
info "Проект: $PROJECT_DIR"
info "Время: $(date)"
info "Лог: $TEST_LOG"
echo ""

# 1. Подготовка тестовой среды
info "Подготовка тестовой среды..."
mkdir -p "$PROJECT_DIR/.claude/logs"
mkdir -p "$PROJECT_DIR/.hive-mind"

# 2. Тестовые промпты разной сложности
declare -a TEST_PROMPTS=(
    "Привет! Это простой тест."
    "Создай план проекта для разработки веб-приложения."
    "Проанализируй архитектуру микросервисов и дай рекомендации."
    "Напиши функцию на Python для сортировки массива."
)

echo "🎯 Запуск тестовых промптов:"
echo ""

TEST_RESULTS=()
SUCCESSFUL_TESTS=0
FAILED_TESTS=0

for i in "${!TEST_PROMPTS[@]}"; do
    PROMPT="${TEST_PROMPTS[$i]}"
    TEST_NUM=$((i + 1))
    
    info "Тест $TEST_NUM: ${PROMPT:0:50}..."
    
    # Засекаем время
    START_TIME=$(date +%s)
    
    # Запускаем скрипт интеграции
    if timeout 90 bash "$PROJECT_DIR/.claude/hooks/claude-flow-integration.sh" "$PROMPT" >> "$TEST_LOG" 2>&1; then
        END_TIME=$(date +%s)
        DURATION=$((END_TIME - START_TIME))
        
        success "Тест $TEST_NUM завершен успешно (${DURATION}s)"
        TEST_RESULTS+=("PASS")
        SUCCESSFUL_TESTS=$((SUCCESSFUL_TESTS + 1))
    else
        END_TIME=$(date +%s)
        DURATION=$((END_TIME - START_TIME))
        
        error "Тест $TEST_NUM завершился с ошибкой (${DURATION}s)"
        TEST_RESULTS+=("FAIL")
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    
    # Небольшая пауза между тестами
    sleep 2
done

echo ""

# 3. Проверка результатов
info "Проверка результатов тестирования..."

# Проверяем логи интеграции
INTEGRATION_LOGS_COUNT=$(ls -1 "$PROJECT_DIR/.claude/logs/claude-flow-integration_"*.log 2>/dev/null | wc -l || echo "0")
if [ "$INTEGRATION_LOGS_COUNT" -gt 0 ]; then
    success "Создано логов интеграции: $INTEGRATION_LOGS_COUNT"
else
    warning "Логи интеграции не найдены"
fi

# Проверяем hive-mind сессии
if [ -d "$PROJECT_DIR/.hive-mind/sessions" ]; then
    SESSIONS_COUNT=$(ls -1 "$PROJECT_DIR/.hive-mind/sessions" 2>/dev/null | wc -l || echo "0")
    if [ "$SESSIONS_COUNT" -gt 0 ]; then
        success "Создано сессий hive-mind: $SESSIONS_COUNT"
        
        # Проверяем последнюю сессию
        LATEST_SESSION=$(ls -t "$PROJECT_DIR/.hive-mind/sessions" 2>/dev/null | head -1)
        if [ -n "$LATEST_SESSION" ]; then
            info "Последняя сессия: $LATEST_SESSION"
            
            # Проверяем summary
            if [ -f "$PROJECT_DIR/.hive-mind/sessions/$LATEST_SESSION/summary.md" ]; then
                SUMMARY_SIZE=$(wc -c < "$PROJECT_DIR/.hive-mind/sessions/$LATEST_SESSION/summary.md" 2>/dev/null || echo "0")
                success "Summary создан: ${SUMMARY_SIZE} bytes"
                
                # Показываем первые строки summary
                info "Первые строки summary:"
                echo ""
                head -5 "$PROJECT_DIR/.hive-mind/sessions/$LATEST_SESSION/summary.md" 2>/dev/null | sed 's/^/  /' || echo "  (не удалось прочитать)"
                echo ""
            else
                warning "Summary не найден для последней сессии"
            fi
        fi
    else
        warning "Сессии hive-mind не найдены"
    fi
else
    warning "Директория .hive-mind/sessions не существует"
fi

# 4. Проверка производительности
echo ""
info "Анализ производительности..."

# Средняя продолжительность тестов
if [ -f "$TEST_LOG" ]; then
    AVG_DURATION=$(grep "завершен успешно" "$TEST_LOG" | grep -oE '\([0-9]+s\)' | sed 's/[()]//g' | sed 's/s//' | awk '{sum += $1; count++} END {if (count > 0) printf "%.1f", sum/count; else print "0"}')
    if [ "$AVG_DURATION" != "0" ]; then
        info "Средняя продолжительность успешных тестов: ${AVG_DURATION}s"
    fi
fi

# Размер проекта
PROJECT_SIZE=$(du -sh "$PROJECT_DIR" 2>/dev/null | cut -f1 || echo "unknown")
info "Размер проекта после тестов: $PROJECT_SIZE"

# 5. Итоговый отчет
echo ""
echo "📊 РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ:"
echo "=========================="
echo ""
echo "Всего тестов: ${#TEST_PROMPTS[@]}"
echo -e "${GREEN}✅ Успешно: $SUCCESSFUL_TESTS${NC}"
echo -e "${RED}❌ Ошибок: $FAILED_TESTS${NC}"

echo ""
echo "Детализация по тестам:"
for i in "${!TEST_PROMPTS[@]}"; do
    PROMPT="${TEST_PROMPTS[$i]}"
    RESULT="${TEST_RESULTS[$i]}"
    TEST_NUM=$((i + 1))
    
    if [ "$RESULT" = "PASS" ]; then
        echo -e "  ${GREEN}✅ Тест $TEST_NUM: PASS${NC} - ${PROMPT:0:40}..."
    else
        echo -e "  ${RED}❌ Тест $TEST_NUM: FAIL${NC} - ${PROMPT:0:40}..."
    fi
done

echo ""

# 6. Статус и рекомендации
if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}🎉 ВСЕ ТЕСТЫ ПРОШЛИ УСПЕШНО!${NC}"
    echo -e "${GREEN}Claude Flow интеграция работает корректно.${NC}"
    TEST_STATUS="SUCCESS"
else
    echo -e "${RED}❌ ОБНАРУЖЕНЫ ОШИБКИ В ТЕСТАХ${NC}"
    echo -e "${RED}Интеграция Claude Flow работает нестабильно.${NC}"
    TEST_STATUS="FAILED"
fi

echo ""
echo "🔧 РЕКОМЕНДАЦИИ:"
echo "==============="

if [ $FAILED_TESTS -gt 0 ]; then
    echo "1. Проверьте лог тестирования: $TEST_LOG"
    echo "2. Убедитесь что Claude Flow установлен: npm install -g claude-flow@alpha"
    echo "3. Проверьте сетевое соединение для загрузки пакетов"
    echo "4. Запустите валидацию: bash .claude/validate-claude-flow.sh"
fi

echo "5. Проверьте созданные сессии в .hive-mind/sessions/"
echo "6. Изучите логи интеграции в .claude/logs/"
echo "7. При необходимости очистите кэш: npm cache clean --force"

# 7. Создание отчета о тестировании
TEST_REPORT="$PROJECT_DIR/.claude/test-report.md"
cat > "$TEST_REPORT" << EOF
# Claude Flow Integration Test Report

**Дата:** $(date)  
**Статус:** $TEST_STATUS  
**Проект:** $(basename "$PROJECT_DIR")

## Результаты тестирования
- 🎯 Всего тестов: ${#TEST_PROMPTS[@]}
- ✅ Успешно: $SUCCESSFUL_TESTS
- ❌ Ошибок: $FAILED_TESTS
- 📊 Успешность: $((SUCCESSFUL_TESTS * 100 / ${#TEST_PROMPTS[@]}))%

## Тестируемые промпты
EOF

for i in "${!TEST_PROMPTS[@]}"; do
    PROMPT="${TEST_PROMPTS[$i]}"
    RESULT="${TEST_RESULTS[$i]}"
    TEST_NUM=$((i + 1))
    
    echo "$TEST_NUM. **$RESULT** - \`${PROMPT}\`" >> "$TEST_REPORT"
done

cat >> "$TEST_REPORT" << EOF

## Созданные ресурсы
- 📝 Логов интеграции: $INTEGRATION_LOGS_COUNT
- 🐝 Сессий hive-mind: $(ls -1 "$PROJECT_DIR/.hive-mind/sessions" 2>/dev/null | wc -l || echo "0")
- 📂 Размер проекта: $PROJECT_SIZE

## Файлы для анализа
- Лог тестирования: \`$TEST_LOG\`
- Логи интеграции: \`.claude/logs/claude-flow-integration_*.log\`
- Сессии Claude Flow: \`.hive-mind/sessions/\`

## Следующие шаги
$([ $FAILED_TESTS -eq 0 ] && echo "✅ Интеграция готова к использованию!" || echo "❌ Требуется устранение ошибок перед использованием.")

---
*Автоматически сгенерировано системой тестирования*
EOF

echo ""
info "📋 Отчет о тестировании сохранен: $TEST_REPORT"
info "📝 Лог тестирования: $TEST_LOG"

# Exit код
if [ $FAILED_TESTS -gt 0 ]; then
    exit 1
else
    exit 0
fi