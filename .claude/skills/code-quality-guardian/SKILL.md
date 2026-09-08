---
name: code-quality-guardian
description: Enforces code quality standards including modular file policy (200-300 lines max), complexity limits, naming conventions, and architectural patterns. Blocks PRs that violate quality standards. Use for code reviews, refactoring guidance, and preventing technical debt.
---

# 🛡️ Code Quality Guardian - Хранитель Качества Кода

**Sanskrit Wisdom**: 🕉️ _"सरलता परमं बलम्"_ (Saralata Paramam Balam) - "Простота - высшая сила"

**Философия**: "Complex code = technical debt. Simple code = long-term maintainability."

## 🎯 Core Knowledge

Этот Skill обеспечивает качество кода через:

- 📏 Modular File Policy (200-300 lines max)
- 🧩 Complexity limits (Cyclomatic complexity ≤10)
- 🏗️ Architectural patterns enforcement
- 📝 Naming conventions
- 🚫 Anti-pattern detection
- ✅ Automated quality gates

## 📏 Modular File Policy

### The 200-300 Lines Rule

```yaml
Правило: 'Файл должен помещаться на один экран'

Limits:
  Soft Limit: 200 lines (warning)
  Hard Limit: 300 lines (error, blocks PR)

Reasoning:
  - AI tools работают лучше с small files
  - Easier to understand and maintain
  - Forces good separation of concerns
  - Better testability
```

### File Size Check Script (template - NOT installed)

This repository has **no automated file-size gate**. `scripts/check-file-size.sh`
does not exist and never has: nothing in `lefthook.yml`, `.eslintrc.cjs` or
`.github/workflows/` measures file length. The 200/300-line limits above are a
review convention enforced by people reading the diff, not by a command you can
run. The listing below is a template to copy if you decide to build that gate -
save it to `scripts/check-file-size.sh` first, and wire it into `lefthook.yml`
(the real pre-commit gate) rather than into `.git/hooks/`.

```bash
#!/bin/bash
# Template only. Not present in the repository - save before running.

echo "📏 Checking file sizes..."

# Find TypeScript files over 200 lines
WARNINGS=$(find src -name "*.ts" -not -path "*/node_modules/*" -exec wc -l {} + | \
  awk '$1 > 200 && $1 <= 300 {print}' | \
  sort -rn)

# Find TypeScript files over 300 lines (hard limit)
ERRORS=$(find src -name "*.ts" -not -path "*/node_modules/*" -exec wc -l {} + | \
  awk '$1 > 300 {print}' | \
  sort -rn)

if [ -n "$WARNINGS" ]; then
  echo ""
  echo "⚠️  Files over 200 lines (consider splitting):"
  echo "$WARNINGS"
fi

if [ -n "$ERRORS" ]; then
  echo ""
  echo "❌ Files over 300 lines (MUST be split):"
  echo "$ERRORS"
  echo ""
  echo "These files violate the modular file policy."
  echo "Split them into smaller, focused modules."
  exit 1
fi

echo "✅ All files within size limits"
exit 0
```

### How to Split Large Files

```typescript
// ❌ BEFORE: 450-line wizard file (too large)
// src/scenes/heygenWizard/heygen-wizard.ts (450 lines)

export const heygenWizard = new WizardScene<MyContext>('heygen-wizard')

// ... 50 lines of state interface ...
// ... 100 lines of validation logic ...
// ... 150 lines of wizard steps ...
// ... 100 lines of helper functions ...
// ... 50 lines of registration ...

// ✅ AFTER: Split into 5 focused modules

// 1. src/scenes/heygenWizard/types.ts (50 lines)
export interface HeyGenWizardState {
  avatarId?: string
  text?: string
  voiceId?: string
}

// 2. src/scenes/heygenWizard/validation.ts (100 lines)
export function validateAvatarId(id: string): boolean {
  // ...
}

export function validateText(text: string): boolean {
  // ...
}

// 3. src/scenes/heygenWizard/steps/index.ts (150 lines)
export { selectAvatarStep } from './select-avatar'
export { enterTextStep } from './enter-text'
export { selectVoiceStep } from './select-voice'

// 4. src/scenes/heygenWizard/helpers.ts (100 lines)
export function formatAvatarMessage(avatar: Avatar): string {
  // ...
}

// 5. src/scenes/heygenWizard/index.ts (50 lines)
import { heygenWizard } from './wizard'
export { heygenWizard }
```

### Module Organization Pattern

```
src/scenes/heygenWizard/
├── index.ts              # Public API (exports)
├── wizard.ts             # Main wizard definition
├── types.ts              # TypeScript interfaces
├── validation.ts         # Validation logic
├── helpers.ts            # Helper functions
└── steps/
    ├── index.ts          # Export all steps
    ├── select-avatar.ts  # Step 1
    ├── enter-text.ts     # Step 2
    └── select-voice.ts   # Step 3
```

## 🧩 Complexity Limits

### Cyclomatic Complexity

```yaml
Правило: 'Функция с complexity >10 слишком сложна'

Limits:
  Low: 1-5 (simple, good)
  Medium: 6-10 (acceptable)
  High: 11-20 (warning, refactor recommended)
  Very High: 21+ (error, blocks PR)

Reasoning:
  - High complexity = hard to test
  - High complexity = more bugs
  - High complexity = hard to understand
```

### Complexity Check with ESLint

```json
// .eslintrc.json
{
  "rules": {
    "complexity": ["error", { "max": 10 }],
    "max-depth": ["error", { "max": 3 }],
    "max-nested-callbacks": ["error", { "max": 3 }],
    "max-lines-per-function": [
      "warn",
      {
        "max": 50,
        "skipBlankLines": true,
        "skipComments": true
      }
    ]
  }
}
```

### Reducing Complexity Example

```typescript
// ❌ HIGH COMPLEXITY (15) - too many branches
export async function processPayment(
  userId: string,
  amount: number,
  currency: string
): Promise<PaymentResult> {
  if (!userId) throw new Error('Invalid user')
  if (amount <= 0) throw new Error('Invalid amount')
  if (!['USD', 'EUR', 'RUB'].includes(currency))
    throw new Error('Invalid currency')

  const user = await getUser(userId)
  if (!user) throw new Error('User not found')
  if (user.balance < amount) throw new Error('Insufficient balance')
  if (user.status === 'banned') throw new Error('User banned')

  try {
    const payment = await createPayment({ userId, amount, currency })
    if (payment.status === 'success') {
      await updateUserBalance(userId, -amount)
      await notifyUser(userId, 'Payment successful')
      return { success: true, paymentId: payment.id }
    } else if (payment.status === 'pending') {
      await scheduleRetry(payment.id)
      return { success: false, pending: true }
    } else {
      await refundPayment(payment.id)
      return { success: false, error: 'Payment failed' }
    }
  } catch (error) {
    if (error.code === 'NETWORK_ERROR') {
      await scheduleRetry(userId, amount)
    } else if (error.code === 'INVALID_CARD') {
      await notifyUser(userId, 'Invalid card')
    }
    throw error
  }
}

// ✅ LOW COMPLEXITY (3) - extracted functions
export async function processPayment(
  userId: string,
  amount: number,
  currency: string
): Promise<PaymentResult> {
  // Validation (complexity: 1)
  validatePaymentParams({ userId, amount, currency })

  // User checks (complexity: 1)
  const user = await getUserForPayment(userId, amount)

  // Payment processing (complexity: 1)
  return await executePayment(user, amount, currency)
}

// Extracted validation (complexity: 3)
function validatePaymentParams(params: PaymentParams): void {
  if (!params.userId) throw new Error('Invalid user')
  if (params.amount <= 0) throw new Error('Invalid amount')
  if (!VALID_CURRENCIES.includes(params.currency)) {
    throw new Error('Invalid currency')
  }
}

// Extracted user checks (complexity: 3)
async function getUserForPayment(
  userId: string,
  amount: number
): Promise<User> {
  const user = await getUser(userId)
  if (!user) throw new Error('User not found')
  if (user.balance < amount) throw new Error('Insufficient balance')
  if (user.status === 'banned') throw new Error('User banned')
  return user
}

// Extracted payment execution (complexity: 4)
async function executePayment(
  user: User,
  amount: number,
  currency: string
): Promise<PaymentResult> {
  try {
    const payment = await createPayment({ userId: user.id, amount, currency })
    return await handlePaymentStatus(payment, user.id, amount)
  } catch (error) {
    return await handlePaymentError(error, user.id, amount)
  }
}
```

## 🏗️ Architectural Patterns

### Clean Architecture Layers

```yaml
Правило: "Business logic НЕ должна зависеть от UI или Infrastructure"

Layers (dependency direction: outer → inner):
  1. Infrastructure (outer)
     - Telegram API, Database, External APIs
     - Adapters: supabase, telegraf, heygen

  2. Application (middle)
     - Use cases, Orchestration
     - Inngest functions, Scene handlers

  3. Domain (inner)
     - Business logic, Entities
     - Core types, Validation rules

Dependency Rule:
  - Inner layers NEVER depend on outer layers
  - Outer layers depend on inner layers
  - Use dependency injection for flexibility
```

### Anti-Pattern: Business Logic in UI

```typescript
// ❌ BAD - business logic in Telegram scene
heygenWizard.action('generate', async ctx => {
  const state = ctx.scene.state as HeyGenWizardState

  // ❌ Business logic in UI layer!
  if (!state.text || state.text.length < 10) {
    await ctx.answerCbQuery('Text too short!')
    return
  }

  if (state.text.length > 500) {
    await ctx.answerCbQuery('Text too long!')
    return
  }

  const user = await ctx.db
    .from('users')
    .select('balance')
    .eq('telegram_id', ctx.from.id)
    .single()

  if (user.data.balance < 50) {
    await ctx.answerCbQuery('Insufficient balance!')
    return
  }

  // ... more business logic ...
})

// ✅ GOOD - thin UI layer, business logic in domain
heygenWizard.action('generate', async ctx => {
  const state = ctx.scene.state as HeyGenWizardState

  try {
    // UI only coordinates, doesn't implement business rules
    await generateHeyGenAvatar(ctx, state)
    await ctx.answerCbQuery('Generation started!')
  } catch (error) {
    await handleHeyGenError(ctx, error)
  }
})

// Business logic in domain layer
// src/domain/heygen/generate-avatar.ts
export async function generateHeyGenAvatar(
  ctx: MyContext,
  state: HeyGenWizardState
): Promise<void> {
  // Business rules
  validateAvatarParams(state)

  const user = await getUserByTelegramId(ctx.from.id)
  checkUserBalance(user, HEYGEN_PRICE)

  // Orchestrate use case
  await deductUserBalance(user.id, HEYGEN_PRICE)
  await triggerHeyGenGeneration(user.id, state)
}
```

### Dependency Injection Pattern

```typescript
// ❌ BAD - tight coupling to infrastructure
export class HeyGenService {
  async generateAvatar(params: AvatarParams): Promise<string> {
    // Direct dependency on Supabase
    const { data } = await supabase
      .from('users')
      .select('balance')
      .eq('id', params.userId)
      .single()

    // Direct dependency on HeyGen API
    const response = await fetch('https://api.heygen.com/v1/generate', {
      // ...
    })

    return response.video_id
  }
}

// ✅ GOOD - dependency injection
export interface UserRepository {
  getById(id: string): Promise<User>
  updateBalance(id: string, amount: number): Promise<void>
}

export interface HeyGenClient {
  generateAvatar(params: AvatarParams): Promise<string>
}

export class HeyGenService {
  constructor(
    private userRepo: UserRepository,
    private heygenClient: HeyGenClient
  ) {}

  async generateAvatar(params: AvatarParams): Promise<string> {
    // Dependencies injected, easy to test and swap
    const user = await this.userRepo.getById(params.userId)
    const videoId = await this.heygenClient.generateAvatar(params)
    await this.userRepo.updateBalance(user.id, -HEYGEN_PRICE)
    return videoId
  }
}

// Easy to test with mocks
describe('HeyGenService', () => {
  it('should generate avatar', async () => {
    const mockUserRepo = {
      getById: jest.fn().mockResolvedValue({ id: '1', balance: 100 }),
      updateBalance: jest.fn(),
    }
    const mockHeyGenClient = {
      generateAvatar: jest.fn().mockResolvedValue('video_123'),
    }

    const service = new HeyGenService(mockUserRepo, mockHeyGenClient)
    const result = await service.generateAvatar({ userId: '1' })

    expect(result).toBe('video_123')
    expect(mockUserRepo.updateBalance).toHaveBeenCalledWith('1', -50)
  })
})
```

## 📝 Naming Conventions

### Functions and Variables

```typescript
// ✅ GOOD - clear, descriptive names
async function getUserByTelegramId(telegramId: string): Promise<User | null>
function validateAvatarParams(params: AvatarParams): void
const isUserBanned = user.status === 'banned'
const hasEnoughBalance = user.balance >= price

// ❌ BAD - vague, abbreviated names
async function get(id: string) // Get what?
function validate(p: any) // Validate what? What's p?
const b = user.status === 'banned' // What's b?
const x = user.balance >= price // What's x?
```

### Classes and Interfaces

```typescript
// ✅ GOOD - PascalCase, descriptive
interface HeyGenWizardState {}
interface UserRepository {}
class PaymentService {}
class HeyGenClient {}

// ❌ BAD - unclear, wrong case
interface heygen {} // Wrong case
interface Data {} // Too generic
class Service {} // Which service?
class Client {} // Which client?
```

### Files and Directories

```bash
# ✅ GOOD - kebab-case, clear purpose
src/scenes/heygen-wizard/
src/services/heygen/heygen-client.ts
src/helpers/validation.ts
src/domain/payment/process-payment.ts

# ❌ BAD - inconsistent, unclear
src/scenes/HeyGenWizard/  # Wrong case
src/services/heygen.ts  # What about heygen?
src/helpers/utils.ts  # Too generic
src/stuff/thing.ts  # Meaningless
```

## 🚫 Anti-Pattern Detection

### Anti-Pattern 1: God Object

```typescript
// ❌ BAD - one class does everything (500+ lines)
class UserManager {
  async createUser() {}
  async deleteUser() {}
  async updateUserProfile() {}
  async processPayment() {}
  async generateAvatar() {}
  async sendNotification() {}
  async validateEmail() {}
  async hashPassword() {}
  // ... 50 more methods ...
}

// ✅ GOOD - single responsibility
class UserService {
  async createUser() {}
  async deleteUser() {}
}

class PaymentService {
  async processPayment() {}
}

class AvatarService {
  async generateAvatar() {}
}

class NotificationService {
  async sendNotification() {}
}
```

### Anti-Pattern 2: Magic Numbers

```typescript
// ❌ BAD - magic numbers everywhere
if (user.balance < 50) {
  throw new Error('Insufficient balance');
}

setTimeout(() => { ... }, 300000);

if (text.length > 500) {
  throw new Error('Text too long');
}

// ✅ GOOD - named constants
const HEYGEN_PRICE = 50;
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const MAX_TEXT_LENGTH = 500;

if (user.balance < HEYGEN_PRICE) {
  throw new Error('Insufficient balance');
}

setTimeout(() => { ... }, FIVE_MINUTES_MS);

if (text.length > MAX_TEXT_LENGTH) {
  throw new Error('Text too long');
}
```

### Anti-Pattern 3: Callback Hell

```typescript
// ❌ BAD - nested callbacks (pyramid of doom)
getUser(userId, user => {
  checkBalance(user, balance => {
    if (balance > 50) {
      processPayment(user, payment => {
        updateBalance(user.id, result => {
          sendNotification(user.id, sent => {
            console.log('Done')
          })
        })
      })
    }
  })
})

// ✅ GOOD - async/await (flat, readable)
async function processUserPayment(userId: string): Promise<void> {
  const user = await getUser(userId)
  const balance = await checkBalance(user)

  if (balance > 50) {
    const payment = await processPayment(user)
    await updateBalance(user.id)
    await sendNotification(user.id)
  }
}
```

## ✅ Quality Gates

### Pre-Commit Checks

```bash
#!/bin/bash
# .git/hooks/pre-commit (quality checks)

echo "🛡️ Running code quality checks..."

# No file size check: this repo has no such script (see "File Size Check
# Script" above). File length is reviewed by hand.

# 1. ESLint (complexity, style)
npm run lint || exit 1

# 2. TypeScript type check
npm run typecheck || exit 1

# 3. Tests
npm test || exit 1

# 4. Check for TODO/FIXME in production code
TODOS=$(git diff --cached --name-only | \
  grep "^src/" | \
  xargs grep -n "TODO\|FIXME" 2>/dev/null || true)

if [ -n "$TODOS" ]; then
  echo "⚠️  TODO/FIXME found in production code:"
  echo "$TODOS"
  echo ""
  echo "Move TODOs to issue tracker before committing"
  # Warning only, not blocking
fi

echo "✅ Code quality checks passed!"
```

### CI/CD Quality Gates

```yaml
# .github/workflows/quality-check.yml

name: Code Quality Check

on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      # No "check file sizes" step: the script it would call does not exist
      # (see "File Size Check Script" above).

      - name: Lint code
        run: npm run lint

      - name: Check TypeScript
        run: npm run typecheck

      - name: Run tests
        run: npm test

      - name: Check coverage
        run: |
          npm run test:coverage
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.statements.pct')
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "❌ Coverage below 80%"
            exit 1
          fi

      - name: Complexity analysis
        run: npm run complexity-report

      - name: Block PR if quality gates fail
        if: failure()
        run: |
          echo "❌ Code quality checks failed"
          echo "Fix issues before merging"
          exit 1
```

## 📊 Code Metrics Dashboard

### Script to Generate Report

```bash
#!/bin/bash
# scripts/code-quality-report.sh

echo "📊 Code Quality Report"
echo "====================="
echo ""

# File sizes
echo "📏 File Size Analysis:"
find src -name "*.ts" -not -path "*/node_modules/*" -exec wc -l {} + | \
  awk '{total+=$1; count++; if($1>200) warnings++; if($1>300) errors++}
       END {
         print "  Total files: " count
         print "  Average lines: " int(total/count)
         print "  Files >200 lines: " warnings
         print "  Files >300 lines: " errors
       }'

echo ""

# Complexity
echo "🧩 Complexity Analysis:"
npm run complexity-report --silent | \
  awk '/Complexity/ {print "  " $0}'

echo ""

# Test coverage
echo "🧪 Test Coverage:"
npm run test:coverage --silent | \
  grep "All files" | \
  awk '{print "  Statements: " $2 "\n  Branches: " $4 "\n  Functions: " $6 "\n  Lines: " $8}'

echo ""

# TODOs count
echo "📝 Technical Debt:"
TODO_COUNT=$(find src -name "*.ts" -exec grep -c "TODO\|FIXME" {} + | \
  awk '{sum+=$1} END {print sum}')
echo "  TODOs/FIXMEs: $TODO_COUNT"

echo ""
echo "====================="
```

## 🎯 Integration with Other Skills

### With continuous-optimizer

```yaml
continuous-optimizer:
  - Analyzes project daily
  - Finds optimization opportunities

code-quality-guardian:
  - Enforces standards
  - Blocks low-quality code
  - Provides refactoring guidance

Together: Continuous improvement with quality enforcement
```

### With tdd-automation

```yaml
tdd-automation:
  - Enforces test-first
  - Ensures coverage >80%

code-quality-guardian:
  - Enforces code structure
  - Limits complexity
  - Ensures maintainability

Together: High-quality, well-tested code
```

### With git-workflow

```yaml
git-workflow:
  - Clean commits
  - Branch strategy

code-quality-guardian:
  - Quality gates in pre-commit
  - PR blocking on quality violations

Together: Only quality code reaches production
```

## 🕉️ Sanskrit Wisdom for Code Quality

### On Simplicity

_"सरलता परमं बलम्"_ (Saralata Paramam Balam)
"Простота - высшая сила"

→ Простой код сильнее сложного

### On Modularity

_"विभागेन सिद्धिः"_ (Vibhagena Siddhih)
"Успех достигается через разделение"

→ Разделяй большие файлы на модули

### On Naming

_"नाम रूपे व्यवस्थिते"_ (Nama Rupe Vyavasthite)
"Имя определяет суть"

→ Хорошее имя раскрывает назначение

---

**Created**: 2025-01-11
**Version**: 1.0
**Status**: Production-ready ✅
**Philosophy**: "Complex code = technical debt. Simple code = maintainability."
**Integration**: Works with continuous-optimizer, tdd-automation, git-workflow, code-reviewer agent
