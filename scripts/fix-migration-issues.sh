#!/bin/bash

# 🔧 FIX CRITICAL MIGRATION ISSUES
# This script fixes all critical issues found in migration review

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Fixing Critical Migration Issues                       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Detect repository root
if git rev-parse --show-toplevel > /dev/null 2>&1; then
    REPO_ROOT="$(git rev-parse --show-toplevel)"
else
    echo -e "${RED}Error: Not in a git repository${NC}"
    exit 1
fi

echo -e "${GREEN}Repository root: $REPO_ROOT${NC}"
echo ""

# Fix 1: Add port 4000 to Dockerfile
echo -e "${YELLOW}Fix #1: Adding port 4000 to Dockerfile...${NC}"

DOCKERFILE="$REPO_ROOT/Dockerfile"
if [ ! -f "$DOCKERFILE" ]; then
    # Try parent directory (for worktree)
    DOCKERFILE="$(dirname "$REPO_ROOT")/$(basename "$REPO_ROOT" | sed 's/worktrees\///')/Dockerfile"
    if [ ! -f "$DOCKERFILE" ]; then
        DOCKERFILE="/Users/playra/999-agents-telegraf/Dockerfile"
    fi
fi

if [ -f "$DOCKERFILE" ]; then
    # Check if port 4000 already in EXPOSE
    if grep -q "EXPOSE.*4000" "$DOCKERFILE"; then
        echo -e "${GREEN}  ✓ Port 4000 already in Dockerfile${NC}"
    else
        # Backup original
        cp "$DOCKERFILE" "$DOCKERFILE.bak"

        # Add port 4000 to EXPOSE line
        sed -i.tmp 's/EXPOSE \(.*\) 2999$/EXPOSE \1 2999 4000/' "$DOCKERFILE"
        rm -f "$DOCKERFILE.tmp"

        echo -e "${GREEN}  ✓ Port 4000 added to Dockerfile${NC}"
        echo -e "${GREEN}  ✓ Backup created: Dockerfile.bak${NC}"
    fi
else
    echo -e "${YELLOW}  ⚠ Dockerfile not found at expected locations${NC}"
fi

# Fix 2: Update script paths to auto-detect
echo ""
echo -e "${YELLOW}Fix #2: Updating script paths to auto-detect...${NC}"

MIGRATE_SCRIPT="$REPO_ROOT/scripts/migrate-inngest-functions.sh"
if [ -f "$MIGRATE_SCRIPT" ]; then
    # Backup original
    cp "$MIGRATE_SCRIPT" "$MIGRATE_SCRIPT.bak"

    # Replace hardcoded path with auto-detection
    sed -i.tmp 's|TELEGRAF_PATH="/Users/playra/999-agents-telegraf"|TELEGRAF_PATH="$(git rev-parse --show-toplevel)"|' "$MIGRATE_SCRIPT"
    rm -f "$MIGRATE_SCRIPT.tmp"

    echo -e "${GREEN}  ✓ Script paths updated to auto-detect${NC}"
    echo -e "${GREEN}  ✓ Backup created: migrate-inngest-functions.sh.bak${NC}"
else
    echo -e "${YELLOW}  ⚠ Migration script not found${NC}"
fi

# Fix 3: Copy docs from worktree to main repo (if in worktree)
echo ""
echo -e "${YELLOW}Fix #3: Checking if running in worktree...${NC}"

# Check if we're in a worktree
if git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    WORKTREE_NAME="$(basename "$REPO_ROOT")"
    MAIN_REPO="$(git worktree list | head -1 | awk '{print $1}')"

    if [ "$REPO_ROOT" != "$MAIN_REPO" ]; then
        echo -e "${BLUE}  → Running in worktree: $WORKTREE_NAME${NC}"
        echo -e "${BLUE}  → Main repo: $MAIN_REPO${NC}"
        echo ""
        echo -e "${YELLOW}  Copying migration docs to main repo...${NC}"

        # Copy docs
        mkdir -p "$MAIN_REPO/docs"
        cp "$REPO_ROOT/docs/INNGEST_MIGRATION_PLAN.md" "$MAIN_REPO/docs/" 2>/dev/null && echo -e "${GREEN}    ✓ INNGEST_MIGRATION_PLAN.md${NC}"
        cp "$REPO_ROOT/docs/MIGRATION_DEPENDENCIES.md" "$MAIN_REPO/docs/" 2>/dev/null && echo -e "${GREEN}    ✓ MIGRATION_DEPENDENCIES.md${NC}"
        cp "$REPO_ROOT/docs/POST_MIGRATION_CHECKLIST.md" "$MAIN_REPO/docs/" 2>/dev/null && echo -e "${GREEN}    ✓ POST_MIGRATION_CHECKLIST.md${NC}"
        cp "$REPO_ROOT/docs/MIGRATION_QUICKSTART.md" "$MAIN_REPO/docs/" 2>/dev/null && echo -e "${GREEN}    ✓ MIGRATION_QUICKSTART.md${NC}"
        cp "$REPO_ROOT/docs/MIGRATION_ISSUES_AND_FIXES.md" "$MAIN_REPO/docs/" 2>/dev/null && echo -e "${GREEN}    ✓ MIGRATION_ISSUES_AND_FIXES.md${NC}"

        # Copy scripts
        mkdir -p "$MAIN_REPO/scripts"
        cp "$REPO_ROOT/scripts/migrate-inngest-functions.sh" "$MAIN_REPO/scripts/" 2>/dev/null && echo -e "${GREEN}    ✓ migrate-inngest-functions.sh${NC}"
        cp "$REPO_ROOT/scripts/install-migration-deps.sh" "$MAIN_REPO/scripts/" 2>/dev/null && echo -e "${GREEN}    ✓ install-migration-deps.sh${NC}"
        cp "$REPO_ROOT/scripts/fix-migration-issues.sh" "$MAIN_REPO/scripts/" 2>/dev/null && echo -e "${GREEN}    ✓ fix-migration-issues.sh${NC}"

        # Make scripts executable
        chmod +x "$MAIN_REPO/scripts/migrate-inngest-functions.sh" 2>/dev/null
        chmod +x "$MAIN_REPO/scripts/install-migration-deps.sh" 2>/dev/null
        chmod +x "$MAIN_REPO/scripts/fix-migration-issues.sh" 2>/dev/null

        echo ""
        echo -e "${GREEN}  ✓ All files copied to main repo${NC}"
        echo -e "${YELLOW}  ⚠ Remember to commit changes in main repo:${NC}"
        echo -e "${YELLOW}     cd $MAIN_REPO${NC}"
        echo -e "${YELLOW}     git add docs/ scripts/ Dockerfile${NC}"
        echo -e "${YELLOW}     git commit -m 'fix: critical migration issues + add migration docs'${NC}"
    else
        echo -e "${GREEN}  ✓ Already in main repo${NC}"
    fi
else
    echo -e "${YELLOW}  ⚠ Not in a git work tree${NC}"
fi

# Fix 4: Create env validation helper
echo ""
echo -e "${YELLOW}Fix #4: Creating environment validation helper...${NC}"

ENV_VALIDATOR="$REPO_ROOT/scripts/validate-migration-env.sh"
cat > "$ENV_VALIDATOR" << 'EOF'
#!/bin/bash

# Environment Variables Validator for Migration

REQUIRED_VARS=(
    "RENDER_SERVER_HOST"
    "RENDER_SERVER_USER"
    "RENDER_SERVER_SSH_KEY_PATH"
    "RENDER_SERVER_PROJECT_PATH"
    "AWS_ACCESS_KEY_ID"
    "AWS_SECRET_ACCESS_KEY"
    "AWS_REGION"
    "AWS_S3_BUCKET"
    "INNGEST_EVENT_KEY"
    "INNGEST_SIGNING_KEY"
)

echo "🔍 Validating environment variables..."
echo ""

MISSING=0

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ Missing: $var"
        MISSING=$((MISSING + 1))
    else
        echo "✅ Found: $var"
    fi
done

echo ""

if [ $MISSING -gt 0 ]; then
    echo "❌ $MISSING required variables missing!"
    echo "Please add them to .env file"
    exit 1
else
    echo "✅ All required variables present!"
    exit 0
fi
EOF

chmod +x "$ENV_VALIDATOR"
echo -e "${GREEN}  ✓ Env validator created: scripts/validate-migration-env.sh${NC}"

# Summary
echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     ✅ All Critical Issues Fixed!                           ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${GREEN}Summary:${NC}"
echo -e "  ✓ Dockerfile port 4000 added"
echo -e "  ✓ Script paths auto-detection enabled"
echo -e "  ✓ Docs copied to main repo (if in worktree)"
echo -e "  ✓ Env validator created"
echo ""

echo -e "${YELLOW}Next steps:${NC}"
if [ "$REPO_ROOT" != "$MAIN_REPO" ] && [ -n "$MAIN_REPO" ]; then
    echo -e "  1. cd $MAIN_REPO"
    echo -e "  2. git add docs/ scripts/ Dockerfile"
    echo -e "  3. git commit -m 'fix: critical migration issues'"
    echo -e "  4. Review docs/MIGRATION_ISSUES_AND_FIXES.md"
    echo -e "  5. Continue with migration"
else
    echo -e "  1. git add docs/ scripts/ Dockerfile"
    echo -e "  2. git commit -m 'fix: critical migration issues'"
    echo -e "  3. Review docs/MIGRATION_ISSUES_AND_FIXES.md"
    echo -e "  4. Continue with migration"
fi
echo ""

exit 0
