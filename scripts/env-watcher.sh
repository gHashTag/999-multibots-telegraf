#!/bin/bash

# 🔍 ENV FILE WATCHER
# Мониторит изменения в основном .env файле и автоматически синхронизирует

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
WORKTREE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MAIN_ENV="/Users/playra/999-agents-telegraf/.env"
WORKTREE_ENV="$WORKTREE_DIR/.env"

echo -e "${BLUE}👁️  ENV File Watcher Started${NC}"
echo -e "${BLUE}============================${NC}"
echo -e "${YELLOW}Watching: $MAIN_ENV${NC}"
echo -e "${YELLOW}Syncing to: $WORKTREE_ENV${NC}"
echo -e "${GREEN}Press Ctrl+C to stop${NC}\n"

# Первичная синхронизация
"$SCRIPT_DIR/worktree-env-sync.sh"

# Функция для обработки изменений
handle_change() {
  echo -e "\n${YELLOW}🔄 Change detected in main .env file${NC}"
  "$SCRIPT_DIR/worktree-env-sync.sh"
  echo -e "${GREEN}✨ Sync completed${NC}"
  echo -e "${BLUE}Watching for changes...${NC}\n"
}

# Проверяем наличие fswatch
if command -v fswatch &> /dev/null; then
  echo -e "${GREEN}✅ Using fswatch for monitoring${NC}\n"
  fswatch -o "$MAIN_ENV" | while read f; do
    handle_change
  done
else
  echo -e "${YELLOW}⚠️  fswatch not found, using polling method${NC}"
  echo -e "${BLUE}To install fswatch: brew install fswatch${NC}\n"

  # Fallback на polling каждые 5 секунд
  LAST_MOD=""
  while true; do
    CURRENT_MOD=$(stat -f "%m" "$MAIN_ENV" 2>/dev/null || echo "0")
    if [[ "$CURRENT_MOD" != "$LAST_MOD" ]]; then
      if [[ -n "$LAST_MOD" ]]; then
        handle_change
      fi
      LAST_MOD="$CURRENT_MOD"
    fi
    sleep 5
  done
fi