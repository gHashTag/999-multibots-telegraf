#!/bin/bash
# 🛡️ Git Force Push Protection Configuration
# Sets up git config to prevent force push on protected branches

echo "🛡️  Setting up git force push protection..."
echo ""

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo "❌ Error: Not in a git repository"
  exit 1
fi

# Protect main branch from force push
echo "🔒 Protecting 'main' branch from force push..."
git config --local core.protectNTFS true
git config --local receive.denyNonFastForwards true

# Protect production branch if it exists
if git show-ref --verify --quiet refs/heads/production; then
  echo "🔒 Protecting 'production' branch from force push..."
  git config --local receive.denyDeletes true
fi

# Set up push policy
echo "📤 Setting up push policy..."
git config --local push.default simple

# Configure merge strategy
echo "🔀 Configuring merge strategy..."
git config --local merge.commit no
git config --local merge.log true

# Add pre-push hook to check for force push
echo "🔧 Adding pre-push hook..."
cat > .git/hooks/pre-push <<'EOF'
#!/bin/bash
# 🚫 PRE-PUSH HOOK - BLOCK FORCE PUSH

remote="$1"
url="$2"

echo "🔍 Checking push for force push..."

# Read from stdin and check for force flags
while read local_ref local_sha remote_ref remote_sha; do
  if [[ "$local_sha" != "0000000000000000000000000000000000000000" ]] && [[ "$remote_sha" != "0000000000000000000000000000000000000000" ]]; then
    # Check if we're trying to force push
    base=$(git merge-base $local_sha $remote_sha)
    if [[ $base != $remote_sha ]]; then
      echo "❌ Force push detected!"
      echo "❌ Force push is absolutely forbidden!"
      echo ""
      echo "✅ Use Pull Request workflow instead:"
      echo "   git checkout -b feat/feature-name"
      echo "   git push -u origin feat/feature-name"
      echo "   gh pr create"
      echo ""
      echo "Force push deletes history and breaks production!"
      exit 1
    fi
  fi
done

exit 0
EOF

chmod +x .git/hooks/pre-push

echo ""
echo "✅ Git protection configured successfully!"
echo ""
echo "🛡️  Protection measures enabled:"
echo "  - receive.denyNonFastForwards: true"
echo "  - receive.denyDeletes: true (for production)"
echo "  - pre-push hook: Blocks force push attempts"
echo "  - core.protectNTFS: true"
echo ""
echo "🚫 Force push is now BLOCKED at git level!"
echo ""
echo "✅ Always use Pull Request workflow:"
echo "   git checkout -b feat/feature-name"
echo "   git push -u origin feat/feature-name"
echo "   gh pr create"
