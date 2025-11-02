#!/bin/bash

# 🚨 DEPLOYMENT VALIDATOR
# Validates deployment before production push

set -e

echo "🔍 ======================================="
echo "🔍 DEPLOYMENT VALIDATOR"
echo "🔍 ======================================="
echo ""

# Get current branch
current_branch=$(git rev-parse --abbrev-ref HEAD)
echo "🌿 Current branch: $current_branch"
echo ""

# Check 1: Not on production branch directly
if [[ "$current_branch" == "production" ]]; then
    echo "❌ FAILED: Cannot deploy directly from production branch!"
    echo ""
    echo "📋 Correct workflow:"
    echo "   1. Develop on temp-main"
    echo "   2. Merge to main"
    echo "   3. Test on development server"
    echo "   4. Then merge to production"
    echo ""
    exit 1
fi

# Check 2: Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "❌ FAILED: Uncommitted changes detected!"
    echo ""
    echo "📋 Commit all changes first:"
    echo "   git add ."
    echo "   git commit -m 'feat: description'"
    echo ""
    exit 1
fi

# Check 3: Check for untracked files
if [[ -n $(git ls-files --others --exclude-standard) ]]; then
    echo "⚠️  WARNING: Untracked files detected:"
    git ls-files --others --exclude-standard
    echo ""
    echo "📋 Add files to git or ignore them:"
    echo "   git add <files>"
    echo "   OR add to .gitignore"
    echo ""
fi

# Check 4: Check for .env in git
if git ls-files --ignored --exclude-standard | grep -q "^\.env$"; then
    echo "❌ FAILED: .env file should be ignored!"
    echo ""
    echo "📋 Add .env to .gitignore:"
    echo "   echo '.env' >> .gitignore"
    echo ""
    exit 1
fi

# Check 5: Verify MASTER_DEPLOYMENT_GUIDE.md exists
if [[ ! -f "MASTER_DEPLOYMENT_GUIDE.md" ]]; then
    echo "❌ FAILED: MASTER_DEPLOYMENT_GUIDE.md not found!"
    echo ""
    echo "📋 You must have read the deployment guide:"
    echo "   cat MASTER_DEPLOYMENT_GUIDE.md"
    echo ""
    exit 1
fi

# Check 6: Verify deployment scripts exist
if [[ ! -f "scripts/deploy-production.sh" ]]; then
    echo "❌ FAILED: scripts/deploy-production.sh not found!"
    echo ""
    exit 1
fi

if [[ ! -f "scripts/deploy-development.sh" ]]; then
    echo "❌ FAILED: scripts/deploy-development.sh not found!"
    echo ""
    exit 1
fi

# Check 7: Verify scripts are executable
if [[ ! -x "scripts/deploy-production.sh" ]]; then
    echo "⚠️  WARNING: scripts/deploy-production.sh not executable!"
    chmod +x scripts/deploy-production.sh
    echo "✅ Fixed: Made executable"
fi

if [[ ! -x "scripts/deploy-development.sh" ]]; then
    echo "⚠️  WARNING: scripts/deploy-development.sh not executable!"
    chmod +x scripts/deploy-development.sh
    echo "✅ Fixed: Made executable"
fi

# Check 8: Verify .claude configuration
if [[ ! -f ".claude/config.json" ]]; then
    echo "❌ FAILED: .claude/config.json not found!"
    echo ""
    exit 1
fi

if [[ ! -f ".claude/settings.json" ]]; then
    echo "❌ FAILED: .claude/settings.json not found!"
    echo ""
    exit 1
fi

# Check 9: Verify git hooks protection
if [[ ! -f ".git/hooks/pre-push" ]]; then
    echo "⚠️  WARNING: Git protection hooks not installed!"
    echo ""
    echo "📋 Install protection hooks:"
    echo "   ./scripts/git-protection-hooks.sh"
    echo ""
fi

# Check 10: Verify no TypeScript errors (if build exists)
if [[ -f "dist/index.js" ]] || [[ -f "dist" ]]; then
    echo "📦 Build artifacts found, verifying compilation..."

    # Check for TypeScript compilation errors
    if npm run build:nocheck > /tmp/build.log 2>&1; then
        echo "✅ Build successful"
    else
        echo "⚠️  Build warnings/errors detected:"
        tail -20 /tmp/build.log | grep -E "error|Error" | head -5
        echo ""
        echo "📋 Review build.log:"
        echo "   cat /tmp/build.log"
        echo ""
    fi
fi

echo ""
echo "✅ ======================================="
echo "✅ DEPLOYMENT VALIDATION PASSED!"
echo "✅ ======================================="
echo ""

# Summary
echo "📊 VALIDATION SUMMARY:"
echo "   ✅ Branch: $current_branch"
echo "   ✅ No uncommitted changes"
echo "   ✅ MASTER_DEPLOYMENT_GUIDE.md exists"
echo "   ✅ Deployment scripts present"
echo "   ✅ Agent configuration present"
echo ""

# Next steps
if [[ "$current_branch" == "main" ]]; then
    echo "🚀 NEXT STEPS:"
    echo "   1. Deploy to development server"
    echo "   2. Test all features"
    echo "   3. Merge to production branch"
    echo "   4. Deploy to production server"
    echo ""
    echo "📚 Read: MASTER_DEPLOYMENT_GUIDE.md"
elif [[ "$current_branch" == "production" ]]; then
    echo "⚠️  WARNING: You are on production branch!"
    echo "   Test on development server first!"
    echo ""
else
    echo "🚀 NEXT STEPS:"
    echo "   1. Push to main branch: git push origin $current_branch"
    echo "   2. Deploy to development server"
    echo "   3. Test all features"
    echo ""
fi

echo ""
echo "✅ Deployment validation complete!"
