---
name: docker-testing-expert
description: Docker testing expertise for local test environments with full MCP observability. Provides patterns, best practices, and workflows for isolated testing, integration tests, E2E tests, and CI/CD integration. Use when testing in Docker, debugging test environments, or setting up test infrastructure.
---

# 🧪 Docker Testing Expert - Тестирование в Изоляции

**Философия**: "Test in production-like environment, but locally and safely"

## 🎯 Core Knowledge

Этот Skill предоставляет полную экспертизу по:

- 🐳 Docker test environments (docker-compose.test.yml)
- 🧪 Unit, Integration, E2E testing в контейнерах
- 👁️ MCP observability ("глаза и руки" для агентов)
- 📊 Test analytics и coverage
- 🔄 CI/CD integration
- 🚀 Performance benchmarking

## 📐 Architecture Patterns

### Pattern 1: Isolated Test Environment

```yaml
Principle: Each test run starts from clean state

Implementation:
  docker-compose.test.yml:
    - Separate network (test-network)
    - Separate ports (3002, 5433, 6380)
    - Ephemeral volumes (deleted after tests)
    - Mock external services

Benefits: ✅ No interference with production
  ✅ Reproducible results
  ✅ Parallel execution possible
  ✅ Easy cleanup
```

### Pattern 2: Service Profiles

```yaml
Profiles for different scenarios:

default:
  services: [app-test, test-db, test-redis]
  use_case: Basic unit tests

ci:
  services: [+ test-runner]
  use_case: Full CI suite
  command: docker-compose --profile ci up --abort-on-container-exit

e2e:
  services: [+ e2e-test, telegram-mock]
  use_case: End-to-end testing with mocks

mcp:
  services: [+ mcp-observer]
  use_case: Full observability and control

observability:
  services: [+ log-aggregator]
  use_case: Centralized logging
```

### Pattern 3: Health Check Dependencies

```yaml
Ensure services start in correct order:

test-db:
  healthcheck:
    test: ['CMD-SHELL', 'pg_isready -U test_user']
    interval: 5s
    retries: 5

app-test:
  depends_on:
    test-db:
      condition: service_healthy # Waits for DB

Benefits: ✅ No race conditions
  ✅ Tests run only when ready
  ✅ Faster debugging
```

## 🧪 Test Execution Patterns

### Pattern 1: TDD in Docker

```typescript
// Workflow:
// 1. Start watch mode
docker-compose -f docker-compose.test.yml exec app-test npm run test:watch

// 2. Write failing test (RED)
describe('generateVideo', () => {
  it('should validate input params', async () => {
    await expect(generateVideo({})).rejects.toThrow('Invalid params');
  });
});

// 3. Implement minimal code (GREEN)
export async function generateVideo(params: VideoParams) {
  if (!params || !params.prompt) {
    throw new Error('Invalid params');
  }
  // ... implementation
}

// 4. Refactor (REFACTOR)
export async function generateVideo(params: VideoParams) {
  validateParams(params);  // Extract validation
  // ... rest of implementation
}

// Tests re-run automatically in watch mode
```

### Pattern 2: Integration Tests with Real DB

```typescript
// tests/integration/database.test.ts

import { supabase } from '../../src/services/supabase/client'

describe('Database Integration', () => {
  beforeEach(async () => {
    // Clean state before each test
    await supabase.from('users').delete().neq('id', '')
  })

  it('should create and retrieve user', async () => {
    // Create user
    const { data: created } = await supabase
      .from('users')
      .insert({ telegram_id: '12345', balance: 100 })
      .select()
      .single()

    expect(created).toBeDefined()
    expect(created.balance).toBe(100)

    // Retrieve user
    const { data: retrieved } = await supabase
      .from('users')
      .select()
      .eq('telegram_id', '12345')
      .single()

    expect(retrieved.id).toBe(created.id)
  })
})

// Run in Docker:
// docker-compose -f docker-compose.test.yml exec app-test npm run test:integration
```

### Pattern 3: E2E Tests with Telegram Mock

```typescript
// tests/e2e/neuroPhoto.e2e.test.ts

import { TelegramMockClient } from '../mocks/telegram-client'

describe('NeuroPhoto E2E', () => {
  let telegram: TelegramMockClient

  beforeAll(async () => {
    telegram = new TelegramMockClient('http://telegram-mock:8080')
  })

  it('should complete full photo generation flow', async () => {
    // Step 1: Start wizard
    await telegram.sendCommand('/neurophoto')
    expect(await telegram.getLastMessage()).toContain('Выберите модель')

    // Step 2: Select model
    await telegram.pressButton('flux_pro')
    expect(await telegram.getLastMessage()).toContain('Введите промпт')

    // Step 3: Send prompt
    await telegram.sendMessage('Beautiful sunset over mountains')
    expect(await telegram.getLastMessage()).toContain('Генерация началась')

    // Step 4: Wait for completion
    const result = await telegram.waitForImage({ timeout: 30000 })
    expect(result).toBeDefined()
    expect(result.caption).toContain('Ваше изображение готово')
  })
})

// Run E2E:
// docker-compose -f docker-compose.test.yml --profile e2e up --abort-on-container-exit
```

## 👁️ MCP Observability Patterns

### Pattern 1: Real-Time Log Monitoring

```bash
# Monitor application logs with filtering
docker-compose -f docker-compose.test.yml logs -f app-test | \
  grep -E "ERROR|WARN|Test.*failed"

# Count errors during test run
docker-compose -f docker-compose.test.yml logs app-test | \
  grep -c ERROR

# Extract test results
docker-compose -f docker-compose.test.yml logs app-test | \
  sed -n '/Test Suites:/,/Tests:/p'
```

### Pattern 2: Resource Monitoring

```bash
# Watch resource usage during tests
docker stats 999-multibots-test --format \
  "CPU: {{.CPUPerc}} | MEM: {{.MemUsage}} | NET: {{.NetIO}}"

# Detect memory leaks
docker stats 999-multibots-test --no-stream > stats_before.txt
# ... run tests ...
docker stats 999-multibots-test --no-stream > stats_after.txt
diff stats_before.txt stats_after.txt
```

### Pattern 3: Network Debugging

```bash
# Test service connectivity
docker-compose -f docker-compose.test.yml exec app-test nc -zv test-db 5432

# DNS resolution
docker-compose -f docker-compose.test.yml exec app-test nslookup test-db

# Check open connections
docker-compose -f docker-compose.test.yml exec app-test netstat -tulpn
```

## 📊 Test Analytics Patterns

### Pattern 1: Coverage Tracking

⚠️ **`coverage/coverage-summary.json` здесь не появляется — и никогда не
появлялся.** Репортёр `json-summary` не настроен ни в одном конфиге дерева, и
файла с таким именем нет в истории git. Скрипта `test:coverage` в корневом
`package.json` тоже нет. Прежний рецепт (читать `.total.lines.pct` через `jq`
и ронять сборку по порогу через `bc -l`) убран: читать было нечего.

Единственная существующая команда с покрытием считает только `src/inngest_app`:

```bash
# The only coverage script in package.json (scope: src/inngest_app).
# Prints a text table to stdout; it writes no machine-readable .total summary.
docker-compose -f docker-compose.test.yml exec app-test \
  npm run test:inngest:coverage
```

Нужен машиночитаемый итог для порога — сначала добавьте `json-summary` в
`coverage.reporter` того конфига, по которому реально идёт нужный прогон, и
только после этого читайте появившийся файл.

### Pattern 2: Performance Benchmarking

```typescript
// tests/performance/benchmark.test.ts

describe('Performance Benchmarks', () => {
  it('should generate image in under 5 seconds', async () => {
    const start = Date.now()

    await generateImage({
      prompt: 'Test prompt',
      model: 'flux_schnell',
    })

    const duration = Date.now() - start

    expect(duration).toBeLessThan(5000)
    console.log(`Generation time: ${duration}ms`)
  })
})

// Run benchmarks:
// docker-compose -f docker-compose.test.yml exec app-test npm run test:benchmark
```

### Pattern 3: Test Result Analysis

```bash
# Run tests and save results
docker-compose -f docker-compose.test.yml exec app-test \
  npm test -- --json --outputFile=/app/test-results/results.json

# Extract failed tests
docker-compose -f docker-compose.test.yml exec app-test \
  cat /app/test-results/results.json | \
  jq '.testResults[].assertionResults[] | select(.status == "failed")'

# Generate summary
docker-compose -f docker-compose.test.yml exec app-test \
  cat /app/test-results/results.json | \
  jq '{
    total: .numTotalTests,
    passed: .numPassedTests,
    failed: .numFailedTests,
    duration: .testResults[].perfStats.runtime | add
  }'
```

## 🔄 CI/CD Integration Patterns

### Pattern 1: Pre-Commit Testing

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "Running pre-commit tests..."

# Start test environment
docker-compose -f docker-compose.test.yml up -d --quiet-pull

# Wait for healthy
until docker-compose -f docker-compose.test.yml exec -T test-db pg_isready; do
  sleep 1
done

# Run tests
docker-compose -f docker-compose.test.yml exec -T app-test npm test

EXIT_CODE=$?

# Cleanup
docker-compose -f docker-compose.test.yml down -v

if [ $EXIT_CODE -ne 0 ]; then
  echo "❌ Tests failed. Commit blocked."
  exit 1
fi

echo "✅ Tests passed"
exit 0
```

### Pattern 2: GitHub Actions Integration

```yaml
# .github/workflows/test.yml

name: Docker Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Start test environment
        run: |
          docker-compose -f docker-compose.test.yml \
            --profile ci up -d

      - name: Wait for services
        run: |
          timeout 60 sh -c 'until docker-compose -f docker-compose.test.yml exec -T test-db pg_isready; do sleep 2; done'

      - name: Run tests
        run: |
          docker-compose -f docker-compose.test.yml \
            exec -T app-test npm run test:ci

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json

      - name: Cleanup
        if: always()
        run: |
          docker-compose -f docker-compose.test.yml down -v
```

### Pattern 3: Pre-Deployment Validation

```bash
#!/bin/bash
# TEMPLATE ONLY. scripts/pre-deploy-tests.sh does NOT exist in this repository
# and never did - copy this text into scripts/ yourself if you want the flow.

echo "🧪 Running pre-deployment validation..."

# Full test suite
docker-compose -f docker-compose.test.yml \
  --profile ci \
  --profile e2e \
  up --abort-on-container-exit --exit-code-from test-runner

EXIT_CODE=$?

# Extract reports
docker cp 999-multibots-test:/app/coverage ./coverage/
docker cp 999-multibots-test:/app/test-results ./test-results/

# Cleanup
docker-compose -f docker-compose.test.yml down -v

if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ All tests passed. Safe to deploy."
  # The script moved out of the repository root into scripts/deploy/.
  # It builds locally and ships over SSH to 188.137.250.69; production today is
  # deployed by Railway on merge to main (see CLAUDE.md, "Деплой (Railway)").
  ./scripts/deploy/deploy-local-build.sh
else
  echo "❌ Tests failed. Deployment blocked."
  exit 1
fi
```

## 🚨 Debugging Patterns

### Pattern 1: Test Failure Investigation

```bash
# Step 1: Run single test with debug
docker-compose -f docker-compose.test.yml exec app-test \
  npm test -- --testNamePattern="should validate input" --verbose

# Step 2: Check logs
docker-compose -f docker-compose.test.yml logs app-test | \
  sed -n '/should validate input/,/FAIL/p'

# Step 3: Interactive debugging
docker-compose -f docker-compose.test.yml exec app-test sh
# Inside container:
# - npm test -- --inspect-brk
# - node --inspect-brk node_modules/.bin/jest
```

### Pattern 2: Database State Inspection

```bash
# Check database state after test
docker-compose -f docker-compose.test.yml exec test-db \
  psql -U test_user -d test_db -c "
    SELECT * FROM users ORDER BY created_at DESC LIMIT 10;
  "

# Count records
docker-compose -f docker-compose.test.yml exec test-db \
  psql -U test_user -d test_db -c "
    SELECT
      table_name,
      (SELECT COUNT(*) FROM information_schema.columns WHERE table_name=t.table_name) as columns,
      (SELECT pg_relation_size(quote_ident(t.table_name))) as size
    FROM information_schema.tables t
    WHERE table_schema='public';
  "
```

### Pattern 3: Network Issues

```bash
# Trace network path
docker-compose -f docker-compose.test.yml exec app-test traceroute test-db

# Check DNS
docker-compose -f docker-compose.test.yml exec app-test cat /etc/resolv.conf

# Test connection with verbose output
docker-compose -f docker-compose.test.yml exec app-test \
  curl -v http://test-db:5432
```

## 🎯 Best Practices

### 1. Always Start Clean

```bash
# Before tests
docker-compose -f docker-compose.test.yml down -v
docker-compose -f docker-compose.test.yml up -d

# Ensures:
# ✅ No stale data
# ✅ Consistent results
# ✅ Reproducible failures
```

### 2. Use Health Checks

```dockerfile
# In Dockerfile.optimized
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3001/health', ...)"
```

```yaml
# In docker-compose.test.yml
depends_on:
  test-db:
    condition: service_healthy # Wait for healthy
```

### 3. Isolate Test Data

```sql
-- tests/fixtures/db/init.sql

-- Create test data
INSERT INTO users (telegram_id, balance) VALUES
  ('test_user_1', 1000),
  ('test_user_2', 500);

-- Create test assets
INSERT INTO assets (user_id, type, url) VALUES
  (1, 'image', 'test_image_1.png'),
  (2, 'video', 'test_video_1.mp4');
```

### 4. Monitor Resource Usage

```bash
# Set resource limits in docker-compose.test.yml
services:
  app-test:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### 5. Parallel Test Execution

```json
// package.json
{
  "scripts": {
    "test": "jest",
    "test:parallel": "jest --maxWorkers=4",
    "test:ci": "jest --ci --coverage --maxWorkers=2"
  }
}
```

## 🎭 Integration with Other Skills/Agents

### With tdd-test-engineer

```yaml
tdd-test-engineer:
  - Writes tests following TDD

docker-testing-expert:
  - Provides test environment
  - Runs tests in isolation
  - Reports results

Workflow: 1. TDD engineer writes test (RED)
  2. Docker runs test → fails
  3. TDD engineer implements feature (GREEN)
  4. Docker runs test → passes
  5. TDD engineer refactors (REFACTOR)
  6. Docker validates all tests still pass
```

### With continuous-optimizer

```yaml
continuous-optimizer:
  - Identifies slow tests
  - Suggests performance improvements

docker-testing-expert:
  - Measures test execution time
  - Profiles resource usage
  - Provides benchmarking data

Together: Optimize test suite performance
```

### With code-reviewer

```yaml
code-reviewer:
  - Requires tests to pass

docker-testing-expert:
  - Runs tests in clean environment
  - Provides coverage report
  - Validates no flaky tests

Together: Ensure code quality before merge
```

## 📚 Common Workflows

### Workflow 1: Local Development with Tests

```bash
# Terminal 1: Start test environment
docker-compose -f docker-compose.test.yml up

# Terminal 2: Watch mode
docker-compose -f docker-compose.test.yml exec app-test npm run test:watch

# Terminal 3: Monitor resources
watch -n 5 'docker stats --no-stream'

# Develop with instant feedback
# Tests re-run on file changes
```

### Workflow 2: Full CI Validation

Скрипта `scripts/pre-deploy-tests.sh` в дереве нет и не было: выше в Pattern 3
лежит его заготовка, а не готовый файл. Полный прогон перед релизом
запускается одной командой:

```bash
# scripts/verify.cjs - 13 steps judged by exit code only, ~100 s:
# typecheck, lint, prettier, build, 3 repo guards, security scan, audit,
# test:bun, test:player, test:vitest, test-gate.
# GitHub Actions does not run in this repository, so this IS the CI gate.
bun run verify
```

Однокнопочной докерной обвязки для этого нет. Профиль `ci` из
`docker-compose.test.yml` тоже не заменит её как есть: он запускает
`npm run test:ci`, а такого скрипта в `package.json` нет и не было.

### Workflow 3: Performance Regression Testing

```bash
# Baseline (before changes)
docker-compose -f docker-compose.test.yml up -d
docker-compose -f docker-compose.test.yml exec app-test \
  npm run test:benchmark > baseline.txt

# Make changes
# ... code modifications ...

# Measure again
docker-compose -f docker-compose.test.yml up -d --build
docker-compose -f docker-compose.test.yml exec app-test \
  npm run test:benchmark > after.txt

# Compare
diff baseline.txt after.txt
```

---

**Created**: 2025-01-11
**Version**: 1.0
**Status**: Production-ready ✅
**Philosophy**: "Test in production-like environment, locally and safely"
**Integration**: Works with docker-test-controller agent for full MCP control
