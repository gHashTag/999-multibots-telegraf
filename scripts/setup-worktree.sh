#!/bin/bash

##############################################################################
# Automatic Worktree Setup Script
# Copies .env from main project to new worktree
# Usage: ./scripts/setup-worktree.sh <worktree-name>
##############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN_PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Automatic Worktree Setup Script     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Check if worktree name provided
if [ -z "$1" ]; then
    echo -e "${RED}❌ Error: Worktree name required${NC}"
    echo ""
    echo -e "${YELLOW}Usage:${NC}"
    echo "  ./scripts/setup-worktree.sh <worktree-name>"
    echo ""
    echo -e "${YELLOW}Example:${NC}"
    echo "  ./scripts/setup-worktree.sh feature-new-api"
    echo ""
    exit 1
fi

WORKTREE_NAME="$1"
WORKTREE_PATH="${MAIN_PROJECT_DIR}/worktrees/${WORKTREE_NAME}"

echo -e "${BLUE}📋 Configuration:${NC}"
echo "  Main project: ${MAIN_PROJECT_DIR}"
echo "  Worktree name: ${WORKTREE_NAME}"
echo "  Worktree path: ${WORKTREE_PATH}"
echo ""

# Check if main .env exists
if [ ! -f "${MAIN_PROJECT_DIR}/.env" ]; then
    echo -e "${RED}❌ Error: .env file not found in main project${NC}"
    echo "  Expected: ${MAIN_PROJECT_DIR}/.env"
    exit 1
fi

# Check if worktree already exists
if [ -d "${WORKTREE_PATH}" ]; then
    echo -e "${YELLOW}⚠️  Worktree already exists${NC}"
    echo ""
    read -p "Do you want to update .env in existing worktree? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}ℹ️  Cancelled${NC}"
        exit 0
    fi
else
    # Create worktree
    echo -e "${BLUE}🌿 Creating git worktree...${NC}"
    cd "${MAIN_PROJECT_DIR}"

    # Create branch and worktree
    BRANCH_NAME="${WORKTREE_NAME}"

    if git show-ref --verify --quiet "refs/heads/${BRANCH_NAME}"; then
        echo -e "${YELLOW}⚠️  Branch '${BRANCH_NAME}' already exists, using existing branch${NC}"
        git worktree add "worktrees/${WORKTREE_NAME}" "${BRANCH_NAME}"
    else
        echo -e "${GREEN}✅ Creating new branch '${BRANCH_NAME}'${NC}"
        git worktree add "worktrees/${WORKTREE_NAME}" -b "${BRANCH_NAME}"
    fi

    echo ""
fi

# Copy .env
echo -e "${BLUE}📄 Copying .env file...${NC}"
cp "${MAIN_PROJECT_DIR}/.env" "${WORKTREE_PATH}/.env"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ .env copied successfully${NC}"
else
    echo -e "${RED}❌ Failed to copy .env${NC}"
    exit 1
fi

# Count environment variables
ENV_COUNT=$(grep -c "^[A-Z]" "${WORKTREE_PATH}/.env" || true)
echo -e "${GREEN}✅ Copied ${ENV_COUNT} environment variables${NC}"
echo ""

# Optional: Copy other config files
echo -e "${BLUE}📦 Checking for additional config files...${NC}"

CONFIG_FILES=(
    ".nvmrc"
    ".node-version"
    "tsconfig.json"
)

COPIED_COUNT=0
for file in "${CONFIG_FILES[@]}"; do
    if [ -f "${MAIN_PROJECT_DIR}/${file}" ]; then
        if [ ! -f "${WORKTREE_PATH}/${file}" ]; then
            cp "${MAIN_PROJECT_DIR}/${file}" "${WORKTREE_PATH}/${file}"
            echo -e "${GREEN}  ✅ Copied ${file}${NC}"
            ((COPIED_COUNT++))
        fi
    fi
done

if [ $COPIED_COUNT -eq 0 ]; then
    echo -e "${BLUE}  ℹ️  No additional files to copy${NC}"
fi
echo ""

# Summary
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       Setup Complete! 🎉               ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}📍 Worktree location:${NC}"
echo "  ${WORKTREE_PATH}"
echo ""
echo -e "${YELLOW}🚀 Next steps:${NC}"
echo "  cd worktrees/${WORKTREE_NAME}"
echo "  npm install"
echo "  npm run dev"
echo ""
echo -e "${BLUE}💡 Tip: Your .env is already configured!${NC}"
echo ""
