#!/bin/bash

# Скрипт для исправления импортов в TypeScript файлах
# Автоматизирует исправление часто встречающихся проблем:
# 1. Неправильный import type для перечислений и функций
# 2. Устаревшие пути в импортах Telegraf
# 3. Проблемы с импортами axios

# Цвета для вывода
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
BLUE="\033[0;34m"
RESET="\033[0m"

echo -e "${GREEN}🔍 Начинаю анализ и исправление импортов...${RESET}"

# Директории, которые нужно обработать
DIRS=("src")

# Создаем бэкап директории
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backup_src_${TIMESTAMP}"

echo -e "${YELLOW}📦 Создаем резервную копию директории src в ${BACKUP_DIR}...${RESET}"
cp -r src "${BACKUP_DIR}"
echo -e "${GREEN}✅ Резервная копия создана${RESET}"

# Функция, которая выполняет find и sed для замены импортов
function replace_imports {
    local pattern=$1
    local replacement=$2
    local description=$3
    
    echo -e "${BLUE}🔄 $description...${RESET}"
    
    for dir in "${DIRS[@]}"; do
        find "$dir" -type f -name "*.ts" -exec sed -i '' "$pattern" {} \;
    done
    
    echo -e "${GREEN}✅ Завершено: $description${RESET}"
}

# 1. Исправляем импорты перечислений (используются как значения)
echo -e "${YELLOW}🔄 Исправляем импорты перечислений...${RESET}"

replace_imports 's/import type { ModeEnum /import { ModeEnum /g' "Исправление импортов ModeEnum"
replace_imports 's/import type { PaymentType /import { PaymentType /g' "Исправление импортов PaymentType"
replace_imports 's/import type { SubscriptionType /import { SubscriptionType /g' "Исправление импортов SubscriptionType"

# 2. Исправляем импорты функций, которые используются как значения
echo -e "${YELLOW}🔄 Исправляем импорты функций...${RESET}"

replace_imports 's/import type { normalizeTelegramId /import { normalizeTelegramId /g' "Исправление импортов normalizeTelegramId"
replace_imports 's/import type { getUserByTelegramId /import { getUserByTelegramId /g' "Исправление импортов getUserByTelegramId"
replace_imports 's/import type { updateUserLevelPlusOne /import { updateUserLevelPlusOne /g' "Исправление импортов updateUserLevelPlusOne"
replace_imports 's/import type { getUserByTelegramIdString /import { getUserByTelegramIdString /g' "Исправление импортов getUserByTelegramIdString"
replace_imports 's/import type { getTranslation /import { getTranslation /g' "Исправление импортов getTranslation"
replace_imports 's/import type { toBotName /import { toBotName /g' "Исправление импортов toBotName"
replace_imports 's/import type { processApiResponse /import { processApiResponse /g' "Исправление импортов processApiResponse"
replace_imports 's/import type { getBotNameByToken /import { getBotNameByToken /g' "Исправление импортов getBotNameByToken"
replace_imports 's/import type { DEFAULT_BOT_NAME /import { DEFAULT_BOT_NAME /g' "Исправление импортов DEFAULT_BOT_NAME"
replace_imports 's/import type { determineSubscriptionType /import { determineSubscriptionType /g' "Исправление импортов determineSubscriptionType"

# 3. Исправляем путь импорта для BotName
echo -e "${YELLOW}🔄 Исправляем импорты BotName...${RESET}"

replace_imports 's/import type { BotName } from @\/interfaces/import type { BotName } from @\/interfaces\/telegram-bot.interface/g' "Исправление импортов BotName"

# 4. Исправляем импорты типов Telegraf
echo -e "${YELLOW}🔄 Исправляем импорты типов Telegraf...${RESET}"

replace_imports 's/import.*from .telegraf\/typings\/core\/types\/typegram./import type { Message, Update } from "telegraf\/types"/g' "Исправление импортов Message и Update"
replace_imports 's/import.*ReplyKeyboardMarkup.*from .telegraf\/typings\/core\/types\/typegram./import type { ReplyKeyboardMarkup } from "telegraf\/types"/g' "Исправление импортов ReplyKeyboardMarkup"
replace_imports 's/import.*InlineKeyboardMarkup.*from .telegraf\/typings\/core\/types\/typegram./import type { InlineKeyboardMarkup } from "telegraf\/types"/g' "Исправление импортов InlineKeyboardMarkup"

# 5. Исправляем импорты axios
echo -e "${YELLOW}🔄 Исправляем импорты axios...${RESET}"

# Находим файлы с проблемными импортами axios
echo -e "${BLUE}🔍 Ищем файлы с проблемными импортами axios...${RESET}"
FILES_WITH_AXIOS=$(grep -l "import axios, { AxiosResponse" src --include="*.ts")

if [ -n "$FILES_WITH_AXIOS" ]; then
    echo -e "${YELLOW}📋 Найдены файлы с проблемными импортами axios:${RESET}"
    echo "$FILES_WITH_AXIOS"
    
    for file in $FILES_WITH_AXIOS; do
        echo -e "${BLUE}🔄 Исправляем импорты в файле $file...${RESET}"
        sed -i '' 's/import axios, { AxiosResponse } from/import axios from\nimport type { AxiosResponse } from/g' "$file"
    done
    
    echo -e "${GREEN}✅ Импорты axios исправлены${RESET}"
else
    echo -e "${GREEN}✅ Не найдено проблем с импортами axios${RESET}"
fi

# 6. Проверяем синтаксические ошибки после исправлений
echo -e "${YELLOW}🔄 Проверяем синтаксические ошибки с помощью tsc...${RESET}"
tsc --noEmit

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Синтаксических ошибок не обнаружено${RESET}"
else
    echo -e "${RED}❌ Обнаружены синтаксические ошибки${RESET}"
    echo -e "${YELLOW}⚠️ Некоторые проблемы могут потребовать ручного исправления${RESET}"
fi

echo -e "${GREEN}🎉 Скрипт исправления импортов завершил работу${RESET}"
echo -e "${YELLOW}⚠️ Если возникли проблемы, можно восстановить исходное состояние из резервной копии в ${BACKUP_DIR}${RESET}" 