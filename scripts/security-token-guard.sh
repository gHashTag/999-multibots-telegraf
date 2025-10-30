#!/bin/bash

# Security Token Guard - Защита от утечки секретов
# Блокирует коммиты с хардкод токенами и API ключами

set -e

echo "🔍 Проверка на утечку секретов в изменённых файлах..."

# Получаем список файлов для проверки (только изменённые)
FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|js|tsx|jsx|json|env|yml|yaml)$' || true)

if [ -z "$FILES" ]; then
    echo "📭 Нет файлов для проверки"
    exit 0
fi

FOUND_SECRETS=0

# Функция для проверки паттернов
check_pattern() {
    local pattern="$1"
    local description="$2"
    local severity="${3:-error}"
    
    # Проверяем каждый файл
    for file in $FILES; do
        if [ -f "$file" ]; then
            # Ищем паттерн в staged изменениях
            if git diff --cached "$file" | grep -E "$pattern" > /dev/null 2>&1; then
                if [ "$severity" = "error" ]; then
                    echo "🚨 КРИТИЧНО: $description найден в $file"
                    FOUND_SECRETS=1
                else
                    echo "⚠️  ВНИМАНИЕ: $description найден в $file"
                fi
            fi
        fi
    done
}

# Проверка на Kie.ai API ключи (32 символа hex начинается с f52f224a)
check_pattern "['\"]f52f224a[a-f0-9]{24}['\"]" "Kie.ai API ключ"

# Проверка на любые 32-символьные hex ключи (потенциальные API keys)
check_pattern "['\"][a-f0-9]{32}['\"]" "Потенциальный API ключ (32 hex)" "warning"

# Проверка на 40-символьные hex ключи (потенциальные токены)
check_pattern "['\"][a-f0-9]{40}['\"]" "Потенциальный токен (40 hex)" "warning"

# Проверка на Telegram Bot токены
check_pattern "[0-9]{8,10}:[a-zA-Z0-9_-]{35}" "Telegram Bot токен"

# Проверка на OpenAI API ключи
check_pattern "sk-[a-zA-Z0-9]{48}" "OpenAI API ключ"

# Проверка на AWS Access Keys
check_pattern "AKIA[0-9A-Z]{16}" "AWS Access Key"

# Проверка на AWS Secret Keys
check_pattern "['\"][a-zA-Z0-9/+=]{40}['\"]" "Потенциальный AWS Secret Key" "warning"

# Проверка на Google API ключи
check_pattern "AIza[0-9A-Za-z\\-_]{35}" "Google API ключ"

# Проверка на GitHub токены
check_pattern "ghp_[a-zA-Z0-9]{36}" "GitHub Personal Access Token"
check_pattern "gho_[a-zA-Z0-9]{36}" "GitHub OAuth Token"
check_pattern "github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}" "GitHub Fine-grained PAT"

# Проверка на приватные ключи
check_pattern "-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----" "Приватный ключ"

# Проверка на JWT токены (базовая проверка)
check_pattern "eyJ[a-zA-Z0-9_-]+\\.eyJ[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+" "JWT токен" "warning"

# Проверка на паттерн "process.env.KEY || 'hardcoded_value'"
for file in $FILES; do
    if [ -f "$file" ]; then
        if git diff --cached "$file" | grep -E "process\\.env\\.[A-Z_]+\\s*\\|\\|\\s*['\"][^'\"]{20,}['\"]" > /dev/null 2>&1; then
            # Исключаем безопасные fallback значения
            if ! git diff --cached "$file" | grep -E "\\|\\|\\s*['\"]undefined['\"]|\\|\\|\\s*['\"]null['\"]|\\|\\|\\s*['\"]development['\"]|\\|\\|\\s*['\"]test['\"]" > /dev/null 2>&1; then
                echo "⚠️  ОПАСНЫЙ ПАТТЕРН: Fallback на хардкод значение в $file"
                echo "   Используйте проверку и выход при отсутствии переменной:"
                echo "   if (!process.env.API_KEY) throw new Error('API_KEY required')"
                FOUND_SECRETS=1
            fi
        fi
    fi
done

# Проверка на base64 encoded секреты
for file in $FILES; do
    if [ -f "$file" ]; then
        # Ищем длинные base64 строки (потенциальные encoded секреты)
        if git diff --cached "$file" | grep -E "['\"][A-Za-z0-9+/]{50,}={0,2}['\"]" > /dev/null 2>&1; then
            echo "⚠️  ПОДОЗРИТЕЛЬНО: Длинная base64 строка в $file (возможно, encoded секрет)"
        fi
    fi
done

# Проверка на URL с встроенными credentials
check_pattern "https?://[^:]+:[^@]+@" "URL с встроенными credentials"

# Проверка на подозрительные комментарии
for file in $FILES; do
    if [ -f "$file" ]; then
        if git diff --cached "$file" | grep -iE "//.*TODO.*remove.*before.*commit|//.*FIXME.*secret|//.*temporary.*password" > /dev/null 2>&1; then
            echo "⚠️  ПОДОЗРИТЕЛЬНЫЙ КОММЕНТАРИЙ в $file"
        fi
    fi
done

# Результат проверки
if [ $FOUND_SECRETS -eq 1 ]; then
    echo ""
    echo "❌ ОШИБКА: Обнаружены потенциальные секреты в коде!"
    echo ""
    echo "📚 Рекомендации:"
    echo "   1. Используйте переменные окружения: process.env.API_KEY"
    echo "   2. Добавьте .env файл в .gitignore"
    echo "   3. Для тестов используйте mock значения или test credentials"
    echo "   4. Если это false positive, добавьте комментарий: // safe: test value"
    echo ""
    echo "🔧 Исправьте проблемы и попробуйте снова:"
    echo "   git add <fixed-files>"
    echo "   git commit"
    echo ""
    exit 1
else
    echo "✅ Проверка безопасности пройдена - секреты не обнаружены"
    exit 0
fi