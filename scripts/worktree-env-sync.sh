#!/bin/bash

# 🔄 WORKTREE ENV SYNCHRONIZATION SCRIPT
# Автоматически синхронизирует .env файлы между основным репозиторием и worktree

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Определяем пути
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
WORKTREE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MAIN_REPO_DIR="/Users/playra/999-agents-telegraf"

echo -e "${BLUE}🔄 WORKTREE ENV SYNC${NC}"
echo -e "${BLUE}===================${NC}"

# Проверяем, что мы в worktree
if [[ ! -d "$WORKTREE_DIR/.git" ]] || [[ ! -f "$WORKTREE_DIR/.git" ]]; then
  echo -e "${YELLOW}⚠️  Warning: Not in a git worktree directory${NC}"
fi

# Функция для копирования .env файла
sync_env_file() {
  local source="$1"
  local dest="$2"
  local file_name="$3"

  if [[ -f "$source" ]]; then
    if [[ -f "$dest" ]]; then
      # Проверяем, отличаются ли файлы
      if ! cmp -s "$source" "$dest"; then
        echo -e "${YELLOW}📝 $file_name differs, updating...${NC}"
        cp "$source" "$dest"
        echo -e "${GREEN}✅ $file_name updated successfully${NC}"
      else
        echo -e "${GREEN}✅ $file_name is already up to date${NC}"
      fi
    else
      echo -e "${YELLOW}📥 Copying $file_name...${NC}"
      cp "$source" "$dest"
      echo -e "${GREEN}✅ $file_name copied successfully${NC}"
    fi
  else
    echo -e "${RED}❌ Source $file_name not found at: $source${NC}"
    return 1
  fi
}

# Синхронизация .env
echo -e "\n${BLUE}📋 Syncing .env files...${NC}"
sync_env_file "$MAIN_REPO_DIR/.env" "$WORKTREE_DIR/.env" ".env"

# Синхронизация .env.local (если существует)
if [[ -f "$MAIN_REPO_DIR/.env.local" ]]; then
  sync_env_file "$MAIN_REPO_DIR/.env.local" "$WORKTREE_DIR/.env.local" ".env.local"
fi

# Синхронизация .env.production (если существует)
if [[ -f "$MAIN_REPO_DIR/.env.production" ]]; then
  sync_env_file "$MAIN_REPO_DIR/.env.production" "$WORKTREE_DIR/.env.production" ".env.production"
fi

# Проверяем наличие Infisical конфигурации
echo -e "\n${BLUE}🔍 Verifying Infisical configuration...${NC}"
if [[ -f "$WORKTREE_DIR/.env" ]]; then
  # Проверяем Infisical credentials (новая схема)
  if grep -q "INFISICAL_CLIENT_ID=" "$WORKTREE_DIR/.env"; then
    echo -e "${GREEN}✅ Infisical CLIENT_ID found${NC}"
  else
    echo -e "${YELLOW}⚠️  Infisical CLIENT_ID not found (old .env?)${NC}"
  fi

  if grep -q "INFISICAL_PROJECT_ID=" "$WORKTREE_DIR/.env"; then
    echo -e "${GREEN}✅ Infisical PROJECT_ID found${NC}"
  else
    echo -e "${YELLOW}⚠️  Infisical PROJECT_ID not found (old .env?)${NC}"
  fi

  if grep -q "INFISICAL_ENVIRONMENT=" "$WORKTREE_DIR/.env"; then
    INFISICAL_ENV=$(grep "INFISICAL_ENVIRONMENT=" "$WORKTREE_DIR/.env" | cut -d'=' -f2)
    echo -e "${GREEN}✅ Infisical Environment: $INFISICAL_ENV${NC}"
  fi

  # Показать количество переменных
  ENV_COUNT=$(grep -c "=" "$WORKTREE_DIR/.env" || true)
  echo -e "${BLUE}📊 Total .env variables: $ENV_COUNT${NC}"
  echo -e "${BLUE}💡 Secrets loaded from Infisical at runtime${NC}"
else
  echo -e "${RED}❌ .env file not found after sync!${NC}"
  exit 1
fi

echo -e "\n${GREEN}✨ Sync completed successfully!${NC}"