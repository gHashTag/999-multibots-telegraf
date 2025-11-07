#!/bin/bash

# 🪝 SETUP WORKTREE GIT HOOKS
# Настраивает git hooks для автоматической синхронизации .env

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
WORKTREE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
GIT_DIR=$(git rev-parse --git-dir 2>/dev/null || echo ".git")
HOOKS_DIR="$GIT_DIR/hooks"

echo -e "${BLUE}🪝 Setting up Worktree Git Hooks${NC}"
echo -e "${BLUE}=================================${NC}"

# Создаем директорию hooks если её нет
mkdir -p "$HOOKS_DIR"

# Post-checkout hook
echo -e "\n${YELLOW}📝 Creating post-checkout hook...${NC}"
cat > "$HOOKS_DIR/post-checkout" << 'EOF'
#!/bin/bash
# Auto-sync .env file after checkout

# Только если это не bare checkout
if [ "$3" = "1" ]; then
  WORKTREE_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
  if [ -n "$WORKTREE_ROOT" ] && [ -f "$WORKTREE_ROOT/scripts/worktree-env-sync.sh" ]; then
    echo "🔄 Syncing .env files..."
    "$WORKTREE_ROOT/scripts/worktree-env-sync.sh"
  fi
fi
EOF

chmod +x "$HOOKS_DIR/post-checkout"
echo -e "${GREEN}✅ post-checkout hook created${NC}"

# Post-merge hook (для pull)
echo -e "\n${YELLOW}📝 Creating post-merge hook...${NC}"
cat > "$HOOKS_DIR/post-merge" << 'EOF'
#!/bin/bash
# Auto-sync .env file after merge/pull

WORKTREE_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -n "$WORKTREE_ROOT" ] && [ -f "$WORKTREE_ROOT/scripts/worktree-env-sync.sh" ]; then
  echo "🔄 Syncing .env files after merge..."
  "$WORKTREE_ROOT/scripts/worktree-env-sync.sh"
fi
EOF

chmod +x "$HOOKS_DIR/post-merge"
echo -e "${GREEN}✅ post-merge hook created${NC}"

echo -e "\n${GREEN}✨ Git hooks setup completed!${NC}"
echo -e "${BLUE}The .env file will now automatically sync on:${NC}"
echo -e "  • git checkout"
echo -e "  • git pull"
echo -e "  • git merge"