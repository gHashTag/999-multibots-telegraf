#!/bin/bash

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo ""
echo "=================================================================="
log_info "MERGE В MAIN"
echo "=================================================================="
echo ""

# Проверяем GitHub CLI и статус PR
log_info "1. Проверка PR через GitHub CLI..."
if command -v gh &> /dev/null; then
    PR_INFO=$(gh pr view 341 --json state,title,url 2>/dev/null || echo '{}')
    echo "PR #341: $PR_INFO"
    
    # Проверяем статус PR
    log_info "2. Попытка merge через GitHub CLI..."
    gh pr merge 341 --merge --delete-branch 2>&1 || log_error "Не удалось merge через CLI"
else
    log_info "GitHub CLI недоступен"
fi

# Попробуем сделать merge вручную
log_info "3. Ручной merge в main..."
git checkout main 2>/dev/null || log_error "Не удалось переключиться на main (используется другим worktree)"

# Если не получилось переключиться, используем worktree
if [ $? -ne 0 ]; then
    log_info "4. Использование worktree для main..."
    git worktree add /Users/playra/999-agents-telegraf/worktrees/main-temp main 2>/dev/null || true
    cd /Users/playra/999-agents-telegraf/worktrees/main-temp
    
    # Fetch последних изменений
    git fetch origin
    
    # Merge reels-callback-1
    log_info "5. Merge с reels-callback-1..."
    git merge origin/reels-callback-1 --no-edit -m "merge: Деплой восстановленного ai-reels-callback (v002)"
    
    # Push в main
    log_info "6. Push в main..."
    git push origin main
    
    # Проверим статус
    log_info "7. Проверка merge..."
    git log --oneline -5
    
    # Удаляем временный worktree
    cd -
    git worktree remove /Users/playra/999-agents-telegraf/worktrees/main-temp
else
    # Обычный merge
    git merge origin/reels-callback-1 --no-edit -m "merge: Деплой восстановленного ai-reels-callback (v002)"
    git push origin main
fi

echo ""
echo "=================================================================="
log_success "MERGE ЗАВЕРШЁН"
echo "=================================================================="
echo ""
echo "Проверьте:"
echo "1. https://github.com/gHashTag/999-multibots-telegraf/tree/main"
echo "2. PR #341 должен быть closed и merged"
echo "3. В main должны появиться новые коммиты"
echo ""
