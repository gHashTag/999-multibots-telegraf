#!/bin/bash

<<<<<<< HEAD
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
=======
# Exit on any error
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔒 Running pre-commit security checks..."

# Directory containing this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Project root directory
PROJECT_ROOT="$SCRIPT_DIR/.."

# Function to check for secrets in staged files
check_staged_files() {
    echo -e "\n${YELLOW}🔍 Checking staged files for secrets...${NC}"
    
    # Get list of staged files
    STAGED_FILES=$(git diff --cached --name-only)
    
    if [ -z "$STAGED_FILES" ]; then
        echo -e "${YELLOW}No files staged for commit${NC}"
        return 0
    fi
    
    # Patterns to search for
    PATTERNS=(
        "api[_-]key['\"]?\s*[:=]\s*['\"]\S+['\"]"
        "token['\"]?\s*[:=]\s*['\"]\S+['\"]"
        "password['\"]?\s*[:=]\s*['\"]\S+['\"]"
        "secret['\"]?\s*[:=]\s*['\"]\S+['\"]"
        "private[_-]key['\"]?\s*[:=]\s*['\"]\S+['\"]"
        "client[_-]secret['\"]?\s*[:=]\s*['\"]\S+['\"]"
        "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
    )
    
    # Initialize flag for found secrets
    SECRETS_FOUND=0
    
    # Check each staged file
    for FILE in $STAGED_FILES; do
        if [ -f "$FILE" ]; then
            echo -e "\nChecking file: $FILE"
            
            # Skip binary files
            if file "$FILE" | grep -q "binary"; then
                echo "Skipping binary file"
                continue
            fi
            
            # Check for each pattern
            for PATTERN in "${PATTERNS[@]}"; do
                if git diff --cached "$FILE" | grep -E "$PATTERN" > /dev/null; then
                    echo -e "${RED}❌ Potential secret found in $FILE: $PATTERN${NC}"
                    SECRETS_FOUND=1
                fi
            done
        fi
    done
    
    if [ $SECRETS_FOUND -eq 1 ]; then
        echo -e "\n${RED}❌ Secrets found in staged files. Commit aborted.${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ No secrets found in staged files${NC}"
}

# Function to check for large files
check_large_files() {
    echo -e "\n${YELLOW}🔍 Checking for large files...${NC}"
    
    # Maximum file size in bytes (5MB)
    MAX_SIZE=$((5 * 1024 * 1024))
    
    # Get list of staged files
    STAGED_FILES=$(git diff --cached --name-only)
    
    LARGE_FILES_FOUND=0
    
    for FILE in $STAGED_FILES; do
        if [ -f "$FILE" ]; then
            SIZE=$(stat -f %z "$FILE")
            if [ $SIZE -gt $MAX_SIZE ]; then
                echo -e "${RED}❌ Large file detected: $FILE ($(($SIZE / 1024 / 1024))MB)${NC}"
                LARGE_FILES_FOUND=1
            fi
        fi
    done
    
    if [ $LARGE_FILES_FOUND -eq 1 ]; then
        echo -e "\n${RED}❌ Large files found. Consider using Git LFS. Commit aborted.${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ No large files found${NC}"
}

# Function to check code style and linting
check_code_style() {
    echo -e "\n${YELLOW}🔍 Checking code style...${NC}"
    
    # Run ESLint if available
    if command -v eslint >/dev/null 2>&1; then
        if eslint .; then
            echo -e "${GREEN}✅ ESLint check passed${NC}"
        else
            echo -e "${RED}❌ ESLint check failed${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}⚠️ ESLint not found - skipping code style check${NC}"
    fi
}

# Function to check for debug code
check_debug_code() {
    echo -e "\n${YELLOW}🔍 Checking for debug code...${NC}"
    
    DEBUG_PATTERNS=(
        "console\\.log"
        "debugger"
        "TODO"
        "FIXME"
    )
    
    STAGED_FILES=$(git diff --cached --name-only)
    DEBUG_FOUND=0
    
    for FILE in $STAGED_FILES; do
        if [[ $FILE =~ \.(js|ts|tsx|jsx)$ ]]; then
            for PATTERN in "${DEBUG_PATTERNS[@]}"; do
                if git diff --cached "$FILE" | grep -E "$PATTERN" > /dev/null; then
                    echo -e "${YELLOW}⚠️ Debug code found in $FILE: $PATTERN${NC}"
                    DEBUG_FOUND=1
                fi
            done
        fi
    done
    
    if [ $DEBUG_FOUND -eq 1 ]; then
        echo -e "\n${YELLOW}⚠️ Debug code found. Consider removing before committing.${NC}"
    else
        echo -e "${GREEN}✅ No debug code found${NC}"
    fi
}

# Main execution
main() {
    echo "🚀 Running pre-commit checks at: $PROJECT_ROOT"
    
    check_staged_files
    check_large_files
    check_code_style
    check_debug_code
    
    echo -e "\n${GREEN}✅ All pre-commit checks passed${NC}"
}

main "$@"
>>>>>>> origin/veo3-1
