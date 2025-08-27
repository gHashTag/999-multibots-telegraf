#!/bin/bash

<<<<<<< HEAD
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

# Примеры секретов для замены (используйте свои реальные секреты)
# НИКОГДА НЕ КОММИТЬТЕ РЕАЛЬНЫЕ СЕКРЕТЫ В ЭТОТ ФАЙЛ!
declare -A SECRETS_TO_CLEAN=(
    # Примеры плейсхолдеров - замените на свои реальные секреты
    # ["YOUR_ACTUAL_SECRET_HERE"]="***REMOVED_SECRET_TYPE***"
    # ["YOUR_BOT_TOKEN_HERE"]="***REMOVED_BOT_TOKEN***"
    # ["YOUR_API_KEY_HERE"]="***REMOVED_API_KEY***"
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
=======
# Exit on any error
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🧹 Starting git history cleanup..."

# Directory containing this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Project root directory
PROJECT_ROOT="$SCRIPT_DIR/.."

# Function to check if git-filter-repo is installed
check_git_filter_repo() {
    echo -e "\n${YELLOW}🔍 Checking for git-filter-repo...${NC}"
    
    if ! command -v git-filter-repo >/dev/null 2>&1; then
        echo -e "${RED}❌ git-filter-repo not found! Please install it:${NC}"
        echo "pip3 install git-filter-repo"
        exit 1
    fi
    
    echo -e "${GREEN}✅ git-filter-repo is installed${NC}"
}

# Function to ensure we're on a clean branch
ensure_clean_branch() {
    echo -e "\n${YELLOW}🔍 Checking git status...${NC}"
    
    if [[ -n $(git status --porcelain) ]]; then
        echo -e "${RED}❌ Working directory is not clean. Please commit or stash changes first.${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Working directory is clean${NC}"
}

# Function to create backup
create_backup() {
    echo -e "\n${YELLOW}🔍 Creating backup...${NC}"
    
    BACKUP_DIR="../repo_backup_$(date +%Y%m%d_%H%M%S)"
    cp -r "$PROJECT_ROOT" "$BACKUP_DIR"
    
    echo -e "${GREEN}✅ Backup created at: $BACKUP_DIR${NC}"
}

# Function to remove secrets from history
clean_history() {
    echo -e "\n${YELLOW}🔍 Cleaning git history...${NC}"
    
    # Patterns to search and replace
    PATTERNS=(
        # API Keys
        's/[a-zA-Z0-9]{"api_key":"[a-zA-Z0-9]+"}/"api_key":"[REDACTED]"/g'
        's/[a-zA-Z0-9]{"apikey":"[a-zA-Z0-9]+"}/"apikey":"[REDACTED]"/g'
        's/api[_-]key["\s]*[:=]\s*["'"'"']\([^"'"'"']*\)["'"'"']/api_key=[REDACTED]/g'
        
        # Auth Tokens
        's/auth[_-]token["\s]*[:=]\s*["'"'"']\([^"'"'"']*\)["'"'"']/auth_token=[REDACTED]/g'
        's/bearer[_-]token["\s]*[:=]\s*["'"'"']\([^"'"'"']*\)["'"'"']/bearer_token=[REDACTED]/g'
        
        # Passwords
        's/password["\s]*[:=]\s*["'"'"']\([^"'"'"']*\)["'"'"']/password=[REDACTED]/g'
        's/passwd["\s]*[:=]\s*["'"'"']\([^"'"'"']*\)["'"'"']/passwd=[REDACTED]/g'
        
        # AWS
        's/aws[_-]access[_-]key[_-]id["\s]*[:=]\s*["'"'"']\([^"'"'"']*\)["'"'"']/aws_access_key_id=[REDACTED]/g'
        's/aws[_-]secret[_-]access[_-]key["\s]*[:=]\s*["'"'"']\([^"'"'"']*\)["'"'"']/aws_secret_access_key=[REDACTED]/g'
        
        # Database
        's/db[_-]password["\s]*[:=]\s*["'"'"']\([^"'"'"']*\)["'"'"']/db_password=[REDACTED]/g'
        's/database[_-]url["\s]*[:=]\s*["'"'"']\([^"'"'"']*\)["'"'"']/database_url=[REDACTED]/g'
        
        # JWT
        's/jwt[_-]secret["\s]*[:=]\s*["'"'"']\([^"'"'"']*\)["'"'"']/jwt_secret=[REDACTED]/g'
        's/jwt[_-]token["\s]*[:=]\s*["'"'"']\([^"'"'"']*\)["'"'"']/jwt_token=[REDACTED]/g'
        
        # Private Keys
        's/private[_-]key["\s]*[:=]\s*["'"'"']\([^"'"'"']*\)["'"'"']/private_key=[REDACTED]/g'
        's/-----BEGIN PRIVATE KEY-----[^-]*-----END PRIVATE KEY-----/[PRIVATE_KEY_REDACTED]/g'
        's/-----BEGIN RSA PRIVATE KEY-----[^-]*-----END RSA PRIVATE KEY-----/[RSA_KEY_REDACTED]/g'
    )
    
    # Create a temporary file for the filtering rules
    RULES_FILE=$(mktemp)
    echo "Creating filter rules at: $RULES_FILE"
    
    # Add rules to remove common secrets
    for PATTERN in "${PATTERNS[@]}"; do
        echo "s|$PATTERN|[REDACTED]|g" >> "$RULES_FILE"
    done
    
    # Run git filter-branch
    echo "Running git filter-branch..."
    git filter-branch -f --tree-filter \
    "find . -type f -not -path './.git/*' -exec sed -i '' -f $RULES_FILE {} +" \
    --tag-name-filter cat -- --all
    
    # Clean up temporary file
    rm "$RULES_FILE"
    
    echo -e "${GREEN}✅ Git history cleaned${NC}"
}

# Function to clean up refs and force garbage collection
cleanup_refs() {
    echo -e "\n${YELLOW}🔍 Cleaning up refs and running garbage collection...${NC}"
    
    # Remove the original refs
    rm -rf .git/refs/original/
    
    # Remove the filter-branch backup
    rm -rf .git/refs/refs/
    
    # Expire reflog
    git reflog expire --expire=now --all
    
    # Aggressive garbage collection
    git gc --prune=now --aggressive
    
    echo -e "${GREEN}✅ Refs cleaned and garbage collected${NC}"
}

# Function to verify cleaning
verify_cleaning() {
    echo -e "\n${YELLOW}🔍 Verifying cleaning...${NC}"
    
    # Patterns to check for
    PATTERNS=(
        "api[_-]key['\"]?\s*[:=]\s*['\"]\S+['\"]"
        "token['\"]?\s*[:=]\s*['\"]\S+['\"]"
        "password['\"]?\s*[:=]\s*['\"]\S+['\"]"
        "secret['\"]?\s*[:=]\s*['\"]\S+['\"]"
        "private[_-]key['\"]?\s*[:=]\s*['\"]\S+['\"]"
        "client[_-]secret['\"]?\s*[:=]\s*['\"]\S+['\"]"
    )
    
    SECRETS_FOUND=0
    
    for PATTERN in "${PATTERNS[@]}"; do
        if git log -p | grep -E "$PATTERN" > /dev/null; then
            echo -e "${RED}❌ Found potential secret matching pattern: $PATTERN${NC}"
            SECRETS_FOUND=1
        fi
    done
    
    if [ $SECRETS_FOUND -eq 0 ]; then
        echo -e "${GREEN}✅ No secrets found in history${NC}"
    else
        echo -e "${RED}❌ Some secrets may remain in history${NC}"
        exit 1
    fi
}

# Main execution
main() {
    echo "🚀 Starting git history cleanup for project at: $PROJECT_ROOT"
    
    check_git_filter_repo
    ensure_clean_branch
    create_backup
    clean_history
    cleanup_refs
    verify_cleaning
    
    echo -e "\n${GREEN}✅ Git history cleanup completed${NC}"
    echo -e "${YELLOW}⚠️ Important: You'll need to force-push these changes:${NC}"
    echo "git push origin --force --all"
    echo "git push origin --force --tags"
}

main "$@"
>>>>>>> origin/veo3-1
