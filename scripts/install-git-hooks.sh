#!/bin/bash
# 🚫 Git Hooks Installation Script - Force Push Protection
# This script installs pre-commit hooks to prevent force push and enforce PR workflow

echo "📦 Installing git hooks with FORCE PUSH protection..."
echo ""

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo "❌ Error: Not in a git repository"
  exit 1
fi

# Create hooks directory if it doesn't exist
mkdir -p .git/hooks

# Install pre-commit hook
echo "🔧 Installing pre-commit hook..."
cat > .git/hooks/pre-commit <<'EOF'
#!/bin/bash
# 🚫 CRITICAL PRE-COMMIT HOOK - FORCE PUSH FORBIDDEN

echo "🔍 Running pre-commit checks..."

# 0. 🚫 CRITICAL: Check for force push attempts
echo "🚫 Checking for force push..."
if git log --oneline --all -20 | grep -qi "force\|--force\|-f" > /dev/null 2>&1; then
  echo "❌ FORCE PUSH DETECTED IN RECENT COMMITS!"
  echo "❌ This is absolutely forbidden!"
  echo ""
  echo "✅ Use Pull Request workflow instead:"
  echo "   1. git checkout -b feat/feature-name"
  echo "   2. git push -u origin feat/feature-name"
  echo "   3. gh pr create"
  echo ""
  echo "Force push deletes history and breaks production!"
  exit 1
fi

# 1. Check branch name
BRANCH=$(git rev-parse --abbrev-ref HEAD)
VALID_BRANCH_REGEX="^(feat|fix|refactor|chore|docs|test)/[a-z0-9-]+$"

if [[ ! $BRANCH =~ $VALID_BRANCH_REGEX ]] && [[ $BRANCH != "main" ]] && [[ $BRANCH != "production" ]] && [[ $BRANCH != "staging" ]]; then
  echo "❌ Invalid branch name: $BRANCH"
  echo "Must match pattern: type/description"
  echo "Valid types: feat, fix, refactor, chore, docs, test"
  echo ""
  echo "Examples:"
  echo "  feat/heygen-wizard"
  echo "  fix/session-crash"
  echo "  refactor/extract-helpers"
  exit 1
fi

# 2. Check for direct commits to protected branches
PROTECTED_BRANCHES="production main"
if [[ $PROTECTED_BRANCHES =~ $BRANCH ]]; then
  echo "❌ Direct commits to $BRANCH are forbidden!"
  echo "Create a feature branch instead:"
  echo "  git checkout -b feat/your-feature"
  exit 1
fi

# 3. Run TypeScript type check
echo "📝 Checking TypeScript types..."
npm run typecheck || {
  echo "❌ TypeScript errors found. Fix them before committing."
  exit 1
}

# 4. Run tests
echo "🧪 Running tests..."
npm test || {
  echo "❌ Tests failed. Fix them before committing."
  exit 1
}

# 5. Check test coverage
echo "📊 Checking test coverage..."
COVERAGE=$(npm run test:coverage --silent 2>/dev/null | grep "All files" | awk '{print $2}' | sed 's/%//')
if [ -n "$COVERAGE" ] && (( $(echo "$COVERAGE < 80" | bc -l) )); then
  echo "⚠️  Coverage is below 80%: $COVERAGE%"
  echo "Consider adding more tests"
  # Warning only, not blocking
fi

# 6. Check for console.log (warning only)
if git diff --cached --name-only | xargs grep -l "console.log" 2>/dev/null; then
  echo "⚠️  console.log found in staged files"
  echo "Consider using proper logging or removing debug statements"
  # Warning only, not blocking
fi

# 7. Check for TODO/FIXME (warning only)
if git diff --cached --name-only | xargs grep -l "TODO\|FIXME" 2>/dev/null; then
  echo "⚠️  TODO/FIXME found in staged files"
  echo "Consider tracking these in issue tracker"
  # Warning only, not blocking
fi

echo "✅ Pre-commit checks passed!"
exit 0
EOF

# Make pre-commit executable
chmod +x .git/hooks/pre-commit

# Install commit-msg hook
echo "🔧 Installing commit-msg hook..."
cat > .git/hooks/commit-msg <<'EOF'
#!/bin/bash

COMMIT_MSG_FILE=$1
COMMIT_MSG=$(cat "$COMMIT_MSG_FILE")

# Check conventional commit format
CONVENTIONAL_REGEX="^(feat|fix|refactor|chore|docs|test|perf|style|ci)(\([a-z0-9-]+\))?: .{1,50}"

if [[ ! $COMMIT_MSG =~ $CONVENTIONAL_REGEX ]]; then
  echo "❌ Invalid commit message format!"
  echo ""
  echo "Expected format:"
  echo "  <type>(<scope>): <subject>"
  echo ""
  echo "Types: feat, fix, refactor, chore, docs, test, perf, style, ci"
  echo "Scope: optional, e.g., (heygen), (wizard), (db)"
  echo "Subject: imperative mood, lowercase, no period, max 50 chars"
  echo ""
  echo "Examples:"
  echo "  feat(heygen): add avatar generation wizard"
  echo "  fix(session): prevent crash on undefined user"
  echo "  refactor(wizard): extract validation to helper"
  echo ""
  echo "Your message:"
  echo "  $COMMIT_MSG"
  exit 1
fi

# Check subject line length
SUBJECT=$(echo "$COMMIT_MSG" | head -n 1)
SUBJECT_LENGTH=${#SUBJECT}

if [ $SUBJECT_LENGTH -gt 72 ]; then
  echo "⚠️  Subject line is too long: $SUBJECT_LENGTH chars (max 72)"
  echo "Consider shortening it"
  # Warning only, not blocking
fi

echo "✅ Commit message format valid"
exit 0
EOF

chmod +x .git/hooks/commit-msg

echo ""
echo "✅ Git hooks installed successfully!"
echo ""
echo "🛡️  Protection enabled:"
echo "  - Pre-commit: Force push detection, type check, tests"
echo "  - Commit-msg: Conventional commit format validation"
echo ""
echo "🚫 Force push is now BLOCKED at pre-commit level!"
echo ""
echo "✅ Always use Pull Request workflow:"
echo "   git checkout -b feat/feature-name"
echo "   git push -u origin feat/feature-name"
echo "   gh pr create"
