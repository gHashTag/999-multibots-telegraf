#!/bin/bash

# 🔐 Pre-commit hook для блокировки секретов
# Установка: ln -sf ../../scripts/pre-commit-security.sh .git/hooks/pre-commit

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'  
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔒 Проверка безопасности перед коммитом...${NC}"

# Паттерны опасных секретов
DANGEROUS_PATTERNS=(
    "sk-[a-zA-Z0-9]{20,}"                      # OpenAI API keys
    "[0-9]{8,}:AA[a-zA-Z0-9_-]{35}"           # Real Telegram bot tokens  
    "***REMOVED***"                       # Replicate tokens
    "***REMOVED***"                      # GitHub personal tokens
    "***REMOVED***"                         # AWS Access Key
    "mongodb://[^:]*:[^@]*@"                   # MongoDB with credentials
    "postgres://[^:]*:[^@]*@"                  # PostgreSQL with credentials
)

# Примеры паттернов для блокировки (вместо реальных секретов)
# НИКОГДА НЕ ДОБАВЛЯЙТЕ СЮДА РЕАЛЬНЫЕ СЕКРЕТЫ!
COMPROMISED_SECRETS=(
    # Здесь должны быть только шаблоны для примера
    # Не добавляйте сюда реальные секреты!
)

# Безопасные исключения (примеры, которые разрешены)
SAFE_EXAMPLES=(
    "1234567890:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    "your_bot_token_from_botfather"
    "your_openai_api_key_here"
    "sk-proj-EXAMPLE_OPENAI_KEY_REPLACE_ME"
    "r8_EXAMPLE_REPLICATE_TOKEN_REPLACE_ME"
)

BLOCKED=0

# Получаем список файлов для коммита
if git rev-parse --verify HEAD >/dev/null 2>&1; then
    against=HEAD
else
    # Начальный коммит: diff против пустого дерева
    against=$(git hash-object -t tree /dev/null)
fi

# Файлы, добавленные или измененные в этом коммите  
staged_files=$(git diff --cached --name-only --diff-filter=ACM $against)

if [[ -z "$staged_files" ]]; then
    echo -e "${GREEN}✅ Нет файлов для проверки${NC}"
    exit 0
fi

echo "Проверяю файлы: $(echo $staged_files | wc -w) файлов"

# Проверяем каждый staged файл
for file in $staged_files; do
    # Пропускаем бинарные файлы и директории
    if [[ -d "$file" ]] || ! git show ":$file" >/dev/null 2>&1; then
        continue
    fi
    
    # Получаем содержимое staged версии файла
    file_content=$(git show ":$file" 2>/dev/null || echo "")
    
    if [[ -z "$file_content" ]]; then
        continue
    fi
    
    # Проверяем на скомпрометированные секреты (ВСЕГДА блокируем)
    for secret in "${COMPROMISED_SECRETS[@]}"; do
        if echo "$file_content" | grep -q "$secret"; then
            echo -e "${RED}❌ ЗАБЛОКИРОВАНО: Скомпрометированный секрет в $file${NC}"
            echo -e "   🚨 Секрет: ${secret:0:20}..."
            echo -e "   💡 Этот ключ был скомпрометирован и не должен использоваться!"
            BLOCKED=1
        fi
    done
    
    # Проверяем на опасные паттерны (но пропускаем безопасные примеры)
    for pattern in "${DANGEROUS_PATTERNS[@]}"; do
        matches=$(echo "$file_content" | grep -o "$pattern" || true)
        
        if [[ -n "$matches" ]]; then
            # Проверяем каждое совпадение
            while IFS= read -r match; do
                [[ -z "$match" ]] && continue
                
                # Проверяем, является ли это безопасным примером
                is_safe=0
                for safe in "${SAFE_EXAMPLES[@]}"; do
                    if [[ "$match" == "$safe" ]]; then
                        is_safe=1
                        break
                    fi
                done
                
                if [[ $is_safe -eq 0 ]]; then
                    echo -e "${RED}❌ ЗАБЛОКИРОВАНО: Потенциальный секрет в $file${NC}"
                    echo -e "   🔑 Найдено: ${match:0:30}..."
                    echo -e "   📝 Паттерн: $pattern"
                    BLOCKED=1
                fi
            done <<< "$matches"
        fi
    done
    
    # Дополнительные проверки
    
    # Проверка на .env файлы
    if [[ "$file" == ".env" ]] || [[ "$file" == *".env."* ]] && [[ "$file" != *".example"* ]]; then
        echo -e "${RED}❌ ЗАБЛОКИРОВАНО: Попытка коммита .env файла: $file${NC}"
        echo -e "   💡 Используйте .env.example для примеров"
        BLOCKED=1
    fi
    
    # Проверка на длинные строки (возможные ключи)
    long_lines=$(echo "$file_content" | grep -E '.{80,}' | grep -v '^#' | head -5)
    if [[ -n "$long_lines" ]] && [[ "$file" != *".md" ]]; then
        echo -e "${YELLOW}⚠️  Внимание: Длинные строки в $file (возможные секреты?)${NC}"
        # Не блокируем, только предупреждаем
    fi
done

if [[ $BLOCKED -eq 1 ]]; then
    echo -e "\n${RED}🚫 КОММИТ ЗАБЛОКИРОВАН ПО СООБРАЖЕНИЯМ БЕЗОПАСНОСТИ!${NC}"
    echo -e "\n${YELLOW}📋 КАК ИСПРАВИТЬ:${NC}"
    echo "   1. Замените реальные секреты на примеры (например: 'your_api_key_here')"
    echo "   2. Уберите .env файлы из коммита"  
    echo "   3. Используйте переменные окружения для реальных ключей"
    echo "   4. Проверьте, что вы не коммитите конфиденциальную информацию"
    echo ""
    echo -e "${RED}⚠️  ПОМНИТЕ: Секреты в git истории остаются навсегда!${NC}"
    echo ""
    echo "Для принудительного коммита (только для безопасных файлов):"
    echo "   git commit --no-verify"
    exit 1
fi

echo -e "${GREEN}✅ Проверка безопасности пройдена!${NC}"
exit 0