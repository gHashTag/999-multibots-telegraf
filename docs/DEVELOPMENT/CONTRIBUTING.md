# 🤝 Contributing to bot-farm

Welcome! We're excited that you want to contribute to our multi-bot Telegram system.

## 🚀 Quick Start

1. **Fork the repository**
2. **Clone your fork**
3. **Create a new branch** (see naming conventions below)
4. **Make your changes**
5. **Submit a pull request**

## 🏷️ Branch Naming Convention

We follow a strict branch naming convention to maintain organization and enable automation:

### Format: `type/short-description`

**Branch Types:**
- `feat/` - New features or enhancements
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `chore/` - Maintenance tasks (deps, config, etc.)
- `test/` - Test additions or modifications
- `refactor/` - Code refactoring without functionality changes
- `hotfix/` - Emergency fixes for production

**Examples:**
- ✅ `feat/admin-only-commands`
- ✅ `fix/payment-webhook-error`
- ✅ `docs/api-documentation`
- ✅ `chore/update-dependencies`
- ❌ `feature/new-stuff`
- ❌ `bugfix`
- ❌ `my-branch`

### Rules:
- Use lowercase letters only
- Use hyphens to separate words
- Keep descriptions concise (max 30 characters)
- Be descriptive but not verbose

## 📝 Pull Request Process

### 1. Before Creating a PR

- [ ] Ensure your branch follows naming conventions
- [ ] Run tests locally: `npm test`
- [ ] Run linting: `npm run lint`
- [ ] Run type checking: `npm run typecheck`
- [ ] Update documentation if needed

### 2. PR Requirements

**Every PR must have:**
- [ ] Clear title following conventional commits format
- [ ] Comprehensive description using our template
- [ ] At least one checkbox marked in "Type of Change"
- [ ] Self-review completed
- [ ] Tests added for new functionality

**PR Title Format:**
```
type(scope): description

Examples:
feat(admin): add admin-only command middleware
fix(bot): resolve webhook timeout issues
docs(readme): update installation instructions
```

### 3. Review Process

1. **Automated Checks:** All PRs run through automated validation
2. **Code Review:** At least one team member reviews the code
3. **Testing:** Changes are tested in staging environment
4. **Approval:** PR must be approved before merging

## 🤖 Special Rules for AI Assistants

### ⚠️ CRITICAL: Each Task = New PR

**If you're an AI assistant (Claude, ChatGPT, etc.):**

1. **NEVER reuse closed or existing PRs**
2. **ALWAYS create a new branch for each new task**
3. **ALWAYS open a fresh PR for each task**

**Required Workflow:**
```bash
# For each new task:
git checkout main
git pull origin main
git checkout -b feat/new-task-description
# Complete the task
git add .
git commit -m "feat: implement new task"
git push -u origin feat/new-task-description
gh pr create --title "feat: implement new task" --base main
```

**Why this matters:**
- Maintains clean git history
- Enables proper code review
- Prevents confusion about task scope
- Ensures each PR addresses one specific issue

## 🧪 Testing Guidelines

### Required Tests
- **Unit tests** for new functions/methods
- **Integration tests** for API endpoints
- **End-to-end tests** for complete workflows

### Test Commands
```bash
npm test                    # Run all tests
npm run test:vitest        # Run Vitest tests
npm run test:instagram     # Test Instagram functionality
```

### Coverage Requirements
- Minimum 70% test coverage for new code
- All critical paths must be tested
- Mock external dependencies appropriately

## 🔒 Security Guidelines

### Never Commit:
- API keys, tokens, passwords
- Environment variables with secrets
- Private configuration files
- User data or credentials

### Security Practices:
- Use environment variables for secrets
- Validate all user inputs
- Sanitize data before database operations
- Follow principle of least privilege

## 📚 Code Style

### General Rules
- Use TypeScript strict mode
- Follow ESLint configuration
- Use Prettier for formatting
- Add JSDoc comments for public APIs

### Naming Conventions
- **Variables/Functions:** camelCase
- **Classes:** PascalCase  
- **Constants:** UPPER_SNAKE_CASE
- **Files:** kebab-case or camelCase

### Project Structure
```
src/
├── bot.ts              # Main bot entry point
├── commands/           # Bot commands
├── scenes/            # Telegraf scenes
├── services/          # Business logic
├── core/             # Core utilities
├── middleware/       # Custom middleware
├── interfaces/       # TypeScript interfaces
└── utils/            # Helper functions
```

## 🏗️ Architecture Patterns

### Bot Commands
- Use middleware for common functionality
- Implement proper error handling
- Add logging for debugging
- Follow scene-based patterns for complex flows

### Database Operations
- Always use TypeScript interfaces
- Handle errors gracefully
- Use transactions for multi-step operations
- Log all database operations

### API Integrations
- Implement retry logic
- Add timeout handling
- Use proper error messages
- Cache responses when appropriate

## 🚨 CI/CD Pipeline

### Automated Checks
Our CI/CD pipeline automatically:
- Validates branch naming
- Checks PR title format
- Runs security scans
- Executes test suites
- Performs code quality checks
- Validates PR descriptions

### Required Status Checks
All PRs must pass:
- ✅ Branch naming validation
- ✅ PR format validation
- ✅ Security scan
- ✅ Test suite
- ✅ Linting
- ✅ Type checking

## 🆘 Getting Help

### Resources
- **Documentation:** Check `/docs` folder
- **Issues:** Search existing issues first
- **Discussions:** Use GitHub Discussions for questions

### Contact
- Create an issue for bugs
- Start a discussion for questions
- Tag maintainers for urgent issues

## 🎯 Development Environment

### Prerequisites
- Node.js 20+
- Bun package manager
- Docker (for containers)
- PostgreSQL (via Supabase)

### Setup
```bash
# Install dependencies
bun install

# Copy environment file
cp .env.example .env

# Configure environment variables
# Edit .env with your values

# Run in development mode
npm run dev
```

### Environment Variables
See `.env.example` for all required variables including:
- Bot tokens (BOT_TOKEN_1, etc.)
- Database credentials (Supabase)
- API keys (OpenAI, Replicate, etc.)
- Payment system keys

## 📈 Performance Guidelines

### Best Practices
- Minimize database queries
- Use caching appropriately
- Optimize image/video processing
- Handle rate limiting gracefully
- Monitor memory usage

### Monitoring
- Add proper logging
- Use performance metrics
- Monitor error rates
- Track user interactions

---

## 🎉 Recognition

Contributors are recognized in:
- GitHub contributors list
- Release notes
- Project documentation

Thank you for helping make our multi-bot system better! 🚀

---

*For questions about contributing, please open an issue or start a discussion.*