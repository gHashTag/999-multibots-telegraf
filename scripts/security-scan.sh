#!/bin/bash

# 🔐 Скрипт для сканирования секретов в проекте
# Использование: ./scripts/security-scan.sh

# Exit on any error
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔍 SCANNING PROJECT FOR SECURITY ISSUES${NC}"
echo "==============================================="

# Flag to track found issues
ISSUES_FOUND=0

echo -e "\n${YELLOW}📁 Checking current files for secrets...${NC}"

# Secret patterns to search for
SECRET_PATTERNS=(
    "sk-[a-zA-Z0-9]{20,}"                      # OpenAI API keys
    "[0-9]{8,}:AA[a-zA-Z0-9_-]{35}"           # Telegram bot tokens
    "eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}" # JWT tokens
    "AKIA[A-Z0-9]{16}"                         # AWS Access Key
    "[a-zA-Z0-9]{40}"                          # GitHub tokens (40 chars)
    "REPLICATE_API_TOKEN=[a-zA-Z0-9]{40}"       # Replicate tokens
    "ghp_[a-zA-Z0-9]{36}"                      # GitHub personal tokens
    "mongodb://[^:]*:[^@]*@"                   # MongoDB connection strings
    "postgres://[^:]*:[^@]*@"                  # PostgreSQL connection strings
)

# Files to check
SCAN_FILES=(
    "src/**/*.ts"
    "src/**/*.js"
    "*.ts"
    "*.js"
    "*.json"
    "*.md"
    "docs/**/*.md"
    "scripts/**/*"
)

for pattern in "${SECRET_PATTERNS[@]}"; do
    echo "  Searching for pattern: $pattern"
    
    # Use find and grep to search for files
    found_files=$(find . -name "*.ts" -o -name "*.js" -o -name "*.json" -o -name "*.md" | \
                  grep -v node_modules | \
                  grep -v .git | \
                  grep -v dist | \
                  xargs grep -l "$pattern" 2>/dev/null || true)
    
    if [[ -n "$found_files" ]]; then
        echo -e "    ${RED}❌ POTENTIAL SECRETS FOUND:${NC}"
        echo "$found_files" | while IFS= read -r file; do
            echo -e "      🔴 $file"
            grep -n "$pattern" "$file" | head -3 | while IFS= read -r line; do
                echo -e "         ${RED}$line${NC}"
            done
        done
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
done

echo -e "\n${YELLOW}🔄 Checking git history for secrets...${NC}"

# List of compromised secrets (examples only)
COMPROMISED_SECRETS=(
    "sk-EXAMPLE_OPENAI_API_KEY_PLACEHOLDER"
    "1234567890:EXAMPLE_BOT_TOKEN_PLACEHOLDER_1"
    "0987654321:EXAMPLE_BOT_TOKEN_PLACEHOLDER_2" 
    "1111111111:EXAMPLE_BOT_TOKEN_PLACEHOLDER_3"
)

for secret in "${COMPROMISED_SECRETS[@]}"; do
    # Search git history
    if git log --all --grep="$secret" --oneline | head -1 | grep -q .; then
        echo -e "  ${RED}❌ COMPROMISED SECRET FOUND IN GIT:${NC}"
        echo -e "    🔴 $secret"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
    
    if git log --all -S "$secret" --oneline | head -1 | grep -q .; then
        echo -e "  ${RED}❌ COMPROMISED SECRET FOUND IN CODE:${NC}"
        echo -e "    🔴 $secret"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
done

echo -e "\n${YELLOW}📋 Checking .env files...${NC}"

# Check .env files
if [ -f ".env" ]; then
    echo -e "  ${RED}⚠️  .env file found - make sure it's in .gitignore${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Check .gitignore
if ! grep -q "^.env$" .gitignore 2>/dev/null; then
    echo -e "  ${RED}❌ .env NOT ADDED to .gitignore!${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

echo -e "\n${YELLOW}🔍 Checking example secrets...${NC}"

# Check that examples don't contain real keys
EXAMPLE_FILES=(".env.example" "README.md" "docs/*.md")
for pattern in "${SECRET_PATTERNS[@]}"; do
    for file_pattern in "${EXAMPLE_FILES[@]}"; do
        if ls $file_pattern >/dev/null 2>&1; then
            for file in $file_pattern; do
                if [ -f "$file" ] && grep -q "$pattern" "$file" 2>/dev/null; then
                    echo -e "  ${RED}❌ REAL KEY IN EXAMPLE FILE: $file${NC}"
                    ISSUES_FOUND=$((ISSUES_FOUND + 1))
                fi
            done
        fi
    done
done

echo -e "\n==============================================="

if [ $ISSUES_FOUND -eq 0 ]; then
    echo -e "${GREEN}✅ PROJECT SECURE - no secrets found!${NC}"
    exit 0
else
    echo -e "${RED}❌ FOUND $ISSUES_FOUND SECURITY ISSUES!${NC}"
    echo -e "${YELLOW}📝 RECOMMENDATIONS:${NC}"
    echo "  1. Replace all found secrets with examples"  
    echo "  2. Revoke real keys in corresponding services"
    echo "  3. Generate new keys"
    echo "  4. Update environment variables"
    echo "  5. Clean git history from secrets"
    echo ""
    echo -e "${RED}⚠️  NEVER COMMIT REAL SECRETS!${NC}"
    exit 1
fi
