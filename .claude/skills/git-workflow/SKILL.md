---
name: git-workflow
description: Git workflow patterns with branch strategy enforcement (feat/, fix/, refactor/, chore/), commit conventions, and automated quality checks. Prevents direct commits to production, enforces conventional commits, and maintains clean git history. Use for all git operations and branch management.
---

# 🌳 Git Workflow - Branch Strategy & Commit Discipline

**Sanskrit Wisdom**: 🕉️ _"क्रमशः सर्वं सिद्ध्यति"_ (Kramashah Sarvam Siddhyati) - "Всё достигается постепенно, шаг за шагом"

**Философия**: "Clean git history = clear project evolution. Chaos in git = chaos in project."

## 🎯 Core Knowledge

Этот Skill обеспечивает дисциплину Git workflow:

- 🌿 Branch naming strategy (feat/, fix/, refactor/, chore/)
- 📝 Conventional Commits format
- 🚫 Protection от прямых коммитов в production/main
- ✅ Pre-commit quality checks
- 🔄 Automated PR workflow
- 📊 Clean git history maintenance

## 🌿 Branch Strategy

### Branch Types and Naming Convention

```yaml
feat/: New features
  Examples:
    - feat/heygen-wizard
    - feat/chatgpt-integration
    - feat/payment-webhook

  Use when:
    - Adding new functionality
    - Creating new scenes
    - Integrating new AI providers

fix/: Bug fixes
  Examples:
    - fix/telegram-session-crash
    - fix/heygen-cover-error
    - fix/payment-double-charge

  Use when:
    - Fixing production bugs
    - Resolving errors
    - Patching security issues

refactor/: Code improvements (no functionality change)
  Examples:
    - refactor/extract-validation-helper
    - refactor/simplify-wizard-state
    - refactor/reduce-complexity

  Use when:
    - Improving code structure
    - Reducing duplication
    - Optimizing performance

chore/: Maintenance tasks
  Examples:
    - chore/update-dependencies
    - chore/add-docker-compose
    - chore/setup-ci-pipeline

  Use when:
    - Updating dependencies
    - Adding tooling
    - Documentation updates

docs/: Documentation only
  Examples:
    - docs/add-api-documentation
    - docs/update-readme

test/: Test additions/improvements
  Examples:
    - test/add-heygen-integration-tests
    - test/improve-wizard-coverage
```

### Branch Creation Pattern

```bash
# ✅ ПРАВИЛЬНО - с префиксом типа
git checkout -b feat/heygen-wizard
git checkout -b fix/session-crash
git checkout -b refactor/extract-helpers

# ❌ НЕПРАВИЛЬНО - без префикса
git checkout -b heygen-wizard
git checkout -b session-crash-fix
git checkout -b helpers
```

### Protected Branches

```yaml
production:
  - Main production branch
  - Deploy target for production server
  - Direct commits: ❌ FORBIDDEN
  - Only merge via: Pull Requests with approvals
  - Required checks: Tests pass, coverage >80%, type check

main:
  - Development main branch
  - Direct commits: ❌ FORBIDDEN
  - Merge from: feat/, fix/, refactor/ branches
  - Required checks: Tests pass, type check

staging:
  - Pre-production testing
  - Direct commits: ⚠️ Allowed only for hotfixes
  - Merge from: main or hotfix branches
```

## 📝 Conventional Commits

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

```yaml
feat: New feature
  Example: "feat(heygen): Add avatar generation wizard"

fix: Bug fix
  Example: "fix(session): Prevent crash on undefined user"

refactor: Code improvement
  Example: "refactor(wizard): Extract validation to helper"

chore: Maintenance
  Example: "chore(deps): Update telegraf to 4.16.3"

docs: Documentation
  Example: "docs(api): Add HeyGen integration guide"

test: Tests
  Example: "test(wizard): Add unit tests for HeyGenClient"

perf: Performance improvement
  Example: "perf(db): Add index on user_id for faster queries"

style: Code style (formatting, no logic change)
  Example: "style(wizard): Fix linting errors"

ci: CI/CD changes
  Example: "ci(github): Add automated deployment workflow"
```

### Scope (Optional but Recommended)

```yaml
Scopes по компонентам:
  - heygen, sora, fal (AI providers)
  - wizard, scene (UI components)
  - db, supabase (Database)
  - inngest (Background jobs)
  - docker, deploy (Infrastructure)
  - test (Testing)

Examples:
  feat(sora): Add video generation with Sora 2
  fix(db): Correct user balance update query
  refactor(wizard): Simplify state management
  chore(docker): Optimize Dockerfile
```

### Subject Rules

```yaml
Rules:
  - Use imperative mood ("Add" not "Added" or "Adds")
  - Don't capitalize first letter
  - No period at the end
  - Keep under 50 characters
  - Be specific and clear

✅ Good Examples:
  - "add HeyGen avatar generation"
  - "fix session initialization error"
  - "refactor wizard state management"

❌ Bad Examples:
  - "Added new feature" (past tense)
  - "Fix bugs" (too vague)
  - "Update code." (period at end)
  - "Fixed the issue where users couldn't generate videos because..." (too long)
```

### Body (Optional but Recommended for Complex Changes)

```yaml
When to add body:
  - Changes affect multiple files
  - Non-obvious implementation
  - Breaking changes
  - Multiple related changes

Format:
  - Wrap at 72 characters
  - Explain WHAT and WHY, not HOW
  - Use bullet points for multiple items

Example:
  feat(heygen): Add avatar generation wizard

  Implement complete wizard for HeyGen avatar generation:
  - Add wizard state management
  - Integrate with HeyGen API client
  - Add Inngest function for async processing
  - Store results in Supabase assets table

  This enables users to create talking avatar videos
  with custom text and voice selection.
```

### Footer (For Special Cases)

```yaml
Breaking Changes:
  BREAKING CHANGE: Description of breaking change

  Example:
    refactor(api): Change webhook response format

    BREAKING CHANGE: Webhook now returns { success, data }
    instead of { status, result }. Update all webhook handlers.

Issue References:
  Fixes #123
  Closes #456
  Resolves #789

  Example:
    fix(session): Prevent crash on undefined user

    Fixes #234
```

## 🚫 CRITICAL: FORCE PUSH ABSOLUTELY FORBIDDEN

### ⚠️ STRICT PROHIBITION - NO EXCEPTIONS

```yaml
FIRM BAN ON FORCE PUSH:
  - git push --force         ❌ FORBIDDEN
  - git push -f              ❌ FORBIDDEN
  - git push --force-with-lease ❌ FORBIDDEN
  - git push origin --force  ❌ FORBIDDEN
  - git push --delete --force ❌ FORBIDDEN
  - ANY use of -f flag       ❌ FORBIDDEN
```

### 🎯 CONSEQUENCES OF FORCE PUSH

```yaml
CATASTROPHIC CONSEQUENCES:
  - DELETES commit history permanently
  - OVERWRITES other developers' work
  - MAKES rollback impossible
  - BREAKS production systems
  - LOSES team trust forever

REAL CASE (2025-01-11):
  Agent executed: git push --force
  Result:
    - Deleted 50+ commits
    - Lost 200+ command files
    - Production was broken
    - Had to restore from old commits
```

### ✅ CORRECT WORKFLOW (ONLY ACCEPTABLE METHOD)

```bash
# 1. Create branch
git checkout -b feat/my-feature

# 2. Make changes
git add .
git commit -m "feat(component): add new feature"

# 3. Push WITHOUT force
git push -u origin feat/my-feature

# 4. Create Pull Request
gh pr create --title "feat(component): add new feature" \
  --body "$(cat <<'EOF'
## Summary
- Add new feature
- Include tests
- Update documentation

## Testing
- [x] Tests pass
- [x] Type check passes
- [x] Coverage >80%
EOF
)"

# 5. Wait for review and approval
# 6. Merge via PR (NEVER force push!)
```

### 🚨 ONLY CASE WHERE HISTORY REWRITE IS ACCEPTABLE

```yaml
EXTREMELY RARE EXCEPTION:
  Scope: Personal feature branch only
  Timing: BEFORE first push to remote
  Method: Use interactive rebase, NOT force push

✅ CORRECT approach:
  git checkout -b feat/my-feature
  # Make commits
  git rebase -i HEAD~3  # Clean up commits
  git push -u origin feat/my-feature  # Normal push

❌ WRONG approach:
  git checkout -b feat/my-feature
  # Make commits
  git push origin feat/my-feature
  # Oops, need to rewrite history
  git rebase -i HEAD~3
  git push --force  # ❌ CATASTROPHIC ERROR!
```

### 🔒 PRE-COMMIT HOOK CHECK

Add this check to `.git/hooks/pre-commit`:

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Check for force push in git command history
if git log --oneline --all -20 | grep -i "force\|--force\|-f" > /dev/null; then
  echo "❌ FORCE PUSH DETECTED IN RECENT COMMITS!"
  echo "This is absolutely forbidden!"
  echo "Always use Pull Requests instead"
  exit 1
fi

# Check if user is trying to force push
if git push --dry-run --force 2>&1 | grep -q "Everything up-to-date"; then
  echo "❌ FORCE PUSH ATTEMPT DETECTED!"
  echo "Use: git push origin branch-name (WITHOUT --force)"
  exit 1
fi
```

### 💡 SAFE ALTERNATIVES TO FORCE PUSH

```yaml
Need to rewrite history?
  ✅ Use: git rebase -i HEAD~N
  ✅ Use: git commit --amend (for last commit)
  ✅ Use: git cherry-pick for specific commits
  ✅ Create new branch with correct history

Need to update PR?
  ✅ Push normally: git push origin branch-name
  ✅ GitHub automatically updates PR

Need to override remote?
  ❌ NEVER use: git push --force
  ✅ Create new branch: git checkout -b feat/updated-feature
  ✅ OR: ask team for permission first
```

### 🎭 RULE FOR CLAUDE AGENTS

```yaml
ABSOLUTE COMMANDS:
  1. NEVER type "git push --force" in ANY context
  2. NEVER type "git push -f" in ANY context
  3. NEVER suggest force push as solution
  4. ALWAYS recommend PR workflow
  5. ALWAYS use normal push: git push origin branch-name

CORRECT RESPONSE when asked about force push:
  "❌ Force push is absolutely forbidden!

   Always use Pull Request workflow:
   1. Create branch: git checkout -b feat/feature-name
   2. Push normally: git push -u origin feat/feature-name
   3. Create PR: gh pr create
   4. Wait for review and merge

   Force push deletes history and breaks production!
   This is a zero-tolerance rule."
```

---

## 🚫 Pre-Commit Checks

### Git Hooks Setup

```bash
#!/bin/bash
# .git/hooks/pre-commit

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
```

### Commit Message Validation Hook

```bash
#!/bin/bash
# .git/hooks/commit-msg

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
```

### Installation Script

```bash
#!/bin/bash
# scripts/install-git-hooks.sh

echo "📦 Installing git hooks..."

# Copy hooks
cp scripts/git-hooks/pre-commit .git/hooks/pre-commit
cp scripts/git-hooks/commit-msg .git/hooks/commit-msg

# Make executable
chmod +x .git/hooks/pre-commit
chmod +x .git/hooks/commit-msg

echo "✅ Git hooks installed successfully!"
echo ""
echo "Hooks installed:"
echo "  - pre-commit: Type check, tests, coverage"
echo "  - commit-msg: Conventional commit format validation"
```

## 🔄 Workflow Patterns

### Pattern 1: Feature Development

```bash
# 1. Create feature branch from main
git checkout main
git pull origin main
git checkout -b feat/heygen-wizard

# 2. Develop with TDD (RED-GREEN-REFACTOR)
# ... write tests, implement, refactor ...

# 3. Commit frequently with conventional commits
git add src/scenes/heygenWizard/
git commit -m "feat(heygen): add wizard state interface"

git add src/services/heygen/
git commit -m "feat(heygen): implement API client"

git add src/inngest/functions/
git commit -m "feat(heygen): add async generation function"

# 4. Push to remote
git push -u origin feat/heygen-wizard

# 5. Create PR
gh pr create --title "feat(heygen): Add avatar generation wizard" \
  --body "$(cat <<'EOF'
## Summary
- Add HeyGen wizard for avatar generation
- Integrate with HeyGen API
- Async processing via Inngest
- Store results in Supabase

## Testing
- ✅ Unit tests for HeyGenClient
- ✅ Integration tests for wizard
- ✅ E2E tests in Docker environment
- ✅ Coverage: 92%

## Checklist
- [x] Tests pass
- [x] Type check passes
- [x] Coverage >80%
- [x] Documentation updated

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

# 6. After approval, merge (squash or merge commit)
# ... PR merged by reviewer or CI/CD ...

# 7. Cleanup
git checkout main
git pull origin main
git branch -d feat/heygen-wizard
```

### Pattern 2: Hotfix (Production Bug)

```bash
# 1. Create fix branch from production
git checkout production
git pull origin production
git checkout -b fix/session-crash

# 2. Fix the bug (test first if possible)
# ... write test, fix bug ...

# 3. Commit with clear message
# Stage only the files this fix touched. Note: this repo has no dedicated
# session module - session state comes from Telegraf's built-in session(),
# wired in src/bot.ts.
git add <files changed by the fix>
git commit -m "fix(session): prevent crash on undefined user

Check user existence before accessing properties
to prevent TypeError in session initialization.

Fixes #234"

# 4. Push and create PR to production
git push -u origin fix/session-crash
gh pr create --base production --title "fix(session): prevent crash on undefined user"

# 5. After merge to production, also merge to main
git checkout main
git pull origin main
git merge fix/session-crash
git push origin main

# 6. Cleanup
git branch -d fix/session-crash
```

### Pattern 3: Refactoring (No Functionality Change)

```bash
# 1. Create refactor branch
git checkout -b refactor/extract-validation-helper

# 2. Ensure tests pass BEFORE refactoring
npm test

# 3. Perform refactoring (tests should still pass)
# ... extract helper, simplify code ...

# 4. Verify tests still pass
npm test

# 5. Commit
git add src/helpers/textValidation.ts
git add src/scenes/*/index.ts
git commit -m "refactor(wizard): extract validation to helper

Extract repeated validation logic to shared helper
for better maintainability and testability.

- Extract shared checks into src/helpers/textValidation.ts
- Update all wizards to use helper
- Tests still pass (no functionality change)"

# 6. Push and PR
git push -u origin refactor/extract-validation-helper
gh pr create
```

## 📊 Git History Best Practices

### Keep History Clean

```bash
# ✅ GOOD - logical, atomic commits
feat(heygen): add wizard state interface
feat(heygen): implement API client
feat(heygen): add async generation function
feat(heygen): integrate with Supabase

# ❌ BAD - messy, non-atomic commits
WIP
fix typo
oops forgot this file
final version
actually final version
```

### Amend Last Commit (if not pushed)

```bash
# Forgot to add file to last commit
git add forgotten-file.ts
git commit --amend --no-edit

# Fix commit message
git commit --amend -m "feat(heygen): add wizard state interface"

# ⚠️ NEVER amend commits that are already pushed!
```

### Interactive Rebase (Clean Up Before PR)

```bash
# Clean up last 3 commits
git rebase -i HEAD~3

# In editor:
pick abc123 feat(heygen): add wizard
pick def456 fix typo
pick ghi789 add tests

# Change to:
pick abc123 feat(heygen): add wizard
fixup def456 fix typo         # Merge into previous
pick ghi789 test(heygen): add wizard tests  # Better message

# Result: 2 clean commits instead of 3 messy ones
```

### Cherry-Pick (Apply Specific Commit to Another Branch)

```bash
# Apply specific commit from feat branch to hotfix
git checkout production
git cherry-pick abc123

# Useful for backporting fixes
```

## 🎯 Integration with Other Skills

### With task-tracker

```yaml
task-tracker:
  - Maintains current_task.mdc
  - Tracks git commits per step

git-workflow:
  - Enforces branch naming
  - Validates commit messages
  - Creates PR with proper format

Together:
  - current_task.mdc includes commit hashes
  - Easy rollback to known good state
  - Clear audit trail of changes
```

### With memory-manager

```yaml
memory-manager:
  - Records SUCCESS_HISTORY.md
  - Records REGRESSION_PATTERNS.md

git-workflow:
  - Links commits to success/failure patterns
  - Enables git revert to last known good state

Together:
  - "Last successful commit: abc123" in SUCCESS_HISTORY
  - "Regression introduced in: def456" in REGRESSION_PATTERNS
  - git revert def456 to fix regression
```

### With tdd-automation

```yaml
tdd-automation:
  - RED: Write failing test
  - GREEN: Implement code
  - REFACTOR: Improve code

git-workflow:
  - Commit after each phase
  - Clear commit messages per phase

Commits:
  test(heygen): add validation test (RED)
  feat(heygen): implement validation (GREEN)
  refactor(heygen): extract to helper (REFACTOR)
```

## 🚨 Common Mistakes and Solutions

### Mistake 1: Direct Commit to Production

```bash
# ❌ Mistake
git checkout production
git commit -m "quick fix"
git push

# ✅ Solution - pre-commit hook blocks this
❌ Direct commits to production are forbidden!
Create a feature branch instead

# Correct approach
git checkout -b fix/quick-fix
git commit -m "fix(api): correct endpoint URL"
git push
gh pr create --base production
```

### Mistake 2: Vague Commit Messages

```bash
# ❌ Bad
git commit -m "fix bug"
git commit -m "update code"
git commit -m "changes"

# ✅ Good
git commit -m "fix(session): prevent crash on undefined user"
git commit -m "refactor(wizard): extract validation to helper"
git commit -m "feat(heygen): add avatar generation wizard"
```

### Mistake 3: Mixing Multiple Changes in One Commit

```bash
# ❌ Bad - one commit with multiple unrelated changes
git add src/scenes/heygenWizard/
git add src/scenes/soraWizard/
git add src/helpers/textValidation.ts
git commit -m "add features and fix bugs"

# ✅ Good - separate commits per logical change
git add src/scenes/heygenWizard/
git commit -m "feat(heygen): add wizard"

git add src/scenes/soraWizard/
git commit -m "feat(sora): add wizard"

git add src/helpers/textValidation.ts
git commit -m "refactor(helpers): extract validation"
```

### Mistake 4: 🚨 КРИТИЧНО - Using git reset (НИКОГДА!)

```bash
# ❌ КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО - git reset удаляет историю!
git reset --hard HEAD~1       # УДАЛЯЕТ коммиты навсегда!
git reset --hard origin/main  # УДАЛЯЕТ локальную работу!

# 💥 Последствия:
# - Потеря всех незакоммиченных изменений
# - Удаление Skills, Agents, Commands
# - Невозможность восстановления
# - Разрушение продакшена

# ✅ ПРАВИЛЬНО - Используйте git revert
git revert HEAD              # Создает НОВЫЙ коммит, отменяющий изменения
git revert abc123            # Отменяет конкретный коммит безопасно

# ✅ ПРАВИЛЬНО - Используйте ветки для экспериментов
git checkout -b experiment/test-changes
# Делайте что угодно в ветке
# Если не нравится - просто удалите ветку:
git checkout main
git branch -D experiment/test-changes

# ✅ ПРАВИЛЬНО - Для отката изменений используйте stash
git stash                    # Сохраняет изменения во временное хранилище
git stash list              # Показывает список сохраненных изменений
git stash pop               # Восстанавливает последние изменения
git stash drop              # Удаляет последние изменения из stash
```

**Почему git reset опасен**:

1. **Невосстановимость**: `git reset --hard` удаляет изменения навсегда
2. **Конфликты с командой**: Если кто-то pull-нул до reset, возникает хаос
3. **Потеря работы**: Удаляет Skills, документацию, код без возможности вернуть
4. **Нарушение истории**: Ломает git history для всей команды

**Реальный кейс** (2025-11-11):

```bash
# ❌ Агент сделал:
git reset --hard HEAD~50

# 💥 Результат:
# - Удалено 200+ command файлов
# - Потеряны Skills и Agents
# - Production пострадал
# - Пришлось восстанавливать из старых коммитов
```

**ПРАВИЛО ДЛЯ АГЕНТОВ**:

- ✅ Всегда используй `git revert` вместо `git reset`
- ✅ Всегда создавай ветку для экспериментов
- ✅ Используй `git stash` для временных изменений
- ❌ НИКОГДА не используй `git reset --hard`
- ❌ НИКОГДА не используй `git reset` на main/production
- ❌ НИКОГДА не удаляй коммиты из истории

**Исключение**: `git reset` разрешён ТОЛЬКО для unstaged изменений:

```bash
# ✅ OK - откат unstaged файлов (не удаляет коммиты!)
git reset HEAD file.ts       # Убирает файл из staging area
git checkout -- file.ts      # Откатывает изменения в файле
```

## 🕉️ Sanskrit Wisdom for Git Discipline

### On Clean Commits

_"एकं सत्यं बहुधा वदन्ति"_ (Ekam Satyam Bahudha Vadanti)
"Одна истина, много путей к ней" - Ригведа

→ Один коммит = одна логическая единица изменений

### On Branch Strategy

_"विभागेन व्यवस्थिता"_ (Vibhagena Vyavasthita)
"Организация через разделение"

→ Разделяй concerns через ветки

### On Commit Messages

_"वाक्यं रसात्मकं काव्यम्"_ (Vakyam Rasatmakam Kavyam)
"Слово должно быть наполнено смыслом"

→ Каждое сообщение коммита несет смысл

---

**Created**: 2025-01-11
**Version**: 1.0
**Status**: Production-ready ✅
**Philosophy**: "Clean git history = clear project evolution"
**Integration**: Works with task-tracker, memory-manager, tdd-automation
