#!/bin/bash

# Скрипт для исправления импортов типов в директории src, добавляя 'type' перед импортом
# Создается резервная копия перед внесением изменений

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧘 Начинаю процесс исправления импортов типов в директории src...${NC}"
echo -e "${YELLOW}Ом Шанти! Пусть наш код станет чище с этими изменениями.${NC}\n"

# Создаем уникальное имя для резервной копии
DATE=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="backup_src_$DATE"

# Создаем резервную копию директории src
echo -e "${BLUE}📦 Создаю резервную копию директории src в $BACKUP_DIR${NC}"
mkdir -p $BACKUP_DIR
cp -r src $BACKUP_DIR/
echo -e "${GREEN}✅ Резервная копия создана успешно.${NC}\n"

# Определяем типы, которые нужно импортировать с type
TYPE_PATTERNS=(
  "import.*ModelUrl.*from.*models\.interface"
  "import.*TelegramId.*from.*telegram\.interface"
  "import.*IBot.*from.*bot\.interface"
  "import.*Context.*from.*telegraf"
  "import.*SceneContext.*from.*telegraf/scenes"
  "import.*BaseScene.*from.*telegraf/scenes"
  "import.*BotName.*from.*@/config"
  "import.*ServiceType.*from.*serviceTypes"
  "import.*IUser.*from.*user\.interface"
  "import.*IUserDetails.*from.*user\.interface"
  "import.*IPayment.*from.*payments\.interface"
  "import.*ISubscription.*from.*subscription\.interface"
  "import.*PaymentType.*from.*payments\.interface"
  "import.*SubscriptionType.*from.*subscription\.interface"
  "import.*ModeEnum.*from.*mode\.interface"
  "import.*ModelType.*from.*models\.interface"
  "import.*ModelSize.*from.*models\.interface"
  "import.*ChannelRole.*from.*chanel\.interface"
  "import.*GenerationResult.*from.*ai\.interface"
  "import.*ImageToVideoResponse.*from.*ai\.interface"
  "import.*TranslationButton.*from.*translation\.interface"
  "import.*MyContext.*from.*context\.interface"
  "import.*MySession.*from.*session\.interface"
  "import.*SessionPayment.*from.*session\.interface"
  "import.*Translation.*from.*translation\.interface"
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
      
      # Получаем имя типа из шаблона для более точного поиска
      type_name=$(echo "$pattern" | sed -E 's/import\.\*([^\.]*)\.\*from.*/\1/')
      
      # Сохраняем содержимое до изменения
      current_content=$modified_content
      
      # Используем sed для замены только конкретных импортов, не затрагивая другие
      # Находим строки импорта, содержащие нужный тип, и добавляем 'type'
      modified_content=$(echo "$current_content" | sed -E "s/(import[[:space:]]+)(\{[[:space:]]*(.*$type_name.*)[[:space:]]*\}[[:space:]]+from)/\1type \2/g")
      
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

# Ищем все файлы TypeScript в директории src
echo -e "${BLUE}🔍 Поиск файлов TypeScript в директории src...${NC}"
ts_files=$(find src -type f -name "*.ts" ! -path "*/node_modules/*" ! -path "*/dist/*")

# Счетчик обработанных файлов
processed=0
modified=0

# Обрабатываем каждый файл
for file in $ts_files; do
  processed=$((processed + 1))
  
  # Показываем прогресс каждые 10 файлов
  if [ $((processed % 10)) -eq 0 ]; then
    echo -e "${BLUE}Прогресс: обработано $processed файлов...${NC}"
  fi
  
  # Запоминаем содержимое файла перед изменением
  original_content=$(cat "$file")
  
  # Исправляем импорты
  fix_imports "$file"
  
  # Проверяем, изменился ли файл
  new_content=$(cat "$file")
  if [ "$original_content" != "$new_content" ]; then
    modified=$((modified + 1))
  fi
done

echo -e "\n${GREEN}🎉 Процесс исправления импортов типов завершен!${NC}"
echo -e "${GREEN}📊 Обработано файлов: $processed, изменено: $modified${NC}"
echo -e "${YELLOW}🙏 Ом Шанти! Теперь проверьте ваш код на наличие ошибок компиляции.${NC}"
echo -e "${BLUE}Для восстановления из резервной копии используйте: rm -rf src && cp -r $BACKUP_DIR/src ./${NC}" 