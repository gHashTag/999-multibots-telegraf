#!/bin/bash

# Exit on any error
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔒 Running pre-commit security checks..."

# Directory containing this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Project root directory
PROJECT_ROOT="$SCRIPT_DIR/.."

# Function to check for secrets in staged files
check_staged_files() {
    echo -e "\n${YELLOW}🔍 Checking staged files for secrets...${NC}"
    
    # Get list of staged files
    STAGED_FILES=$(git diff --cached --name-only)
    
    if [ -z "$STAGED_FILES" ]; then
        echo -e "${YELLOW}No files staged for commit${NC}"
        return 0
    fi
    
    # Patterns to search for
    PATTERNS=(
        "api[_-]key['\"]?\s*[:=]\s*['\"]\S+['\"]"
        "token['\"]?\s*[:=]\s*['\"]\S+['\"]"
        "password['\"]?\s*[:=]\s*['\"]\S+['\"]"
        "secret['\"]?\s*[:=]\s*['\"]\S+['\"]"
        "private[_-]key['\"]?\s*[:=]\s*['\"]\S+['\"]"
        "client[_-]secret['\"]?\s*[:=]\s*['\"]\S+['\"]"
        "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
    )
    
    # Initialize flag for found secrets
    SECRETS_FOUND=0
    
    # Check each staged file
    for FILE in $STAGED_FILES; do
        if [ -f "$FILE" ]; then
            echo -e "\nChecking file: $FILE"
            
            # Skip binary files
            if file "$FILE" | grep -q "binary"; then
                echo "Skipping binary file"
                continue
            fi
            
            # Check for each pattern
            for PATTERN in "${PATTERNS[@]}"; do
                if git diff --cached "$FILE" | grep -E "$PATTERN" > /dev/null; then
                    echo -e "${RED}❌ Potential secret found in $FILE: $PATTERN${NC}"
                    SECRETS_FOUND=1
                fi
            done
        fi
    done
    
    if [ $SECRETS_FOUND -eq 1 ]; then
        echo -e "\n${RED}❌ Secrets found in staged files. Commit aborted.${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ No secrets found in staged files${NC}"
}

# Function to check for large files
check_large_files() {
    echo -e "\n${YELLOW}🔍 Checking for large files...${NC}"
    
    # Maximum file size in bytes (5MB)
    MAX_SIZE=$((5 * 1024 * 1024))
    
    # Get list of staged files
    STAGED_FILES=$(git diff --cached --name-only)
    
    LARGE_FILES_FOUND=0
    
    for FILE in $STAGED_FILES; do
        if [ -f "$FILE" ]; then
            SIZE=$(stat -f %z "$FILE")
            if [ $SIZE -gt $MAX_SIZE ]; then
                echo -e "${RED}❌ Large file detected: $FILE ($(($SIZE / 1024 / 1024))MB)${NC}"
                LARGE_FILES_FOUND=1
            fi
        fi
    done
    
    if [ $LARGE_FILES_FOUND -eq 1 ]; then
        echo -e "\n${RED}❌ Large files found. Consider using Git LFS. Commit aborted.${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ No large files found${NC}"
}

# Function to check code style and linting
check_code_style() {
    echo -e "\n${YELLOW}🔍 Checking code style...${NC}"
    
    # Run ESLint if available
    if command -v eslint >/dev/null 2>&1; then
        if eslint .; then
            echo -e "${GREEN}✅ ESLint check passed${NC}"
        else
            echo -e "${RED}❌ ESLint check failed${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}⚠️ ESLint not found - skipping code style check${NC}"
    fi
}

# Function to check for debug code
check_debug_code() {
    echo -e "\n${YELLOW}🔍 Checking for debug code...${NC}"
    
    DEBUG_PATTERNS=(
        "console\\.log"
        "debugger"
        "TODO"
        "FIXME"
    )
    
    STAGED_FILES=$(git diff --cached --name-only)
    DEBUG_FOUND=0
    
    for FILE in $STAGED_FILES; do
        if [[ $FILE =~ \.(js|ts|tsx|jsx)$ ]]; then
            for PATTERN in "${DEBUG_PATTERNS[@]}"; do
                if git diff --cached "$FILE" | grep -E "$PATTERN" > /dev/null; then
                    echo -e "${YELLOW}⚠️ Debug code found in $FILE: $PATTERN${NC}"
                    DEBUG_FOUND=1
                fi
            done
        fi
    done
    
    if [ $DEBUG_FOUND -eq 1 ]; then
        echo -e "\n${YELLOW}⚠️ Debug code found. Consider removing before committing.${NC}"
    else
        echo -e "${GREEN}✅ No debug code found${NC}"
    fi
}

# Main execution
main() {
    echo "🚀 Running pre-commit checks at: $PROJECT_ROOT"
    
    check_staged_files
    check_large_files
    check_code_style
    check_debug_code
    
    echo -e "\n${GREEN}✅ All pre-commit checks passed${NC}"
}

main "$@"
