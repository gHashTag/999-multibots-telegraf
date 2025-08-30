#!/bin/bash

# 🛡️ SECURITY TOKEN GUARD
# Проверяет код на наличие потенциальных токенов и секретов

set -e

echo "🛡️ [SECURITY GUARD] Проверка на утечку токенов..."

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Счетчики
FOUND_TOKENS=0
FOUND_SECRETS=0
TOTAL_ISSUES=0

# Функция для поиска токенов
check_for_tokens() {
    local pattern="$1"
    local description="$2"
    local severity="$3"
    
    echo -e "${BLUE}🔍 Проверка: $description${NC}"
    
    # Ищем в staged файлах
    local matches=$(git diff --cached --name-only | xargs grep -l "$pattern" 2>/dev/null || true)
    
    if [ -n "$matches" ]; then
        echo -e "${RED}❌ НАЙДЕНЫ $severity:${NC}"
        echo "$matches" | while read -r file; do
            echo -e "${RED}   📁 $file${NC}"
            # Показываем контекст
            git diff --cached "$file" | grep -A 2 -B 2 "$pattern" || true
        done
        TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
        
        if [ "$severity" = "КРИТИЧЕСКИЕ ТОКЕНЫ" ]; then
            FOUND_TOKENS=$((FOUND_TOKENS + 1))
        elif [ "$severity" = "ПОДОЗРИТЕЛЬНЫЕ СЕКРЕТЫ" ]; then
            FOUND_SECRETS=$((FOUND_SECRETS + 1))
        fi
    else
        echo -e "${GREEN}✅ $description - не найдено${NC}"
    fi
}

# Функция для проверки файлов на секреты
check_file_secrets() {
    local file="$1"
    local filename=$(basename "$file")
    
    # Пропускаем определенные файлы
    if [[ "$filename" =~ \.(lock|log|tmp|temp)$ ]] || [[ "$file" =~ node_modules ]] || [[ "$file" =~ \.git ]]; then
        return 0
    fi
    
    # Проверяем на потенциальные секреты
    if grep -q -E "(password|secret|token|key|api_key|auth_token)" "$file" 2>/dev/null; then
        echo -e "${YELLOW}⚠️  Подозрительный файл: $file${NC}"
        # Показываем строки с потенциальными секретами
        grep -n -E "(password|secret|token|key|api_key|auth_token)" "$file" | head -3 | while read -r line; do
            echo -e "${YELLOW}   📝 $line${NC}"
        done
    fi
}

echo "🚀 Начинаем проверку безопасности..."

# 1. Проверка на реальные токены Telegram
check_for_tokens \
    "[0-9]{8,10}:[A-Za-z0-9_-]{35}" \
    "Реальные токены Telegram ботов" \
    "КРИТИЧЕСКИЕ ТОКЕНЫ"

# 2. Проверка на API ключи
check_for_tokens \
    "sk-[A-Za-z0-9]{48}" \
    "OpenAI API ключи" \
    "КРИТИЧЕСКИЕ ТОКЕНЫ"

# 3. Проверка на другие API ключи
check_for_tokens \
    "[A-Za-z0-9]{32,64}" \
    "Длинные строки (потенциальные API ключи)" \
    "ПОДОЗРИТЕЛЬНЫЕ СЕКРЕТЫ"

# 4. Проверка на хардкод токенов
check_for_tokens \
    "BOT_TOKEN.*=.*['\"][A-Za-z0-9_-]+['\"]" \
    "Хардкод токенов в коде" \
    "КРИТИЧЕСКИЕ ТОКЕНЫ"

# 5. Проверка на секреты в переменных окружения
check_for_tokens \
    "SECRET.*=.*['\"][A-Za-z0-9_-]+['\"]" \
    "Хардкод секретов" \
    "КРИТИЧЕСКИЕ ТОКЕНЫ"

# 6. Проверка на пароли
check_for_tokens \
    "password.*=.*['\"][A-Za-z0-9_-]+['\"]" \
    "Хардкод паролей" \
    "КРИТИЧЕСКИЕ ТОКЕНЫ"

# 7. Проверка на приватные ключи
check_for_tokens \
    "-----BEGIN.*PRIVATE KEY-----" \
    "Приватные ключи" \
    "КРИТИЧЕСКИЕ ТОКЕНЫ"

# 8. Проверка на SSH ключи
check_for_tokens \
    "ssh-rsa.*[A-Za-z0-9+/]{100,}" \
    "SSH публичные ключи" \
    "ПОДОЗРИТЕЛЬНЫЕ СЕКРЕТЫ"

# 9. Проверка на webhook секреты
check_for_tokens \
    "webhook_secret.*=.*['\"][A-Za-z0-9_-]+['\"]" \
    "Webhook секреты" \
    "КРИТИЧЕСКИЕ ТОКЕНЫ"

# 10. Проверка на GitHub токены
check_for_tokens \
    "ghp_[A-Za-z0-9]{36}" \
    "GitHub Personal Access Tokens" \
    "КРИТИЧЕСКИЕ ТОКЕНЫ"

# 11. Проверка на Supabase ключи
check_for_tokens \
    "eyJ[A-Za-z0-9_-]{100,}" \
    "JWT токены (Supabase)" \
    "КРИТИЧЕСКИЕ ТОКЕНЫ"

echo ""
echo "📊 РЕЗУЛЬТАТЫ ПРОВЕРКИ БЕЗОПАСНОСТИ:"
echo "=================================="

if [ $TOTAL_ISSUES -eq 0 ]; then
    echo -e "${GREEN}✅ БЕЗОПАСНОСТЬ: Никаких токенов или секретов не найдено!${NC}"
    echo -e "${GREEN}🎉 Код готов к коммиту!${NC}"
    exit 0
else
    echo -e "${RED}❌ НАЙДЕНЫ ПРОБЛЕМЫ БЕЗОПАСНОСТИ:${NC}"
    echo -e "${RED}   🔴 Критических токенов: $FOUND_TOKENS${NC}"
    echo -e "${RED}   🟡 Подозрительных секретов: $FOUND_SECRETS${NC}"
    echo -e "${RED}   📊 Всего проблем: $TOTAL_ISSUES${NC}"
    echo ""
    echo -e "${YELLOW}💡 РЕКОМЕНДАЦИИ:${NC}"
    echo -e "${YELLOW}   1. Удалите все найденные токены из кода${NC}"
    echo -e "${YELLOW}   2. Используйте переменные окружения (.env файлы)${NC}"
    echo -e "${YELLOW}   3. Добавьте .env файлы в .gitignore${NC}"
    echo -e "${YELLOW}   4. Используйте безопасные моки для тестов${NC}"
    echo ""
    echo -e "${RED}🚫 КОММИТ ОТМЕНЕН из соображений безопасности!${NC}"
    echo -e "${RED}   Используйте 'git commit --no-verify' для принудительного коммита${NC}"
    echo -e "${RED}   (НЕ РЕКОМЕНДУЕТСЯ без исправления проблем!)${NC}"
    exit 1
fi
