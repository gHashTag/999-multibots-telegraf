#!/bin/bash

# Exit on any error
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔒 Starting security scan..."

# Check if gitleaks is installed
if ! command -v gitleaks &> /dev/null; then
    echo -e "${RED}gitleaks not found. Please install it first:${NC}"
    echo "brew install gitleaks"
    exit 1
fi

# Directory containing this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Project root directory
PROJECT_ROOT="$SCRIPT_DIR/.."

# Function to check for secrets in files
check_for_secrets() {
    echo -e "\n${YELLOW}🔍 Checking for secrets in files...${NC}"
    
    # Run gitleaks
    if gitleaks detect --no-git; then
        echo -e "${GREEN}✅ No secrets found in files${NC}"
    else
        echo -e "${RED}❌ Secrets found in files!${NC}"
        exit 1
    fi
}

# Function to check for known vulnerabilities
check_vulnerabilities() {
    echo -e "\n${YELLOW}🔍 Checking for known vulnerabilities...${NC}"
    
    # Using npm audit
    if npm audit --omit=dev; then
        echo -e "${GREEN}✅ No known vulnerabilities${NC}"
    else
        echo -e "${RED}❌ Vulnerabilities found!${NC}"
        echo -e "${YELLOW}ℹ️ Run 'npm audit fix' to attempt to fix these issues${NC}"
    fi
}

# Function to check security headers
check_security_headers() {
    echo -e "\n${YELLOW}🔍 Checking security headers in API server...${NC}"
    
    # Check if the file exists
    if [ -f "$PROJECT_ROOT/src/api_server/index.ts" ]; then
        # Check for important security headers
        MISSING_HEADERS=""
        
        if ! grep -q "X-Content-Type-Options" "$PROJECT_ROOT/src/api_server/index.ts"; then
            MISSING_HEADERS="$MISSING_HEADERS\n- X-Content-Type-Options"
        fi
        
        if ! grep -q "X-Frame-Options" "$PROJECT_ROOT/src/api_server/index.ts"; then
            MISSING_HEADERS="$MISSING_HEADERS\n- X-Frame-Options"
        fi
        
        if ! grep -q "Content-Security-Policy" "$PROJECT_ROOT/src/api_server/index.ts"; then
            MISSING_HEADERS="$MISSING_HEADERS\n- Content-Security-Policy"
        fi
        
        if [ -n "$MISSING_HEADERS" ]; then
            echo -e "${RED}❌ Missing security headers:${NC}$MISSING_HEADERS"
        else
            echo -e "${GREEN}✅ All required security headers are present${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️ API server file not found${NC}"
    fi
}

# Function to validate environment variables
validate_env_vars() {
    echo -e "\n${YELLOW}🔍 Validating environment variables...${NC}"
    
    # Check .env.example exists
    if [ ! -f "$PROJECT_ROOT/.env.example" ]; then
        echo -e "${RED}❌ .env.example file not found!${NC}"
        return 1
    fi
    
    # Check for sensitive patterns in example file
    if grep -Ei "(password|secret|key|token)" "$PROJECT_ROOT/.env.example" | grep -v "^#" > /dev/null; then
        echo -e "${YELLOW}⚠️ Warning: Sensitive patterns found in .env.example${NC}"
    else
        echo -e "${GREEN}✅ No sensitive patterns in .env.example${NC}"
    fi
}

# Function to check package.json security
check_package_json() {
    echo -e "\n${YELLOW}🔍 Checking package.json security...${NC}"
    
    if [ ! -f "$PROJECT_ROOT/package.json" ]; then
        echo -e "${RED}❌ package.json not found!${NC}"
        return 1
    fi
    
    # Checking package.json for security issues
    ISSUES=""
    
    # Check scripts section for potential issues
    if grep -q "\"scripts\":" "$PROJECT_ROOT/package.json"; then
        if grep -q "\"preinstall\":" "$PROJECT_ROOT/package.json"; then
            ISSUES="$ISSUES\n- preinstall script found (potential security risk)"
        fi
    fi
    
    # Check for unsafe dependencies
    if grep -q "\"dependencies\":" "$PROJECT_ROOT/package.json"; then
        UNSAFE_DEPS=$(node -e "const pkg=require('./package.json'); console.log(Object.keys(pkg.dependencies || {}).filter(d => d.startsWith('unsafe-')).join('\n'));")
        if [ -n "$UNSAFE_DEPS" ]; then
            ISSUES="$ISSUES\n- Unsafe dependencies found: $UNSAFE_DEPS"
        fi
    fi
    
    if [ -n "$ISSUES" ]; then
        echo -e "${RED}❌ Security issues found in package.json:${NC}$ISSUES"
    else
        echo -e "${GREEN}✅ No security issues found in package.json${NC}"
    fi
}

# Function to check git hooks
check_git_hooks() {
    echo -e "\n${YELLOW}🔍 Checking git hooks...${NC}"
    
    # Check if .git/hooks exists
    if [ ! -d "$PROJECT_ROOT/.git/hooks" ]; then
        echo -e "${YELLOW}⚠️ .git/hooks directory not found${NC}"
        return 1
    fi
    
    # Check for pre-commit hook
    if [ -x "$PROJECT_ROOT/.git/hooks/pre-commit" ]; then
        echo -e "${GREEN}✅ pre-commit hook is installed and executable${NC}"
    else
        echo -e "${RED}❌ pre-commit hook is missing or not executable${NC}"
    fi
}

# Main execution
main() {
    echo "🚀 Starting security scan for project at: $PROJECT_ROOT"
    
    check_for_secrets
    check_vulnerabilities
    check_security_headers
    validate_env_vars
    check_package_json
    check_git_hooks
    
    echo -e "\n${GREEN}✅ Security scan completed${NC}"
}

main "$@"
