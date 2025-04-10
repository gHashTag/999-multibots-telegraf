#!/bin/bash

# Цвета для вывода
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🔍 Начинаем тестирование husky...${NC}"

# Создаем тестовый файл с ошибкой линтинга
echo -e "${BLUE}📝 Создаем тестовый файл с ошибкой...${NC}"
echo "const test = 'test'" > src/test-husky.ts

# Пытаемся сделать коммит
echo -e "${BLUE}🔄 Пробуем сделать коммит с ошибкой линтинга...${NC}"
git add src/test-husky.ts
git commit -m "test: проверка husky" || {
    echo -e "${GREEN}✅ Husky успешно заблокировал коммит с ошибкой${NC}"
}

# Исправляем файл
echo -e "${BLUE}🔧 Исправляем ошибку в файле...${NC}"
echo "const test: string = 'test';" > src/test-husky.ts

# Пробуем коммит снова
echo -e "${BLUE}🔄 Пробуем сделать коммит с исправленным файлом...${NC}"
git add src/test-husky.ts
git commit -m "test: проверка husky с исправленным файлом"

# Очищаем после теста
echo -e "${BLUE}🧹 Очищаем тестовые файлы...${NC}"
git reset HEAD~1
rm src/test-husky.ts

echo -e "${GREEN}✅ Тестирование husky завершено!${NC}" 