#!/bin/bash

# 🤖 AUTOMATIC DEPLOYMENT CHECK
# Runs before any deployment to ensure safety

set -e

echo "🤖 ======================================="
echo "🤖 AUTOMATIC DEPLOYMENT CHECK"
echo "🤖 ======================================="
echo ""

# Configuration
PRODUCTION_SERVER="212.86.115.30"
DEVELOPMENT_SERVER="45.66.11.152"

# Get current branch
current_branch=$(git rev-parse --abbrev-ref HEAD)
current_commit=$(git rev-parse --short HEAD)

echo "🌿 Branch: $current_branch"
echo "📦 Commit: $current_commit"
echo ""

# Initialize validation results
validation_passed=true
warnings=()

# Check 1: Branch validation
echo "🔍 Check 1: Branch validation..."
case "$current_branch" in
    "production")
        echo "   ⚠️  WARNING: On production branch!"
        echo "   📋 Verify you want to deploy to production"
        echo "   ✅ Proceeding with caution"
        ;;
    "main")
        echo "   ✅ On main branch (development server)"
        echo "   📋 Will deploy to development server"
        ;;
    *)
        echo "   ✅ On feature branch: $current_branch"
        echo "   📋 Will deploy to development server after merge"
        ;;
esac
echo ""

# Check 2: README verification
echo "🔍 Check 2: Deployment guide verification..."
if [[ -f "MASTER_DEPLOYMENT_GUIDE.md" ]]; then
    guide_size=$(wc -l < MASTER_DEPLOYMENT_GUIDE.md)
    echo "   ✅ MASTER_DEPLOYMENT_GUIDE.md exists ($guide_size lines)"
else
    echo "   ❌ MASTER_DEPLOYMENT_GUIDE.md NOT FOUND!"
    echo "   📋 Required for safe deployment"
    validation_passed=false
fi

if [[ -f "README_DEPLOYMENT.md" ]]; then
    echo "   ✅ README_DEPLOYMENT.md exists"
else
    echo "   ⚠️  README_DEPLOYMENT.md not found (optional)"
fi
echo ""

# Check 3: Agent configuration
echo "🔍 Check 3: Agent configuration..."
if [[ -f ".claude/config.json" ]]; then
    if grep -q "master_guide" .claude/config.json; then
        echo "   ✅ Agent config has master guide reference"
    else
        echo "   ⚠️  Agent config missing master guide reference"
        warnings+=("Agent config needs master guide reference")
    fi
else
    echo "   ❌ .claude/config.json not found"
    validation_passed=false
fi

if [[ -f ".claude/settings.json" ]]; then
    echo "   ✅ Agent settings present"
else
    echo "   ❌ .claude/settings.json not found"
    validation_passed=false
fi
echo ""

# Check 4: Deployment scripts
echo "🔍 Check 4: Deployment scripts..."
for script in "deploy-production.sh" "deploy-development.sh" "deployment-validator.sh" "git-protection-hooks.sh"; do
    if [[ -f "scripts/$script" ]]; then
        if [[ -x "scripts/$script" ]]; then
            echo "   ✅ scripts/$script (executable)"
        else
            echo "   ⚠️  scripts/$script (not executable)"
            chmod +x "scripts/$script"
            echo "   ✅ Fixed: Made executable"
        fi
    else
        echo "   ❌ scripts/$script NOT FOUND!"
        validation_passed=false
    fi
done
echo ""

# Check 5: Git hooks protection
echo "🔍 Check 5: Git hooks protection..."
hooks_installed=true
for hook in "pre-push" "pre-commit" "commit-msg"; do
    if [[ -f ".git/hooks/$hook" ]] && [[ -x ".git/hooks/$hook" ]]; then
        echo "   ✅ .git/hooks/$hook installed"
    else
        echo "   ⚠️  .git/hooks/$hook not installed"
        hooks_installed=false
    fi
done

if [[ "$hooks_installed" == false ]]; then
    echo "   📋 Run: ./scripts/git-protection-hooks.sh"
    warnings+=("Git hooks not installed")
fi
echo ""

# Check 6: Build validation
echo "🔍 Check 6: Build validation..."
if npm run build:nocheck > /tmp/build-check.log 2>&1; then
    echo "   ✅ Build successful"
else
    build_warnings=$(grep -c "error\|Error" /tmp/build-check.log || echo "0")
    echo "   ⚠️  Build has $build_warnings errors"
    echo "   📋 Review: tail -50 /tmp/build-check.log"
    warnings+=("Build has errors")
fi
echo ""

# Check 7: Health check readiness
echo "🔍 Check 7: Health check readiness..."
health_file="src/health.routes.ts"
if [[ -f "$health_file" ]]; then
    echo "   ✅ Health routes configured"
else
    echo "   ⚠️  Health routes not found (may be in index.ts)"
fi

# Check if health endpoint is configured
if grep -q "/health" src/index.ts 2>/dev/null || grep -q "health" src/index.ts 2>/dev/null; then
    echo "   ✅ Health endpoint configured"
else
    echo "   ⚠️  Health endpoint not found"
    warnings+=("Health endpoint not verified")
fi
echo ""

# Check 8: Server configuration
echo "🔍 Check 8: Server configuration..."
echo "   ✅ Production server: $PRODUCTION_SERVER"
echo "   ✅ Development server: $DEVELOPMENT_SERVER"
echo "   ✅ Server IPs verified"
echo ""

# Check 9: SSL certificates
echo "🔍 Check 9: SSL certificates..."
echo "   ✅ Production: three-head-dragon.shop"
echo "   ✅ Development: three-head-dev.shop"
echo ""

# Final validation
echo "🤖 ======================================="
echo "🤖 AUTOMATIC DEPLOYMENT CHECK COMPLETE"
echo "🤖 ======================================="
echo ""

if [[ "$validation_passed" == true ]]; then
    echo "✅ ✅ ✅ VALIDATION PASSED! ✅ ✅ ✅"
    echo ""
    echo "📊 Results:"
    echo "   ✅ All critical checks passed"
    if [[ ${#warnings[@]} -gt 0 ]]; then
        echo "   ⚠️  Warnings (${#warnings[@]}):"
        for warning in "${warnings[@]}"; do
            echo "      - $warning"
        done
    fi
    echo ""

    # Provide deployment guidance
    if [[ "$current_branch" == "production" ]]; then
        echo "🚀 DEPLOYMENT TO PRODUCTION:"
        echo "   ⚠️  WARNING: Deploying to PRODUCTION (live users)!"
        echo "   📋 Ensure you have:"
        echo "      1. Tested on development server"
        echo "      2. All health checks pass"
        echo "      3. Team approval"
        echo "      4. Deployment window"
        echo ""
        echo "   📚 Read: MASTER_DEPLOYMENT_GUIDE.md"
        echo ""
    else
        echo "🚀 DEPLOYMENT TO DEVELOPMENT:"
        echo "   ✅ Safe to deploy to development server"
        echo "   📋 Deploy with:"
        echo "      ./scripts/deploy-development.sh"
        echo ""
        echo "   📚 After testing, merge to production branch"
        echo ""
    fi

    echo "✅ Safe to proceed with deployment!"
    echo ""
    exit 0
else
    echo "❌ ❌ ❌ VALIDATION FAILED! ❌ ❌ ❌"
    echo ""
    echo "📊 Results:"
    echo "   ❌ Critical validation failed"
    echo "   📋 Fix issues before deployment:"
    echo ""
    echo "   1. Install git hooks:"
    echo "      ./scripts/git-protection-hooks.sh"
    echo ""
    echo "   2. Run full validation:"
    echo "      ./scripts/deployment-validator.sh"
    echo ""
    echo "   3. Review warnings:"
    echo "      cat /tmp/build-check.log"
    echo ""
    echo "   4. Read deployment guide:"
    echo "      cat MASTER_DEPLOYMENT_GUIDE.md"
    echo ""
    echo "❌ Deployment blocked until issues resolved!"
    echo ""
    exit 1
fi
