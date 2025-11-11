#!/usr/bin/env bash
# ==========================================================================================================
# 🔐 RESTORE .ENV FROM INFISICAL - БЕЗОПАСНОЕ ВОССТАНОВЛЕНИЕ СЕКРЕТОВ
# ==========================================================================================================
#
# Скрипт автоматически восстанавливает .env файл из Infisical Cloud.
# Использует credentials из локального .env или environment variables.
#
# USAGE:
#   ./scripts/restore-env-from-infisical.sh [--prod|--dev]
#
# EXAMPLES:
#   ./scripts/restore-env-from-infisical.sh --prod    # Восстановить production .env
#   ./scripts/restore-env-from-infisical.sh           # Восстановить development .env (default)
#
# ==========================================================================================================

set -euo pipefail

# Цвета для логов
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Определяем окружение
ENVIRONMENT=${1:---dev}
if [[ "$ENVIRONMENT" == "--prod" ]]; then
    ENV_NAME="prod"
    echo -e "${YELLOW}⚠️  PRODUCTION MODE${NC}"
else
    ENV_NAME="dev"
    echo -e "${BLUE}ℹ️  DEVELOPMENT MODE${NC}"
fi

# Путь к .env файлу
ENV_FILE=".env"
ENV_BACKUP=".env.backup.$(date +%Y%m%d_%H%M%S)"

echo -e "${BLUE}🔐 [INFISICAL RESTORE] Начинаем восстановление .env из Infisical Cloud${NC}"

# Проверяем наличие infisical CLI
if ! command -v infisical &> /dev/null; then
    echo -e "${RED}❌ Infisical CLI не установлен!${NC}"
    echo -e "${YELLOW}Установите: https://infisical.com/docs/cli/overview${NC}"
    exit 1
fi

# Загружаем credentials из .env (если существует)
if [[ -f "$ENV_FILE" ]]; then
    echo -e "${GREEN}✅ Найден существующий .env файл${NC}"

    # Создаем бэкап
    echo -e "${BLUE}📦 Создаем бэкап: $ENV_BACKUP${NC}"
    cp "$ENV_FILE" "$ENV_BACKUP"

    # Читаем Infisical credentials из текущего .env
    if grep -q "INFISICAL_CLIENT_ID" "$ENV_FILE"; then
        export $(grep "INFISICAL_CLIENT_ID" "$ENV_FILE" | xargs)
        export $(grep "INFISICAL_CLIENT_SECRET" "$ENV_FILE" | xargs)
        export $(grep "INFISICAL_PROJECT_ID" "$ENV_FILE" | xargs)
        echo -e "${GREEN}✅ Infisical credentials загружены из .env${NC}"
    fi
fi

# Проверяем наличие credentials
if [[ -z "${INFISICAL_CLIENT_ID:-}" ]] || [[ -z "${INFISICAL_CLIENT_SECRET:-}" ]] || [[ -z "${INFISICAL_PROJECT_ID:-}" ]]; then
    echo -e "${RED}❌ Infisical credentials не найдены!${NC}"
    echo -e "${YELLOW}Установите переменные окружения:${NC}"
    echo "  export INFISICAL_CLIENT_ID=your_client_id"
    echo "  export INFISICAL_CLIENT_SECRET=your_client_secret"
    echo "  export INFISICAL_PROJECT_ID=your_project_id"
    exit 1
fi

# Экспортируем секреты из Infisical
echo -e "${BLUE}📥 Экспортируем секреты из Infisical (env=$ENV_NAME)...${NC}"
TEMP_ENV="/tmp/infisical_export_$(date +%s).env"

# Экспортируем без кавычек (sed убирает кавычки)
infisical export \
    --projectId="$INFISICAL_PROJECT_ID" \
    --env="$ENV_NAME" \
    --path=/ \
    --format=dotenv \
    | sed "s/'//g" > "$TEMP_ENV"

# Проверяем, что экспорт успешен
if [[ ! -s "$TEMP_ENV" ]]; then
    echo -e "${RED}❌ Экспорт из Infisical failed или пустой!${NC}"
    rm -f "$TEMP_ENV"
    exit 1
fi

# Добавляем Infisical credentials обратно (они не экспортируются Infisical CLI)
echo "" >> "$TEMP_ENV"
echo "# Infisical Credentials (added by restore script)" >> "$TEMP_ENV"
echo "INFISICAL_CLIENT_ID=$INFISICAL_CLIENT_ID" >> "$TEMP_ENV"
echo "INFISICAL_CLIENT_SECRET=$INFISICAL_CLIENT_SECRET" >> "$TEMP_ENV"
echo "INFISICAL_PROJECT_ID=$INFISICAL_PROJECT_ID" >> "$TEMP_ENV"

# Перемещаем временный файл в .env
mv "$TEMP_ENV" "$ENV_FILE"

echo -e "${GREEN}✅ .env файл успешно восстановлен из Infisical!${NC}"
echo -e "${BLUE}📊 Статистика:${NC}"
wc -l "$ENV_FILE"

# Проверяем критичные ключи
echo -e "${BLUE}🔍 Проверяем критичные ключи...${NC}"
CRITICAL_KEYS=("HEYGEN_COCOAGE_API_KEY" "HEYGEN_HAIM_API_KEY" "ELEVENLABS_API_KEY" "BOT_TOKEN_1" "SUPABASE_URL")

for KEY in "${CRITICAL_KEYS[@]}"; do
    if grep -q "^$KEY=" "$ENV_FILE"; then
        echo -e "${GREEN}  ✅ $KEY${NC}"
    else
        echo -e "${RED}  ❌ $KEY MISSING!${NC}"
    fi
done

echo -e "${GREEN}🎉 Готово! Перезапустите Docker контейнер для применения изменений.${NC}"
echo -e "${YELLOW}💡 TIP: Бэкап сохранен в $ENV_BACKUP${NC}"
