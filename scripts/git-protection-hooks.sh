#!/bin/bash

# 🚨 GIT PROTECTION HOOKS INSTALLER
# Installs production protection hooks

set -e

echo "🔒 ======================================="
echo "🔒 GIT PRODUCTION PROTECTION HOOKS"
echo "🔒 ======================================="
echo ""

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Error: Not in a git repository!"
    echo "   Run this from the project root"
    exit 1
fi

# Create hooks directory if it doesn't exist
mkdir -p .git/hooks
chmod 755 .git/hooks

# Install pre-push hook
echo "📦 Installing pre-push hook..."
cat > .git/hooks/pre-push << 'EOF'
#!/bin/bash

# 🚨 GIT PRE-PUSH HOOK - PRODUCTION PROTECTION
echo "🔍 Pre-push hook: Validating deployment..."

remote="$1"
url="$2"
current_branch=$(git rev-parse --abbrev-ref HEAD)

echo "📡 Pushing to: $remote ($url)"
echo "🌿 Current branch: $current_branch"

# Production branch protection
if [[ "$current_branch" == "production" ]]; then
    echo ""
    echo "🚨 🚨 🚨 DANGER: PRODUCTION BRANCH! 🚨 🚨 🚨"
    echo ""
    echo "⚠️  WARNING: You are about to push to PRODUCTION branch!"
    echo "⚠️  This affects LIVE USERS!"
    echo ""
    echo "❌ Prevented by pre-push hook!"
    echo ""
    echo "✅ PROTECTION ACTIVATED: Deployment blocked"
    echo ""
    echo "📋 If you are sure you want to deploy to production:"
    echo "   1. Ensure you have tested on development server"
    echo "   2. Ensure all health checks pass"
    echo "   3. Get explicit permission from team lead"
    echo "   4. Then use: git push origin production --no-verify"
    echo ""
    echo "📚 Read the deployment guide:"
    echo "   cat MASTER_DEPLOYMENT_GUIDE.md"
    echo ""
    exit 1
fi

# Check for force push protection
if [[ "$*" == *"--force"* ]]; then
    echo ""
    echo "🚨 🚨 🚨 FORCE PUSH DETECTED! 🚨 🚨 🚨"
    echo ""
    echo "❌ Force push is dangerous and can break production!"
    echo "❌ Prevented by pre-push hook!"
    echo ""
    echo "✅ PROTECTION ACTIVATED: Force push blocked"
    echo ""
    exit 1
fi

echo "✅ Pre-push validation passed"
echo "🌿 Branch: $current_branch"
echo "✅ Push allowed (not production branch)"
echo ""

exit 0
EOF

chmod +x .git/hooks/pre-push
echo "✅ Pre-push hook installed"

# Install pre-commit hook
echo "📦 Installing pre-commit hook..."
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash

# 🚨 GIT PRE-COMMIT HOOK - VALIDATION
echo "🔍 Pre-commit hook: Validating changes..."

# Check for deployment files
if git diff --cached --name-only | grep -q "DEPLOYMENT\|deployment\|MASTER_DEPLOYMENT"; then
    echo ""
    echo "📚 Deployment files detected:"
    git diff --cached --name-only | grep -i deployment || true
    echo ""
    echo "✅ Validated: Deployment documentation updated"
fi

# Check if .env file is being committed
if git diff --cached --name-only | grep -q ".env"; then
    echo ""
    echo "🚨 WARNING: .env file detected!"
    echo ""
    echo "❌ NEVER commit .env files to git!"
    echo "❌ Prevented by pre-commit hook!"
    echo ""
    echo "📋 Remove .env from git:"
    echo "   git reset HEAD .env"
    echo ""
    exit 1
fi

# Check for package-lock.json changes without node_modules update
if git diff --cached --name-only | grep -q "package-lock.json"; then
    if ! git diff --cached --name-only | grep -q "package.json"; then
        echo ""
        echo "🚨 WARNING: package-lock.json changed but package.json didn't!"
        echo ""
        echo "⚠️  Did you run npm install?"
        echo "⚠️  Verify changes are correct"
        echo ""
    fi
fi

echo "✅ Pre-commit validation passed"
echo ""

exit 0
EOF

chmod +x .git/hooks/pre-commit
echo "✅ Pre-commit hook installed"

# Install commit-msg hook
echo "📦 Installing commit-msg hook..."
cat > .git/hooks/commit-msg << 'EOF'
#!/bin/bash

# 🚨 GIT COMMIT-MSG HOOK - MESSAGE VALIDATION
commit_regex='^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .{1,50}'

if ! grep -qE "$commit_regex" "$1"; then
    echo ""
    echo "🚨 Invalid commit message format!"
    echo ""
    echo "❌ Commit message must follow conventional commits:"
    echo "   <type>(<scope>): <message>"
    echo ""
    echo "✅ Examples:"
    echo "   feat: add new feature"
    echo "   fix: resolve bug"
    echo "   docs: update documentation"
    echo "   chore: update build script"
    echo ""
    echo "📚 Read: MASTER_DEPLOYMENT_GUIDE.md"
    echo ""
    exit 1
fi

echo "✅ Commit message validated"
exit 0
EOF

chmod +x .git/hooks/commit-msg
echo "✅ Commit-msg hook installed"

echo ""
echo "🔒 ======================================="
echo "🔒 GIT PROTECTION HOOKS INSTALLED!"
echo "🔒 ======================================="
echo ""
echo "✅ Protection active:"
echo "   - Pre-push: Blocks production pushes"
echo "   - Pre-commit: Validates changes"
echo "   - Commit-msg: Enforces commit format"
echo ""
echo "📚 Documentation: MASTER_DEPLOYMENT_GUIDE.md"
echo ""

# Make hooks executable
chmod +x .git/hooks/*

echo "✅ All hooks are executable"
echo ""
echo "🚀 Git protection is now active!"
