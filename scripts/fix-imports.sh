#!/bin/bash

# Названия файлов для поиска
SOURCE_DIR="src"
TEST_DIR="__tests__"

# Цветной вывод
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Начинаю исправление импортов типов...${NC}"

# Поиск и исправление импортов типов
echo -e "${YELLOW}Поиск импортов интерфейсов без ключевого слова 'type'...${NC}"

# Список распространенных шаблонов импорта типов
patterns=(
  "import { MyContext, " 
  "import { BotName, " 
  "import { TelegramId, " 
  "import { MySession } from"
  "import { PaymentType, " 
  "import { PaymentObject, " 
  "import { PaymentStatus } from"
  "import { ErrorLog, " 
  "import { ErrorType } from"
  "import { ModeEnum, " 
  "import { ModeEnumValue } from"
  "import { Suggestion, " 
  "import { SuggestionType, " 
  "import { GymRoutine, " 
  "import { ReplicateResponse, " 
  "import { ReplicateError } from"
  "import { CreatePaymentOptions } from"
  "import { CreateUserData, " 
  "import { SubscriptionType } from"
  "import { VideoModelConfig } from"
)

# Директории для поиска
dirs=("$SOURCE_DIR" "$TEST_DIR")

# Счетчики
fixed_count=0
error_count=0

for dir in "${dirs[@]}"; do
  echo -e "${YELLOW}Проверка директории ${dir}...${NC}"
  
  for pattern in "${patterns[@]}"; do
    files=$(grep -l "$pattern" "$dir"/**/*.ts 2>/dev/null || echo "")
    
    if [ ! -z "$files" ]; then
      echo -e "${YELLOW}Найдены файлы с импортом: ${pattern}${NC}"
      
      for file in $files; do
        echo -e "  Исправление файла: $file"
        # Заменяем "import {" на "import type {" для найденного шаблона
        fixed_content=$(sed "s/$pattern/import type { /g" "$file")
        echo "$fixed_content" > "$file"
        
        if [ $? -eq 0 ]; then
          fixed_count=$((fixed_count + 1))
          echo -e "  ${GREEN}✓ Файл исправлен${NC}"
        else
          error_count=$((error_count + 1))
          echo -e "  ${RED}✗ Ошибка при исправлении файла${NC}"
        fi
      done
    fi
  done
done

echo -e "\n${YELLOW}Итоги исправления импортов:${NC}"
echo -e "${GREEN}Успешно исправлено: $fixed_count файлов${NC}"
if [ $error_count -gt 0 ]; then
  echo -e "${RED}Ошибок: $error_count${NC}"
fi

echo -e "\n${YELLOW}Выполняю TypeScript проверку...${NC}"
pnpm run typecheck

if [ $? -eq 0 ]; then
  echo -e "\n${GREEN}✓ TypeScript проверка прошла успешно!${NC}"
else
  echo -e "\n${RED}✗ TypeScript проверка содержит ошибки. Возможно, потребуются дополнительные правки.${NC}"
fi

echo -e "\n${YELLOW}Запускаю тесты для проверки исправлений...${NC}"
pnpm vitest run __tests__/scenes/menuScene.test.ts

if [ $? -eq 0 ]; then
  echo -e "\n${GREEN}✓ Тесты menuScene успешно пройдены!${NC}"
else
  echo -e "\n${RED}✗ Тесты menuScene не проходят. Необходимы дополнительные исправления.${NC}"
fi

echo -e "\n${YELLOW}Скрипт завершен.${NC}" 