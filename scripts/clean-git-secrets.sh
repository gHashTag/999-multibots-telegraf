#!/bin/bash

# ⚠️ ОПАСНО: Скрипт для очистки git истории от секретов
# ЭТО ИЗМЕНИТ ВСЮ ИСТОРИЮ РЕПОЗИТОРИЯ!
# Использование: ./scripts/clean-git-secrets.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${RED}${BOLD}⚠️  КРИТИЧЕСКОЕ ПРЕДУПРЕЖДЕНИЕ! ⚠️${NC}"
echo -e "${RED}Этот скрипт ПОЛНОСТЬЮ ИЗМЕНИТ историю git репозитория!${NC}"
echo -e "${RED}Все коммиты будут переписаны с новыми хешами!${NC}"
echo ""
echo -e "${YELLOW}☠️  ПОСЛЕДСТВИЯ:${NC}"
echo "   • Все существующие клоны станут несовместимыми"
echo "   • Все ссылки на коммиты (issues, PR) будут сломаны"  
echo "   • Force push потребуется во все ветки"
echo "   • Команда должна будет заново склонировать репозиторий"
echo ""
echo -e "${YELLOW}✅ УБЕДИТЕСЬ ЧТО:${NC}"
echo "   1. У вас есть резервная копия репозитория"
echo "   2. Команда предупреждена о переписывании истории"
echo "   3. Все важные ветки сохранены"
echo "   4. Настроен новый backup удаленного репозитория"
echo ""

read -p "🤔 Вы ДЕЙСТВИТЕЛЬНО хотите продолжить? (введите 'YES' заглавными): " confirm

if [[ "$confirm" != "YES" ]]; then
    echo -e "${GREEN}✅ Отмена операции. Мудрое решение!${NC}"
    exit 0
fi

echo ""
echo -e "${YELLOW}🔧 Подготовка к очистке...${NC}"

# Проверяем что мы в git репозитории
if [ ! -d ".git" ]; then
    echo -e "${RED}❌ Ошибка: Не найден .git каталог${NC}"
    exit 1
fi

# Проверяем установку git-filter-repo
if ! command -v git-filter-repo >/dev/null 2>&1; then
    echo -e "${RED}❌ git-filter-repo не установлен!${NC}"
    echo ""
    echo "Установка на macOS:"
    echo "   brew install git-filter-repo"
    echo ""
    echo "Установка на Ubuntu/Debian:"
    echo "   sudo apt install git-filter-repo"
    echo ""
    echo "Установка через pip:"
    echo "   pip install git-filter-repo"
    exit 1
fi

# Создаем backup текущего состояния
echo -e "${YELLOW}💾 Создание backup...${NC}"
backup_dir="../$(basename $(pwd))_backup_$(date +%Y%m%d_%H%M%S)"
cp -r . "$backup_dir"
echo -e "${GREEN}✅ Backup создан: $backup_dir${NC}"

# Скомпрометированные секреты для замены
declare -A SECRETS_TO_CLEAN=(
    ["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"]="***REMOVED_OPENAI_KEY***"
    ["7655182164:AAGTnUzDNU61zeV8VXL_BKkVU6OdrgjDVlU"]="***REMOVED_BOT_TOKEN***"
    ["8199290378:AAH16uPdrSLkt4YJJuLoO0LV1022o197ph0"]="***REMOVED_BOT_TOKEN***"
    ["7699001347:AAFyO6bsmoa0nzZ4_Aww3GHtRBEJgEh9pkU"]="***REMOVED_BOT_TOKEN***"
    ["7415778573:AAHZM-p6SfZGMlk3maUubZJNaWgZJ8oFCTU"]="***REMOVED_BOT_TOKEN***"
    ["8032830593:AAF09IvQz4GOwSzSpfsNAWaGuqN40clWLdI"]="***REMOVED_BOT_TOKEN***"
    ["7614375306:AAEiojth3kkTE-lGwNEbhh8saXA72nib2Zw"]="***REMOVED_BOT_TOKEN***"
    ["7137641587:AAHsU_WRwSmMOrfPwdYQnd4Tq_ITXkbcveo"]="***REMOVED_BOT_TOKEN***"
    ["6389824290:AAFDrCwCXlW6tXSIvIeSfuHNmHW0hEoUhwo"]="***REMOVED_BOT_TOKEN***"
    ["7313269542:AAGO-u5kAOCVkg9ioKZ1mGPhv-ouesJoPxI"]="***REMOVED_BOT_TOKEN***"
)

echo -e "${YELLOW}🧹 Начинаю очистку git истории...${NC}"

# Создаем временный файл с правилами замены
temp_replacements=$(mktemp)
trap "rm -f $temp_replacements" EXIT

for secret in "${!SECRETS_TO_CLEAN[@]}"; do
    replacement="${SECRETS_TO_CLEAN[$secret]}"
    echo "$secret=>$replacement" >> "$temp_replacements"
done

echo "Создан файл замен: $temp_replacements"
echo "Количество секретов для замены: ${#SECRETS_TO_CLEAN[@]}"

# Выполняем очистку с git-filter-repo
echo -e "${YELLOW}🔄 Переписывание истории git...${NC}"
git-filter-repo --replace-text "$temp_replacements" --force

echo -e "${GREEN}✅ История git очищена!${NC}"

# Показываем статистику
echo -e "\n${YELLOW}📊 СТАТИСТИКА ОЧИСТКИ:${NC}"
echo "   🔄 Секретов заменено: ${#SECRETS_TO_CLEAN[@]}"
echo "   💾 Backup сохранен в: $backup_dir"
echo "   🌿 Все ветки обработаны"

# Проверяем что секреты действительно удалены
echo -e "\n${YELLOW}🔍 Проверка результата...${NC}"
secrets_found=0
for secret in "${!SECRETS_TO_CLEAN[@]}"; do
    if git log --all -S "$secret" --oneline | head -1 | grep -q .; then
        echo -e "${RED}❌ Секрет все еще найден: ${secret:0:20}...${NC}"
        secrets_found=$((secrets_found + 1))
    fi
done

if [ $secrets_found -eq 0 ]; then
    echo -e "${GREEN}✅ Все секреты успешно удалены из истории!${NC}"
else
    echo -e "${RED}⚠️  Обнаружены остатки: $secrets_found секретов${NC}"
fi

echo -e "\n${BOLD}${YELLOW}📋 КРИТИЧЕСКИ ВАЖНЫЕ СЛЕДУЮЩИЕ ШАГИ:${NC}"
echo ""
echo -e "${RED}1. ВСЕ РАЗРАБОТЧИКИ должны:${NC}"
echo "   • Удалить свои локальные копии: rm -rf local_repo_folder"
echo "   • Заново склонировать: git clone <repo_url>"
echo ""
echo -e "${RED}2. АДМИНИСТРАТОР должен:${NC}"
echo "   • Force push во все ветки: git push --all --force"
echo "   • Force push всех тегов: git push --tags --force"
echo "   • Уведомить всех в команде о переписывании истории"
echo ""
echo -e "${RED}3. ОБЯЗАТЕЛЬНО:${NC}"
echo "   • Отозвать все найденные ключи в соответствующих сервисах"
echo "   • Создать новые API ключи"
echo "   • Обновить переменные окружения на серверах"
echo "   • Установить хуки безопасности: ./scripts/install-security-hooks.sh"
echo ""
echo -e "${YELLOW}💡 Рекомендация:${NC}"
echo "   Запустите ./scripts/security-scan.sh для финальной проверки"
echo ""
echo -e "${GREEN}🎉 Очистка завершена успешно!${NC}"