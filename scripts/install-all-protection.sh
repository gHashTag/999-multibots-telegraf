#!/bin/bash

# 🚨 INSTALL ALL PROTECTION
# Installs all protection mechanisms for safe deployment

set -e

echo "🚨 ======================================="
echo "🚨 INSTALL ALL PROTECTION MECHANISMS"
echo "🚨 ======================================="
echo ""

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Error: Not in a git repository!"
    echo "   Run this from the project root"
    exit 1
fi

# Check required files
echo "🔍 Checking required files..."

required_files=(
    "MASTER_DEPLOYMENT_GUIDE.md"
    "README_DEPLOYMENT.md"
    "DEPLOYMENT_COMMANDS.md"
    ".claude/config.json"
    ".claude/settings.json"
)

missing_files=()
for file in "${required_files[@]}"; do
    if [[ ! -f "$file" ]]; then
        missing_files+=("$file")
    fi
done

if [[ ${#missing_files[@]} -gt 0 ]]; then
    echo "❌ Missing required files:"
    for file in "${missing_files[@]}"; do
        echo "   - $file"
    done
    exit 1
fi

echo "✅ All required files present"
echo ""

# Install git hooks
echo "🔧 Installing git protection hooks..."
./scripts/git-protection-hooks.sh
echo ""

# Make scripts executable
echo "🔧 Making scripts executable..."
chmod +x scripts/*.sh
echo "✅ Scripts are executable"
echo ""

# Check Makefile
echo "🔧 Checking Makefile..."
if [[ -f "MAKEFILE" ]]; then
    echo "✅ Makefile present"
else
    echo "❌ Makefile not found!"
    exit 1
fi
echo ""

# Validate configuration
echo "🔧 Validating configuration..."
if grep -q "master_guide" .claude/config.json; then
    echo "✅ Agent config has master guide reference"
else
    echo "❌ Agent config missing master guide reference!"
    exit 1
fi

if grep -q "protection_mechanisms" .claude/config.json; then
    echo "✅ Protection mechanisms configured"
else
    echo "⚠️  Protection mechanisms not found in config"
fi
echo ""

# Run validation
echo "🔍 Running validation checks..."
./scripts/auto-deployment-check.sh
echo ""

# Summary
echo "🚨 ======================================="
echo "🚨 PROTECTION INSTALLATION COMPLETE!"
echo "🚨 ======================================="
echo ""

echo "✅ Protection Layers Active:"
echo "   1. ✅ Git hooks (pre-push, pre-commit, commit-msg)"
echo "   2. ✅ Agent permissions (blocked commands)"
echo "   3. ✅ Validation scripts (auto checks)"
echo "   4. ✅ Makefile commands (safe interface)"
echo "   5. ✅ Documentation (education)"
echo ""

echo "📋 Available Commands:"
echo "   make check-all      - Validate everything"
echo "   make install-hooks  - Reinstall git hooks"
echo "   make deploy-dev     - Deploy to development"
echo "   make deploy-prod    - Deploy to production (with warnings)"
echo "   make health-dev     - Check development bots"
echo "   make health-prod    - Check production bots"
echo "   make guide          - Read deployment guide"
echo "   make help           - Show all commands"
echo ""

echo "📚 Documentation:"
echo "   cat MASTER_DEPLOYMENT_GUIDE.md   - Complete guide"
echo "   cat DEPLOYMENT_COMMANDS.md       - Quick commands"
echo "   cat README_DEPLOYMENT.md         - Navigation"
echo ""

echo "🌐 Servers:"
echo "   Development: 45.66.11.152 (2 bots)"
echo "   Production:  212.86.115.30 (10 bots)"
echo ""

echo "🚀 SYSTEM FULLY PROTECTED!"
echo ""
echo "⚠️  REMEMBER:"
echo "   - ALWAYS run: make check-all"
echo "   - ALWAYS test on development first"
echo "   - ALWAYS read: MASTER_DEPLOYMENT_GUIDE.md"
echo ""

echo "✅ Protection installation complete!"
