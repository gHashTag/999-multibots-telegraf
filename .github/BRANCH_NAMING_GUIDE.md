# 🏷️ Branch Naming Guide

This guide ensures consistent and meaningful branch names across our project.

## 📋 Quick Reference

### Format: `type/description`

**Types:**
- `feat/` - New features
- `fix/` - Bug fixes  
- `docs/` - Documentation
- `chore/` - Maintenance
- `test/` - Tests only
- `refactor/` - Code refactoring
- `hotfix/` - Emergency fixes

### ✅ Good Examples
```
feat/admin-only-commands
fix/payment-webhook-timeout
docs/api-documentation-update
chore/update-eslint-config
test/add-unit-tests-auth
refactor/optimize-db-queries
hotfix/critical-memory-leak
```

### ❌ Bad Examples
```
feature/new-stuff           # Wrong prefix
admin-commands             # Missing prefix  
fix-bug                   # Too generic
MyNewFeature              # Not lowercase
feat/this-is-a-very-long-branch-name-that-goes-on-forever  # Too long
feat/fix_something        # Mixed separators
```

## 📏 Rules

### Length Limits
- **Minimum:** 5 characters total
- **Maximum:** 50 characters total
- **Description:** Keep concise but descriptive

### Character Rules
- Use **lowercase letters only**
- Use **hyphens** to separate words
- **No spaces, underscores, or special characters**
- **No continuous hyphens** (`--`)
- **Don't end with hyphen**

### Naming Pattern
```
^(feat|fix|docs|chore|test|refactor|hotfix)\/[a-z0-9-]+$
```

## 🎯 Type Definitions

### `feat/` - New Features
**When to use:** Adding new functionality or enhancements

**Examples:**
- `feat/user-authentication`
- `feat/payment-integration`
- `feat/admin-dashboard`
- `feat/telegram-bot-commands`

### `fix/` - Bug Fixes
**When to use:** Fixing existing functionality that's broken

**Examples:**
- `fix/login-error-handling`
- `fix/memory-leak-bot-service`
- `fix/database-connection-timeout`
- `fix/ui-responsive-layout`

### `docs/` - Documentation
**When to use:** Changes to documentation only (no code changes)

**Examples:**
- `docs/installation-guide`
- `docs/api-reference-update`
- `docs/contributing-guidelines`
- `docs/readme-improvements`

### `chore/` - Maintenance
**When to use:** Changes to build process, dependencies, configs

**Examples:**
- `chore/update-dependencies`
- `chore/eslint-configuration`
- `chore/docker-optimization`
- `chore/github-actions-setup`

### `test/` - Testing
**When to use:** Adding or modifying tests (no production code changes)

**Examples:**
- `test/unit-tests-user-service`
- `test/integration-tests-api`
- `test/e2e-tests-payment-flow`
- `test/mock-telegram-api`

### `refactor/` - Code Refactoring
**When to use:** Restructuring code without changing functionality

**Examples:**
- `refactor/extract-payment-service`
- `refactor/optimize-database-queries`
- `refactor/simplify-auth-middleware`
- `refactor/modularize-bot-commands`

### `hotfix/` - Emergency Fixes
**When to use:** Critical issues in production that need immediate fixing

**Examples:**
- `hotfix/security-vulnerability`
- `hotfix/production-crash`
- `hotfix/critical-api-failure`
- `hotfix/data-corruption-issue`

## 🤖 AI Assistant Rules

### For Claude, ChatGPT, and other AI tools:

**🚨 CRITICAL RULE: Each task = new branch**

1. **Create new branch for every new task**
2. **Never reuse old branch names**  
3. **Follow the naming convention exactly**

**Workflow:**
```bash
# For each new task:
git checkout main
git pull origin main
git checkout -b type/task-description

# Examples:
git checkout -b feat/implement-user-roles
git checkout -b fix/resolve-webhook-error  
git checkout -b docs/update-installation-guide
```

## 🔄 Workflow Integration

### Branch Lifecycle
1. **Create:** `git checkout -b type/description`
2. **Work:** Make commits on the branch
3. **Push:** `git push -u origin type/description`
4. **PR:** Create pull request to main
5. **Review:** Code review and approval
6. **Merge:** Merge to main via PR
7. **Cleanup:** Delete branch after merge

### Automation Benefits
- **CI/CD triggers** based on branch type
- **Auto-labeling** of PRs
- **Deployment strategies** per branch type
- **Review assignment** based on changes

## 🔧 Enforcement

### Automated Checks
Our GitHub Actions automatically validate:
- Branch name format
- Character restrictions
- Length limits
- Type prefixes

### Manual Review
Pull requests with invalid branch names will:
- Fail automated checks
- Be blocked from merging
- Receive feedback comments

## 📖 Examples by Scenario

### New Feature Development
```bash
git checkout -b feat/telegram-command-middleware
git checkout -b feat/user-subscription-system
git checkout -b feat/payment-webhook-handler
```

### Bug Fixes
```bash
git checkout -b fix/bot-memory-leak
git checkout -b fix/webhook-timeout-error
git checkout -b fix/database-connection-pool
```

### Documentation Updates
```bash
git checkout -b docs/api-documentation
git checkout -b docs/deployment-guide
git checkout -b docs/troubleshooting-section
```

### Maintenance Tasks
```bash
git checkout -b chore/update-node-dependencies
git checkout -b chore/optimize-docker-build
git checkout -b chore/eslint-config-update
```

## 🎯 Best Practices

### Do's ✅
- Keep descriptions specific and actionable
- Use present tense ("add" not "added")
- Think about what the branch accomplishes
- Use domain-specific terminology when clear
- Group related changes in one branch

### Don'ts ❌
- Don't use generic descriptions ("fix-stuff")
- Don't include issue numbers in branch names
- Don't use abbreviations unless very clear
- Don't mix multiple types of changes
- Don't create branches for small typo fixes

## 🚀 Quick Commands

### Create and Switch to New Branch
```bash
git checkout -b feat/your-feature-name
```

### Push New Branch to Remote
```bash
git push -u origin feat/your-feature-name
```

### Check Current Branch
```bash
git branch --show-current
```

### List All Branches
```bash
git branch -a
```

---

**Remember:** Good branch names make the codebase easier to navigate and understand! 🌟