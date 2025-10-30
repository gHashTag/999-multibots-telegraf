#!/bin/bash

# 🔧 QUICK ENV FIX SCRIPT
# Быстрое исправление проблем с .env файлами

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}🔧 ENV Quick Fix${NC}"
echo -e "${CYAN}================${NC}\n"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
WORKTREE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MAIN_REPO_DIR="/Users/playra/999-agents-telegraf"

# 1. Синхронизация .env файлов
echo -e "${BLUE}Step 1: Syncing .env files...${NC}"
"$SCRIPT_DIR/worktree-env-sync.sh"

# 2. Установка git hooks
echo -e "\n${BLUE}Step 2: Setting up git hooks...${NC}"
"$SCRIPT_DIR/setup-worktree-hooks.sh"

# 3. Проверка прав доступа
echo -e "\n${BLUE}Step 3: Checking file permissions...${NC}"
chmod +x "$SCRIPT_DIR"/*.sh
echo -e "${GREEN}✅ All scripts are executable${NC}"

# 4. Создание символической ссылки как альтернатива (опционально)
echo -e "\n${BLUE}Step 4: Symlink option...${NC}"
if [[ ! -L "$WORKTREE_DIR/.env" ]]; then
  echo -e "${YELLOW}Would you like to create a symlink instead of copying? (y/n)${NC}"
  echo -e "${YELLOW}This will keep .env always in sync automatically.${NC}"
  read -r -n 1 -p "Choice: " choice
  echo
  if [[ "$choice" == "y" || "$choice" == "Y" ]]; then
    rm -f "$WORKTREE_DIR/.env"
    ln -s "$MAIN_REPO_DIR/.env" "$WORKTREE_DIR/.env"
    echo -e "${GREEN}✅ Symlink created${NC}"
  else
    echo -e "${BLUE}ℹ️  Keeping regular file copy${NC}"
  fi
else
  echo -e "${GREEN}✅ Symlink already exists${NC}"
fi

# 5. Тестирование загрузки
echo -e "\n${BLUE}Step 5: Testing environment loading...${NC}"
if [[ -f "$WORKTREE_DIR/.env" ]]; then
  # Подсчет переменных
  ENV_COUNT=$(grep -c "=" "$WORKTREE_DIR/.env" || echo "0")
  echo -e "${GREEN}✅ .env file exists with $ENV_COUNT variables${NC}"

  # Проверка критических переменных
  MISSING_VARS=()
  for var in "SUPABASE_URL" "SUPABASE_SERVICE_KEY" "BOT_TOKEN"; do
    if ! grep -q "^$var=" "$WORKTREE_DIR/.env"; then
      MISSING_VARS+=("$var")
    fi
  done

  if [[ ${#MISSING_VARS[@]} -eq 0 ]]; then
    echo -e "${GREEN}✅ All critical variables present${NC}"
  else
    echo -e "${RED}❌ Missing critical variables:${NC}"
    for var in "${MISSING_VARS[@]}"; do
      echo -e "${RED}   • $var${NC}"
    done
  fi
else
  echo -e "${RED}❌ .env file not found!${NC}"
  exit 1
fi

echo -e "\n${GREEN}✨ Environment fix completed!${NC}"
echo -e "${CYAN}You can now run: ${YELLOW}bun dev${NC}"