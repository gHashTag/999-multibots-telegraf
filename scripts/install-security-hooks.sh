#!/bin/bash

# 🔧 Скрипт для установки хуков безопасности
# Использование: ./scripts/install-security-hooks.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔧 Установка хуков безопасности...${NC}"

# Проверяем что мы в git репозитории
if [ ! -d ".git" ]; then
    echo "❌ Ошибка: Не найден .git каталог. Убедитесь что вы в корне репозитория."
    exit 1
fi

# Создаем директорию hooks если её нет
mkdir -p .git/hooks

# Устанавливаем pre-commit hook
echo -e "${YELLOW}📝 Устанавливаю pre-commit hook...${NC}"
if [ -f ".git/hooks/pre-commit" ]; then
    echo "⚠️  Существующий pre-commit hook будет заменен"
    cp .git/hooks/pre-commit .git/hooks/pre-commit.backup
fi

# Создаем символическую ссылку на наш скрипт
ln -sf ../../scripts/pre-commit-security.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

echo -e "${GREEN}✅ Pre-commit hook установлен!${NC}"

# Проверяем установку
echo -e "${YELLOW}🧪 Тестирую hook...${NC}"
if [ -x ".git/hooks/pre-commit" ]; then
    echo -e "${GREEN}✅ Hook работает корректно${NC}"
else
    echo "❌ Ошибка: Hook не исполняется"
    exit 1
fi

echo -e "\n${GREEN}🎉 УСТАНОВКА ЗАВЕРШЕНА!${NC}"
echo ""
echo "📋 Что установлено:"
echo "   🔒 Pre-commit hook для блокировки секретов"
echo "   🛡️  Автоматическая проверка перед каждым коммитом"
echo ""
echo "💡 Как использовать:"
echo "   - Делайте коммиты как обычно: git commit -m 'message'"
echo "   - Hook автоматически проверит файлы на секреты"
echo "   - При обнаружении секретов коммит будет заблокирован"
echo ""  
echo "🚨 Принудительный коммит (только для безопасных файлов):"
echo "   git commit --no-verify -m 'message'"
echo ""
echo "🔍 Ручная проверка безопасности:"
echo "   ./scripts/security-scan.sh"