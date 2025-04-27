#!/bin/bash

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Создание резервной копии перед исправлением enum-типов и Telegraf типов ===${NC}"
timestamp=$(date +%Y%m%d_%H%M%S)
backup_dir="backup_src_enums_${timestamp}"

# Создание резервной копии src директории
if cp -r src "$backup_dir"; then
  echo -e "${GREEN}✅ Резервная копия создана успешно: ${backup_dir}${NC}"
else
  echo -e "${RED}❌ Не удалось создать резервную копию!${NC}"
  exit 1
fi

echo -e "${BLUE}=== Исправление импортов enum-типов и Telegraf типов ===${NC}"

# 1. Исправление импортов SubscriptionType - из import type в regular import
echo -e "${YELLOW}Исправление импортов SubscriptionType...${NC}"
find src -type f -name "*.ts" -exec sed -i '' \
  's/import type { SubscriptionType } from/import { SubscriptionType } from/g' {} \;

# 2. Исправление импортов PaymentType - из import type в regular import
echo -e "${YELLOW}Исправление импортов PaymentType...${NC}"
find src -type f -name "*.ts" -exec sed -i '' \
  's/import type { PaymentType } from/import { PaymentType } from/g' {} \;

# 3. Исправление определений типов Telegraf Markup
echo -e "${YELLOW}Исправление импортов Markup из telegraf...${NC}"
find src -type f -name "*.ts" -exec sed -i '' \
  's/import type { Context, Markup } from '"'"'telegraf'"'"'/import type { Context } from '"'"'telegraf'"'"'\nimport { Markup } from '"'"'telegraf'"'"'/g' {} \;

# 4. Добавление импортов для недостающих типов Telegraf
echo -e "${YELLOW}Исправление определений ReplyKeyboardMarkup, InlineKeyboardMarkup...${NC}"
files_with_keyboard_markup=$(grep -l "ReplyKeyboardMarkup\|InlineKeyboardMarkup" src/**/*.ts)

for file in $files_with_keyboard_markup; do
  # Проверяем, уже импортированы ли нужные типы
  if ! grep -q "import.*ReplyKeyboardMarkup.*from 'telegraf/types'" "$file" && grep -q "ReplyKeyboardMarkup" "$file"; then
    # Добавляем import для ReplyKeyboardMarkup
    sed -i '' '/import.*from '"'"'telegraf'"'"'/a\
import type { ReplyKeyboardMarkup } from '"'"'telegraf/types'"'"';' "$file"
    echo -e "  ${GREEN}Добавлен импорт ReplyKeyboardMarkup в $file${NC}"
  fi
  
  if ! grep -q "import.*InlineKeyboardMarkup.*from 'telegraf/types'" "$file" && grep -q "InlineKeyboardMarkup" "$file"; then
    # Добавляем import для InlineKeyboardMarkup
    sed -i '' '/import.*from '"'"'telegraf'"'"'/a\
import type { InlineKeyboardMarkup } from '"'"'telegraf/types'"'"';' "$file"
    echo -e "  ${GREEN}Добавлен импорт InlineKeyboardMarkup в $file${NC}"
  fi
done

# 5. Исправление импортов normalizeTelegramId
echo -e "${YELLOW}Исправление импортов normalizeTelegramId...${NC}"
find src -type f -name "*.ts" -exec sed -i '' \
  's/import type { normalizeTelegramId } from/import { normalizeTelegramId } from/g' {} \;

# 6. Исправление импортов getUserByTelegramId и updateUserLevelPlusOne
echo -e "${YELLOW}Исправление импортов getUserByTelegramId и updateUserLevelPlusOne...${NC}"
find src -type f -name "*.ts" -exec sed -i '' \
  's/import type { getUserByTelegramId, updateUserLevelPlusOne } from/import { getUserByTelegramId, updateUserLevelPlusOne } from/g' {} \;

# 7. Обновление экспорта в interfaces/index.ts для SubscriptionType и PaymentType
echo -e "${YELLOW}Проверка и обновление экспортов в interfaces/index.ts...${NC}"
if grep -q "export type { SubscriptionType" "src/interfaces/index.ts"; then
  sed -i '' 's/export type { SubscriptionType/export { SubscriptionType/g' "src/interfaces/index.ts"
  echo -e "  ${GREEN}Обновлен экспорт SubscriptionType в interfaces/index.ts${NC}"
fi

if grep -q "export type { PaymentType" "src/interfaces/index.ts"; then
  sed -i '' 's/export type { PaymentType/export { PaymentType/g' "src/interfaces/index.ts"
  echo -e "  ${GREEN}Обновлен экспорт PaymentType в interfaces/index.ts${NC}"
fi

# Подсчет количества измененных файлов
modified_files=$(find src -type f -name "*.ts" -newer "$backup_dir/bot.ts" | wc -l)
total_files=$(find src -type f -name "*.ts" | wc -l)

echo -e "${BLUE}=== Итоги исправления импортов enum-типов и Telegraf типов ===${NC}"
echo -e "${GREEN}✅ Обработано файлов: $total_files${NC}"
echo -e "${GREEN}✅ Изменено файлов: $modified_files${NC}"
echo -e "${YELLOW}Для проверки изменений выполните: pnpm typecheck${NC}"
echo -e "${YELLOW}Для восстановления из резервной копии: rm -rf src && cp -r ${backup_dir} src${NC}" 