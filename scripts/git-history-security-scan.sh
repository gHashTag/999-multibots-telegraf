#!/bin/bash

# 🔍 GIT HISTORY SECURITY SCAN
# Сканирует историю Git на наличие токенов и секретов

set -e

echo "🔍 [GIT HISTORY SCAN] Сканирование истории на токены..."

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Счетчики
FOUND_IN_HISTORY=0
TOTAL_COMMITS_SCANNED=0

# Функция для поиска токенов в коммите
scan_commit() {
    local commit_hash="$1"
    local commit_msg="$2"
    
    echo -e "${BLUE}🔍 Сканирование коммита: ${commit_hash:0:8}${NC}"
    
    # Проверяем изменения в коммите
    local changes=$(git show --name-only "$commit_hash" 2>/dev/null || true)
    
    if [ -n "$changes" ]; then
        # Ищем токены в изменениях
        local token_found=false
        
        # Telegram токены
        if git show "$commit_hash" | grep -q "[0-9]\{8,10\}:[A-Za-z0-9_-]\{35\}"; then
            echo -e "${RED}🚨 НАЙДЕН ТЕЛЕГРАМ ТОКЕН в коммите $commit_hash${NC}"
            echo -e "${RED}   📝 Сообщение: $commit_msg${NC}"
            token_found=true
        fi
        
        # API ключи
        if git show "$commit_hash" | grep -q "sk-[A-Za-z0-9]\{48\}"; then
            echo -e "${RED}🚨 НАЙДЕН OPENAI API КЛЮЧ в коммите $commit_hash${NC}"
            echo -e "${RED}   📝 Сообщение: $commit_msg${NC}"
            token_found=true
        fi
        
        # GitHub токены
        if git show "$commit_hash" | grep -q "ghp_[A-Za-z0-9]\{36\}"; then
            echo -e "${RED}🚨 НАЙДЕН GITHUB TOKEN в коммите $commit_hash${NC}"
            echo -e "${RED}   📝 Сообщение: $commit_msg${NC}"
            token_found=true
        fi
        
        # JWT токены
        if git show "$commit_hash" | grep -q "eyJ[A-Za-z0-9_-]\{100,\}"; then
            echo -e "${RED}🚨 НАЙДЕН JWT ТОКЕН в коммите $commit_hash${NC}"
            echo -e "${RED}   📝 Сообщение: $commit_msg${NC}"
            token_found=true
        fi
        
        if [ "$token_found" = true ]; then
            FOUND_IN_HISTORY=$((FOUND_IN_HISTORY + 1))
            echo -e "${YELLOW}💡 Рекомендация: Рассмотрите возможность удаления этого коммита из истории${NC}"
            echo -e "${YELLOW}   git rebase -i HEAD~N (где N - количество коммитов назад)${NC}"
            echo ""
        fi
    fi
    
    TOTAL_COMMITS_SCANNED=$((TOTAL_COMMITS_SCANNED + 1))
}

echo "🚀 Начинаем сканирование истории Git..."

# Сканируем последние 50 коммитов
echo "📊 Сканирование последних 50 коммитов..."
git log --oneline -50 | while read -r line; do
    commit_hash=$(echo "$line" | cut -d' ' -f1)
    commit_msg=$(echo "$line" | cut -d' ' -f2-)
    scan_commit "$commit_hash" "$commit_msg"
done

echo ""
echo "📊 РЕЗУЛЬТАТЫ СКАНИРОВАНИЯ ИСТОРИИ:"
echo "=================================="

if [ $FOUND_IN_HISTORY -eq 0 ]; then
    echo -e "${GREEN}✅ ИСТОРИЯ БЕЗОПАСНА: Токены в истории не найдены!${NC}"
    echo -e "${GREEN}🎉 История Git чиста от секретов!${NC}"
else
    echo -e "${RED}❌ НАЙДЕНЫ ТОКЕНЫ В ИСТОРИИ:${NC}"
    echo -e "${RED}   🔴 Коммитов с токенами: $FOUND_IN_HISTORY${NC}"
    echo -e "${RED}   📊 Всего проверено коммитов: $TOTAL_COMMITS_SCANNED${NC}"
    echo ""
    echo -e "${YELLOW}💡 РЕКОМЕНДАЦИИ ПО ОЧИСТКЕ ИСТОРИИ:${NC}"
    echo -e "${YELLOW}   1. Используйте git rebase -i для удаления коммитов с токенами${NC}"
    echo -e "${YELLOW}   2. Рассмотрите использование BFG Repo-Cleaner${NC}"
    echo -e "${YELLOW}   3. Обновите все токены, которые были в истории${NC}"
    echo -e "${YELLOW}   4. Добавьте .env файлы в .gitignore${NC}"
    echo ""
    echo -e "${RED}🚨 ВНИМАНИЕ: Токены в истории Git могут быть скомпрометированы!${NC}"
fi

echo ""
echo "🔍 Сканирование завершено!"
