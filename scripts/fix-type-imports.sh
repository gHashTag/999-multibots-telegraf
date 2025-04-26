#!/bin/bash

# Скрипт для автоматизированного добавления ключевого слова 'type' перед импортами типов
# Автор: NeuroCoder, 2025

# Цвета для вывода
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
RESET="\033[0m"

echo -e "${GREEN}🧘 Начинаю исправление импортов типов... 🧘${RESET}"
echo ""

# Целевые интерфейсы и типы для исправления
INTERFACES=(
  "MyContext"
  "MySession"
  "BotName"
  "TelegramId"
  "SubscriptionType"
  "PaymentType"
  "ModeEnum"
  "ApiResponse"
  "GenerationResult"
  "BufferType"
  "ImageToVideoResponse"
  "TranslationButton"
  "SessionPayment"
  "Translation"
)

# Проходим по всем TS файлам в src
echo -e "${YELLOW}🔍 Поиск импортов типов в файлах TypeScript...${RESET}"
TS_FILES=$(find src -type f -name "*.ts" ! -path "*/node_modules/*" ! -path "*/dist/*")

FIXED_FILES=0

for FILE in $TS_FILES; do
  NEED_FIX=false
  
  # Проверяем наличие импортов интерфейсов/типов без ключевого слова 'type'
  for INTERFACE in "${INTERFACES[@]}"; do
    # Ищем импорт без 'type' но не с 'type'
    if grep -q "import { .*$INTERFACE.*} from" "$FILE" && ! grep -q "import type { .*$INTERFACE.*} from" "$FILE"; then
      NEED_FIX=true
      break
    fi
  done
  
  if [ "$NEED_FIX" = true ]; then
    echo -e "${YELLOW}Исправляю файл: ${FILE}${RESET}"
    
    # Создаем временный файл
    TEMP_FILE="${FILE}.tmp"
    
    # Заменяем импорты
    while IFS= read -r LINE; do
      MATCH=false
      
      for INTERFACE in "${INTERFACES[@]}"; do
        if [[ "$LINE" =~ import\ \{.*$INTERFACE.*\}\ from && ! "$LINE" =~ import\ type ]]; then
          # Заменяем 'import {' на 'import type {'
          MODIFIED_LINE="${LINE/import {/import type {}"
          echo "$MODIFIED_LINE" >> "$TEMP_FILE"
          MATCH=true
          break
        fi
      done
      
      # Если строка не содержит импорт интерфейса, записываем её без изменений
      if [ "$MATCH" = false ]; then
        echo "$LINE" >> "$TEMP_FILE"
      fi
    done < "$FILE"
    
    # Заменяем оригинальный файл временным
    mv "$TEMP_FILE" "$FILE"
    
    echo -e "${GREEN}✅ Файл исправлен: ${FILE}${RESET}"
    FIXED_FILES=$((FIXED_FILES + 1))
  fi
done

echo ""
echo -e "${GREEN}🎉 Завершено! Исправлено файлов: ${FIXED_FILES}${RESET}" 