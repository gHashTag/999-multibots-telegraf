#!/bin/bash
# worktree-env-sync.sh - Syncs .env file for git worktrees
# This is a placeholder script - no-op for normal development

# Check if we're in a worktree
if [ -f ".git" ] && grep -q "gitdir:" .git 2>/dev/null; then
    # We're in a worktree, could sync .env from main if needed
    echo "Worktree detected, env sync available"
fi

# Exit successfully
exit 0
