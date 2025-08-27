#!/bin/bash

# Exit on any error
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔄 Starting Git history cleanup...${NC}"

# Files that might contain secrets
SENSITIVE_FILES=(
    "DEBUG_VEO3_FIX.md"
    "SECURITY.md"
    ".env"
    "*.env"
    "config.json"
    "secrets.json"
)

# Create a temporary branch
TEMP_BRANCH="temp-clean-$(date +%s)"
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo -e "${YELLOW}📝 Creating temporary branch: $TEMP_BRANCH${NC}"
git checkout -b "$TEMP_BRANCH"

# Remove sensitive files from all commits
echo -e "${YELLOW}🗑️ Removing sensitive files from history...${NC}"
git filter-branch -f --index-filter \
    "git rm -rf --cached --ignore-unmatch ${SENSITIVE_FILES[*]}" \
    --prune-empty --tag-name-filter cat -- --all

# Clean up refs and logs
echo -e "${YELLOW}🧹 Cleaning up refs and logs...${NC}"
git for-each-ref --format="%(refname)" refs/original/ | xargs -n 1 git update-ref -d
git reflog expire --expire=now --all
git gc --aggressive --prune=now

# Force push changes
echo -e "${YELLOW}⬆️ Force pushing changes...${NC}"
git push origin "$TEMP_BRANCH" --force

echo -e "${GREEN}✅ Git history cleanup completed${NC}"
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Review the changes in $TEMP_BRANCH"
echo "2. Create a new pull request from $TEMP_BRANCH"
echo "3. After review and approval, merge to main"
echo -e "${RED}Note: This operation rewrites git history. All team members will need to rebase their work.${NC}"
