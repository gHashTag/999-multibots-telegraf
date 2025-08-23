#!/bin/bash

# 🔐 Скрипт для сканирования секретов в проекте
# Использование: ./scripts/security-scan.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔍 СКАНИРОВАНИЕ ПРОЕКТА НА БЕЗОПАСНОСТЬ${NC}"
echo "==============================================="

# Флаг для отслеживания найденных проблем
ISSUES_FOUND=0

echo -e "\n${YELLOW}📁 Проверка текущих файлов на секреты...${NC}"

# Паттерны для поиска секретов
SECRET_PATTERNS=(
    "sk-[a-zA-Z0-9]{20,}"                      # OpenAI API keys
    "[0-9]{8,}:AA[a-zA-Z0-9_-]{35}"           # Telegram bot tokens
    "eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}" # JWT tokens
    "AKIA[0-9A-Z]{16}"                         # AWS Access Key
    "[a-zA-Z0-9]{40}"                          # GitHub tokens (40 chars)
    "r8_[a-zA-Z0-9]{32}"                       # Replicate tokens
    "ghp_[a-zA-Z0-9]{36}"                      # GitHub personal tokens
    "mongodb://[^:]*:[^@]*@"                   # MongoDB connection strings
    "postgres://[^:]*:[^@]*@"                  # PostgreSQL connection strings
)

# Файлы для проверки
SCAN_FILES=(
    "src/**/*.ts"
    "src/**/*.js"
    "*.ts"
    "*.js"
    "*.json"
    "*.md"
    "docs/**/*.md"
    "scripts/**/*"
)

for pattern in "${SECRET_PATTERNS[@]}"; do
    echo "  Поиск паттерна: $pattern"
    
    # Используем find для получения файлов и grep для поиска
    found_files=$(find . -name "*.ts" -o -name "*.js" -o -name "*.json" -o -name "*.md" | \
                  grep -v node_modules | \
                  grep -v .git | \
                  grep -v dist | \
                  xargs grep -l "$pattern" 2>/dev/null || true)
    
    if [[ -n "$found_files" ]]; then
        echo -e "    ${RED}❌ НАЙДЕНЫ ПОТЕНЦИАЛЬНЫЕ СЕКРЕТЫ:${NC}"
        echo "$found_files" | while IFS= read -r file; do
            echo -e "      🔴 $file"
            grep -n "$pattern" "$file" | head -3 | while IFS= read -r line; do
                echo -e "         ${RED}$line${NC}"
            done
        done
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
done

echo -e "\n${YELLOW}🔄 Проверка git истории на секреты...${NC}"

# Список известных скомпрометированных секретов
COMPROMISED_SECRETS=(
    "***REMOVED***"
    "***REMOVED***"
    "***REMOVED***" 
    "***REMOVED***"
)

for secret in "${COMPROMISED_SECRETS[@]}"; do
    # Ищем секрет в git истории
    if git log --all --grep="$secret" --oneline | head -1 | grep -q .; then
        echo -e "  ${RED}❌ НАЙДЕН СКОМПРОМЕТИРОВАННЫЙ СЕКРЕТ В GIT:${NC}"
        echo -e "    🔴 $secret"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
    
    if git log --all -S "$secret" --oneline | head -1 | grep -q .; then
        echo -e "  ${RED}❌ НАЙДЕН СКОМПРОМЕТИРОВАННЫЙ СЕКРЕТ В КОДЕ:${NC}"
        echo -e "    🔴 $secret"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
done

echo -e "\n${YELLOW}📋 Проверка .env файлов...${NC}"

# Проверка .env файлов
if [ -f ".env" ]; then
    echo -e "  ${RED}⚠️  Найден .env файл - убедитесь что он в .gitignore${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Проверяем .gitignore
if ! grep -q "^.env$" .gitignore 2>/dev/null; then
    echo -e "  ${RED}❌ .env НЕ ДОБАВЛЕН в .gitignore!${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

echo -e "\n${YELLOW}🔍 Проверка примеров секретов...${NC}"

# Проверяем что примеры не содержат реальных ключей
EXAMPLE_FILES=(".env.example" "README.md" "docs/*.md")
for pattern in "${SECRET_PATTERNS[@]}"; do
    for file_pattern in "${EXAMPLE_FILES[@]}"; do
        if ls $file_pattern >/dev/null 2>&1; then
            for file in $file_pattern; do
                if [ -f "$file" ] && grep -q "$pattern" "$file" 2>/dev/null; then
                    echo -e "  ${RED}❌ РЕАЛЬНЫЙ КЛЮЧ В ПРИМЕРЕ: $file${NC}"
                    ISSUES_FOUND=$((ISSUES_FOUND + 1))
                fi
            done
        fi
    done
done

echo -e "\n==============================================="

if [ $ISSUES_FOUND -eq 0 ]; then
    echo -e "${GREEN}✅ ПРОЕКТ БЕЗОПАСЕН - секреты не найдены!${NC}"
    exit 0
else
    echo -e "${RED}❌ НАЙДЕНО $ISSUES_FOUND ПРОБЛЕМ БЕЗОПАСНОСТИ!${NC}"
    echo -e "${YELLOW}📝 РЕКОМЕНДАЦИИ:${NC}"
    echo "  1. Замените все найденные секреты на примеры"  
    echo "  2. Отзовите реальные ключи в соответствующих сервисах"
    echo "  3. Создайте новые ключи"
    echo "  4. Обновите переменные окружения"
    echo "  5. Очистите git историю от секретов"
    echo ""
    echo -e "${RED}⚠️  НИКОГДА НЕ КОММИТЬТЕ РЕАЛЬНЫЕ СЕКРЕТЫ!${NC}"
    exit 1
fi