#!/bin/bash

# Скрипт для исправления импортов типов, добавляя 'type' перед импортом
# Создается резервная копия перед внесением изменений

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧘 Начинаю процесс исправления импортов типов...${NC}"
echo -e "${YELLOW}Ом Намах Шивая! Пусть наш код станет чище с этими изменениями.${NC}\n"

# Создаем уникальное имя для резервной копии
DATE=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="backup_tests_$DATE"

# Создаем резервную копию директории __tests__
echo -e "${BLUE}📦 Создаю резервную копию директории __tests__ в $BACKUP_DIR${NC}"
mkdir -p $BACKUP_DIR
cp -r __tests__ $BACKUP_DIR/
echo -e "${GREEN}✅ Резервная копия создана успешно.${NC}\n"

# Определяем типы, которые нужно импортировать с type
TYPE_PATTERNS=(
  "import.*ModelUrl.*from.*models\.interface"
  "import.*TelegramId.*from.*telegram\.interface"
  "import.*Context.*from.*telegraf"
  "import.*SceneContext.*from.*telegraf/scenes"
  "import.*BaseScene.*from.*telegraf/scenes"
  "import.*IContext.*from.*mocks/telegraf"
  "import.*BotName.*from.*@/config"
  "import.*ServiceType.*from.*serviceTypes"
  "import.*IUser.*from.*user\.interface"
  "import.*IUserDetails.*from.*user\.interface"
  "import.*IPayment.*from.*payments\.interface"
  "import.*ISubscription.*from.*subscription\.interface"
  "import.*IBaseScene.*from.*mocks/telegraf"
)

# Функция для замены импортов
fix_imports() {
  local file=$1
  local original_content=$(cat "$file")
  local modified_content=$original_content
  local was_modified=false

  for pattern in "${TYPE_PATTERNS[@]}"; do
    if grep -q "$pattern" "$file"; then
      echo -e "${YELLOW}🔍 Найден импорт типа в $file: $pattern${NC}"
      
      # Сохраняем содержимое до изменения
      current_content=$modified_content
      
      # Заменяем импорт добавлением слова type
      modified_content=$(echo "$current_content" | sed -E "s/(import[[:space:]]+)([^{]*)([[:space:]]+from[[:space:]]+)/\1type \2\3/g" | grep -E "$pattern" || echo "$current_content")
      
      # Если содержимое изменилось
      if [ "$modified_content" != "$current_content" ]; then
        was_modified=true
      fi
    fi
  done

  # Если были изменения, записываем их в файл
  if [ "$was_modified" = true ]; then
    echo -e "${GREEN}✏️ Исправляю импорты в $file${NC}"
    echo "$modified_content" > "$file"
  fi
}

# Ищем все файлы TypeScript в директории __tests__
echo -e "${BLUE}🔍 Поиск файлов TypeScript в директории __tests__...${NC}"
ts_files=$(find __tests__ -type f -name "*.ts")

# Обрабатываем каждый файл
for file in $ts_files; do
  echo -e "${BLUE}📝 Обрабатываю файл $file${NC}"
  fix_imports "$file"
done

echo -e "\n${GREEN}🎉 Процесс исправления импортов типов завершен!${NC}"
echo -e "${YELLOW}🙏 Ом Шанти! Теперь проверьте ваш код на наличие ошибок компиляции.${NC}"
echo -e "${BLUE}Для восстановления из резервной копии используйте: rm -rf __tests__ && cp -r $BACKUP_DIR/__tests__ ./${NC}" 