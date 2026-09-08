---
name: tdd-automation
description: Automated Test-Driven Development with RED-GREEN-REFACTOR cycle enforcement. Automates test-first workflow, status tracking, and quality gates. Integrates with task-tracker for cycle status. Use for enforcing TDD discipline and preventing "code before tests" mistakes.
---

# 🧪 TDD Automation - Автоматизация Test-First Разработки

**Sanskrit Wisdom**: 🕉️ _"परीक्षितं प्रथमं कर्तव्यम्"_ (Parikshitam Prathamam Kartavyam) - "Сначала проверь, потом действуй"

**Философия**: "Tests are not afterthought. Tests are forethought. Code follows tests."

## 🎯 Core Knowledge

Этот Skill автоматизирует Test-Driven Development процесс:

- 🔴 **RED**: Написать failing test первым (ОБЯЗАТЕЛЬНО)
- 🟢 **GREEN**: Написать минимальный код для прохождения теста
- 🔵 **REFACTOR**: Улучшить код, сохраняя тесты зелеными
- 🚫 Блокировать код без тестов
- 📊 Отслеживать покрытие (target: 80%+)
- 🔄 Интеграция с task-tracker для статуса цикла

## 📐 The Sacred TDD Cycle

### Phase 1: 🔴 RED (Test First)

```yaml
Правило: 'Код БЕЗ теста = технический долг'

Процесс: 1. Написать FAILING test
  2. Test ДОЛЖЕН падать (если проходит - тест бесполезен)
  3. Test описывает ОЖИДАЕМОЕ поведение
  4. ТОЛЬКО после этого можно писать код

Проверка:
  - npm test -- <test-file>
  - Ожидается: Test FAILS ❌
  - Если проходит: ⚠️ Test не проверяет функциональность!
```

**Example: RED Phase**

```typescript
// ❌ Тест ДОЛЖЕН падать - функции еще не существует

describe('HeyGenClient', () => {
  describe('createAvatar', () => {
    it('should validate input parameters', async () => {
      const client = new HeyGenClient()

      await expect(
        client.createAvatar({
          text: '', // Invalid: empty text
          voiceId: 'invalid',
        })
      ).rejects.toThrow('Invalid parameters')
    })

    it('should call HeyGen API with correct payload', async () => {
      const client = new HeyGenClient()
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ video_id: 'abc123' }),
      })

      global.fetch = mockFetch

      await client.createAvatar({
        text: 'Hello world',
        voiceId: 'voice_123',
        avatarId: 'avatar_456',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.heygen.com/v1/video.generate',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Api-Key': expect.any(String),
          }),
          body: expect.stringContaining('Hello world'),
        })
      )
    })
  })
})
```

**Run Test (RED)**:

```bash
npm test -- heygen-client.test.ts

# Expected output:
# ❌ FAIL  src/services/heygen/heygen-client.test.ts
#   HeyGenClient
#     createAvatar
#       ✕ should validate input parameters (2 ms)
#       ✕ should call HeyGen API with correct payload (1 ms)
#
# Cannot find module '../heygen-client'

# ✅ GOOD! Test fails as expected. Now implement.
```

### Phase 2: 🟢 GREEN (Minimal Implementation)

```yaml
Правило: 'Делай минимум для прохождения теста'

Процесс: 1. Реализовать МИНИМАЛЬНЫЙ код
  2. НЕ добавлять "лишнюю" функциональность
  3. Test ДОЛЖЕН пройти
  4. Код может быть "некрасивым" - это нормально

Проверка:
  - npm test -- <test-file>
  - Ожидается: Test PASSES ✅
  - Если падает: Вернуться к реализации
```

**Example: GREEN Phase**

```typescript
// src/services/heygen/heygen-client.ts

export interface CreateAvatarParams {
  text: string
  voiceId: string
  avatarId: string
}

export class HeyGenClient {
  private apiKey: string

  constructor() {
    this.apiKey = process.env.HEYGEN_API_KEY || ''
  }

  async createAvatar(
    params: CreateAvatarParams
  ): Promise<{ video_id: string }> {
    // Validation (делает тест зеленым)
    if (!params.text || params.text.trim() === '') {
      throw new Error('Invalid parameters')
    }

    if (params.voiceId === 'invalid') {
      throw new Error('Invalid parameters')
    }

    // API call (делает тест зеленым)
    const response = await fetch('https://api.heygen.com/v1/video.generate', {
      method: 'POST',
      headers: {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: params.text,
        voice_id: params.voiceId,
        avatar_id: params.avatarId,
      }),
    })

    if (!response.ok) {
      throw new Error('API request failed')
    }

    return response.json()
  }
}
```

**Run Test (GREEN)**:

```bash
npm test -- heygen-client.test.ts

# Expected output:
# ✅ PASS  src/services/heygen/heygen-client.test.ts
#   HeyGenClient
#     createAvatar
#       ✓ should validate input parameters (3 ms)
#       ✓ should call HeyGen API with correct payload (12 ms)
#
# Test Suites: 1 passed, 1 total
# Tests:       2 passed, 2 total

# ✅ GOOD! Tests pass. Now refactor.
```

### Phase 3: 🔵 REFACTOR (Improve Code Quality)

```yaml
Правило: 'Улучшай код, сохраняя тесты зелеными'

Процесс: 1. Улучшить структуру кода
  2. Извлечь дублирующуюся логику
  3. Улучшить читаемость
  4. Тесты ДОЛЖНЫ оставаться зелеными

Проверка:
  - npm test -- <test-file>
  - Ожидается: Test STILL PASSES ✅
  - Если упали: Откатить refactoring
```

**Example: REFACTOR Phase**

```typescript
// src/services/heygen/heygen-client.ts (refactored)

export interface CreateAvatarParams {
  text: string
  voiceId: string
  avatarId: string
}

interface HeyGenApiResponse {
  video_id: string
}

export class HeyGenClient {
  private readonly apiKey: string
  private readonly baseUrl = 'https://api.heygen.com/v1'

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.HEYGEN_API_KEY || ''
  }

  async createAvatar(params: CreateAvatarParams): Promise<HeyGenApiResponse> {
    // Extracted validation
    this.validateParams(params)

    // Extracted API call
    const response = await this.callApi('/video.generate', params)

    return response
  }

  // Extracted method for better testability
  private validateParams(params: CreateAvatarParams): void {
    if (!params.text?.trim()) {
      throw new Error('Invalid parameters: text is required')
    }

    if (params.voiceId === 'invalid') {
      throw new Error('Invalid parameters: invalid voice ID')
    }
  }

  // Extracted method for reusability
  private async callApi(
    endpoint: string,
    payload: Record<string, unknown>
  ): Promise<HeyGenApiResponse> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(this.transformPayload(payload)),
    })

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`)
    }

    return response.json()
  }

  private getHeaders(): Record<string, string> {
    return {
      'X-Api-Key': this.apiKey,
      'Content-Type': 'application/json',
    }
  }

  private transformPayload(params: CreateAvatarParams): Record<string, string> {
    return {
      text: params.text,
      voice_id: params.voiceId,
      avatar_id: params.avatarId,
    }
  }
}
```

**Run Test (REFACTOR)**:

```bash
npm test -- heygen-client.test.ts

# Expected output:
# ✅ PASS  src/services/heygen/heygen-client.test.ts
#   HeyGenClient
#     createAvatar
#       ✓ should validate input parameters (2 ms)
#       ✓ should call HeyGen API with correct payload (10 ms)
#
# Test Suites: 1 passed, 1 total
# Tests:       2 passed, 2 total

# ✅ EXCELLENT! Tests still pass after refactoring.
```

## 🚫 Anti-Patterns (What NOT to Do)

### Anti-Pattern 1: Code Before Tests

```typescript
// ❌ НЕПРАВИЛЬНО - код написан БЕЗ тестов

export class HeyGenClient {
  async createAvatar(params: any) {
    // ... implementation ...
  }
}

// Потом (или никогда) написать тесты
// Проблема: Код может быть нетестируемым
```

**Why Wrong**:

- Код может быть нетестируемым (tight coupling)
- Нет гарантии что код работает
- Tests = afterthought, не design tool
- Нет защиты от регрессий

### Anti-Pattern 2: Passing Test on First Run (Not Really Testing)

```typescript
// ❌ НЕПРАВИЛЬНО - тест проходит сразу

it('should return success', async () => {
  const result = await someFunction()
  expect(result).toBeTruthy() // Всегда true?
})

// Проблема: Тест не проверяет реальную функциональность
```

**Why Wrong**:

- Тест не проверяет ожидаемое поведение
- False confidence (тест бесполезен)
- Не обнаружит баги

### Anti-Pattern 3: Skipping Refactor Phase

```typescript
// ❌ НЕПРАВИЛЬНО - оставить дублирование

export class HeyGenClient {
  async createAvatar(params: any) {
    if (!params.text || params.text.trim() === '') throw new Error('...')
    // ... rest of code ...
  }

  async createVideo(params: any) {
    if (!params.text || params.text.trim() === '') throw new Error('...')
    // ... same validation duplicated ...
  }
}

// Проблема: Дублирование кода, technical debt
```

**Why Wrong**:

- Code duplication
- Harder to maintain
- Bugs multiply (fix in one place, miss in another)

## 📊 Coverage Requirements

### Minimum Coverage: 80%

```yaml
Coverage Targets:
  Statements: >= 80%
  Branches: >= 75%
  Functions: >= 80%
  Lines: >= 80%

Quality Gates:
  - PR blocked if coverage drops below 80%
  - CI/CD pipeline fails if coverage < 80%
  - Pre-commit hook warns if new code not covered
```

### Coverage Commands

```bash
# Run tests with coverage
npm run test:coverage

# View coverage report
open coverage/lcov-report/index.html

# Check coverage percentage
npm run test:coverage -- --coverageThreshold='{"global":{"statements":80,"branches":75,"functions":80,"lines":80}}'
```

### Coverage Report Example

```bash
----------------------|---------|----------|---------|---------|-------------------
File                  | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
----------------------|---------|----------|---------|---------|-------------------
All files             |   85.23 |    78.45 |   82.76 |   85.67 |
 heygen-client.ts     |   92.31 |    87.50 |   90.00 |   92.86 | 45-47
 inngest-function.ts  |   78.95 |    70.00 |   75.00 |   79.17 | 89-95,102-108
----------------------|---------|----------|---------|---------|-------------------

✅ Coverage meets requirements (>80%)
```

## 🔄 Integration with task-tracker

### TDD Status in current_task.mdc

```markdown
### 2. ✏️ HeyGen Client Implementation

**TDD Cycle**:

- 🔴 RED: ✅ Tests written and failing (expected)
  - File: `__tests__/heygen-client.test.ts`
  - Status: 2 tests fail ❌
  - Command: `npm test -- heygen-client.test.ts`

- 🟢 GREEN: ✏️ Implementing minimal code (in progress)
  - File: `src/services/heygen/heygen-client.ts`
  - Progress: 50% (validation done, API call in progress)

- 🔵 REFACTOR: ⏸️ Awaiting GREEN completion

**Coverage**: 0% (no implementation yet)
```

**After GREEN Phase**:

```markdown
### 2. ✏️ HeyGen Client Implementation

**TDD Cycle**:

- 🔴 RED: ✅ Tests written and failing
- 🟢 GREEN: ✅ Tests passing (all 2 tests ✅)
  - File: `src/services/heygen/heygen-client.ts`
  - Tests: 2 passed, 2 total
  - Commit: `7a2b8c3d` - Implement HeyGen client

- 🔵 REFACTOR: ✏️ Improving code quality (in progress)

**Coverage**: 92% (statements), 87% (branches)
```

## 🎯 Automated TDD Scripts

### Script 1: tdd-cycle.sh — TEMPLATE ONLY, NOT IN THIS REPOSITORY

> ⚠️ **There is no `tdd-cycle.sh` file.** Neither `./tdd-cycle.sh` nor
> `./scripts/tdd-cycle.sh` exists, and neither ever did: no commit on any branch
> has added the file, and every mention of that name anywhere in the history is
> documentation — this section, plus a Cursor task note from May 2025 that
> already listed the script as a plan (in `.cursor/rules/current_task.mdc`,
> itself deleted since). There is nothing to run by path, so do not wire it into
> a hook, a cron entry or CI.
>
> To use it, copy the block below into `scripts/tdd-cycle.sh` yourself and
> `chmod +x` it. It has never been executed, so expect to debug it — and note
> two things it gets wrong about this repository before you start:
>
> - **The runner is vitest, not jest.** `npm test` here is
>   `cross-env ... bun run vitest`, and `package.json` has no `test:coverage`
>   script at all. The `--coverage --silent` call and the `"All files"` column
>   the template parses are jest output shapes.
> - **It judges by grepping output instead of by exit code.** `grep -q "PASS"`
>   and `grep -q "FAIL"` are exactly the habit `scripts/verify.cjs` was written
>   to avoid, after it had already produced two false greens here. Use the exit
>   status of the test command.
>
> What does exist, and is worth reaching for instead: `npm test` (vitest),
> `npm run test:gate` (`scripts/test-gate.cjs` — regression check that compares
> sets of passing tests, not counts) and `bun run verify` (`scripts/verify.cjs`
> — the full release check, judged by exit code only).

```bash
#!/bin/bash
# TEMPLATE for scripts/tdd-cycle.sh - automated TDD cycle enforcement.
# This file is NOT in the repository and never was; see the note above.

set -e

PHASE=$1  # red | green | refactor
TEST_FILE=$2

case $PHASE in
  red)
    echo "🔴 RED Phase: Writing failing test..."

    # Run tests - MUST fail
    if npm test -- "$TEST_FILE" 2>&1 | grep -q "PASS"; then
      echo "⚠️  WARNING: Test passed on first run!"
      echo "This means the test is not testing new functionality."
      echo "Please review your test."
      exit 1
    fi

    echo "✅ Test is failing (as expected)"
    echo "Now implement minimal code to make it pass (GREEN phase)"
    ;;

  green)
    echo "🟢 GREEN Phase: Implementing minimal code..."

    # Run tests - MUST pass
    npm test -- "$TEST_FILE"

    # Check coverage
    COVERAGE=$(npm test -- "$TEST_FILE" --coverage --silent | \
               grep "All files" | awk '{print $2}' | sed 's/%//')

    if (( $(echo "$COVERAGE < 80" | bc -l) )); then
      echo "⚠️  Coverage is below 80%: $COVERAGE%"
      echo "Add more tests or cover edge cases"
    fi

    echo "✅ Tests passing. Coverage: $COVERAGE%"
    echo "Now improve code quality (REFACTOR phase)"
    ;;

  refactor)
    echo "🔵 REFACTOR Phase: Improving code quality..."

    # Save current test output
    BEFORE=$(npm test -- "$TEST_FILE" 2>&1)

    # User performs refactoring (manual)
    echo "Perform your refactoring now..."
    echo "Press Enter when done..."
    read -r

    # Run tests again - MUST still pass
    AFTER=$(npm test -- "$TEST_FILE" 2>&1)

    if echo "$AFTER" | grep -q "FAIL"; then
      echo "❌ Tests failed after refactoring!"
      echo "Revert your changes and try again"
      exit 1
    fi

    echo "✅ Tests still passing after refactoring"
    echo "Cycle complete! Commit your changes."
    ;;

  *)
    echo "Usage: scripts/tdd-cycle.sh [red|green|refactor] <test-file>"
    exit 1
    ;;
esac
```

### Usage Example — only after you create the script yourself

The commands below run the template above. They work only once you have saved
it as `scripts/tdd-cycle.sh` and made it executable; on a fresh checkout of this
repository every one of them fails with "No such file or directory", because the
file is not shipped here.

```bash
# One-time, by hand: save the template above as scripts/tdd-cycle.sh, then
#   chmod +x scripts/tdd-cycle.sh

# Phase 1: Write failing test
./scripts/tdd-cycle.sh red heygen-client.test.ts

# Phase 2: Implement code
./scripts/tdd-cycle.sh green heygen-client.test.ts

# Phase 3: Refactor
./scripts/tdd-cycle.sh refactor heygen-client.test.ts
```

## 🚦 Quality Gates

### Pre-Commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "Running TDD quality checks..."

# Check if tests exist for modified files
MODIFIED_FILES=$(git diff --cached --name-only --diff-filter=AM | grep "\.ts$" | grep -v "\.test\.ts$")

for file in $MODIFIED_FILES; do
  TEST_FILE="${file%.ts}.test.ts"

  if [ ! -f "$TEST_FILE" ]; then
    echo "❌ No test file found for: $file"
    echo "Expected: $TEST_FILE"
    echo "TDD requires tests BEFORE implementation"
    exit 1
  fi
done

# Run tests
npm test

# Check coverage
npm run test:coverage -- --silent

echo "✅ TDD quality checks passed"
```

### CI/CD Pipeline

```yaml
# .github/workflows/tdd-check.yml

name: TDD Quality Check

on: [push, pull_request]

jobs:
  tdd-check:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Check coverage
        run: |
          npm run test:coverage
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.statements.pct')
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "❌ Coverage below 80%: $COVERAGE%"
            exit 1
          fi

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## 🎭 Integration with Other Skills

### With telegram-scenes-ULTIMATE

```yaml
telegram-scenes-ULTIMATE:
  - Defines wizard structure
  - Outlines scene flow

tdd-automation:
  - Enforces RED-GREEN-REFACTOR for wizard
  - Ensures wizard has tests
  - Validates test coverage

Workflow:
  1. telegram-scenes-ULTIMATE designs wizard
  2. tdd-automation enforces RED: write failing test
  3. telegram-scenes-ULTIMATE implements (GREEN)
  4. tdd-automation validates tests pass
  5. continuous-optimizer suggests refactorings (REFACTOR)
  6. tdd-automation ensures tests still pass
```

### With task-tracker

```yaml
task-tracker:
  - Maintains TDD cycle status
  - Updates current_task.mdc with phase

tdd-automation:
  - Reports current phase (RED/GREEN/REFACTOR)
  - Updates task-tracker after each phase

Together: Complete visibility of TDD progress
```

## 🕉️ Sanskrit Wisdom Integration

Each TDD phase with spiritual guidance:

### RED Phase

_"न हि कश्चित्क्षणमपि जातु तिष्ठत्यकर्मकृत्"_
"Никто не может оставаться бездействующим даже мгновение" - Бхагавад-гита 3.5

→ Write the test NOW. Don't delay.

### GREEN Phase

_"कर्मण्येवाधिकारस्ते मा फलेषु कदाचन"_
"Твое право - на действие, но никогда - на его плоды" - Бхагавад-гита 2.47

→ Focus on making test pass, not on perfect code.

### REFACTOR Phase

_"योगः कर्मसु कौशलम्"_
"Йога есть искусство в действиях" - Бхагавад-гита 2.50

→ Refine your craft. Make code beautiful.

---

**Created**: 2025-01-11
**Version**: 1.0
**Status**: Production-ready ✅
**Philosophy**: "Tests first, code second. Always."
**Integration**: Works with task-tracker, telegram-scenes-ULTIMATE, continuous-optimizer, tdd-test-engineer agent
