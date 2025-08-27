#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔍 Running pre-commit security checks...${NC}"

# List of patterns to check
PATTERNS=(
    "api[_-]key[=\"'][\w\-]{16,}"
    "sk-[\w\-]{32,}"
    "ghp_[\w\-]{36,}"
    "bot[0-9]+:[A-Za-z0-9_-]{34,}"
    "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
    "-----BEGIN[ ]PRIVATE KEY-----"
    "-----BEGIN[ ]RSA PRIVATE KEY-----"
    "AKIA[0-9A-Z]{16}"
)

# Files to exclude from checking
EXCLUDED_FILES=(
    ".env.example"
    "*.test.ts"
    "*.spec.ts"
    "*.md"
    "package-lock.json"
    "yarn.lock"
    "pnpm-lock.yaml"
)

# Create exclude pattern for git diff
exclude_pattern=$(printf "|%s" "${EXCLUDED_FILES[@]}")
exclude_pattern=${exclude_pattern:1}

# Get staged files
staged_files=$(git diff --cached --name-only --diff-filter=ACM | grep -Ev "^(${exclude_pattern})$")

if [ -z "$staged_files" ]; then
    echo -e "${GREEN}✓ No relevant files to check${NC}"
    exit 0
fi

found_secrets=false

for file in $staged_files; do
    for pattern in "${PATTERNS[@]}"; do
        if git diff --cached "$file" | grep -E "$pattern" > /dev/null; then
            if [ "$found_secrets" = false ]; then
                echo -e "${RED}❌ Found potential secrets in:${NC}"
                found_secrets=true
            fi
            echo -e "${RED}→ $file${NC}"
        fi
    done
done

if [ "$found_secrets" = true ]; then
    echo -e "${RED}❌ Commit blocked: Found potential secrets in staged files${NC}"
    echo -e "${YELLOW}Please remove secrets and try committing again${NC}"
    echo -e "${YELLOW}Consider using environment variables instead${NC}"
    exit 1
fi

echo -e "${GREEN}✓ No secrets found in staged files${NC}"
exit 0
