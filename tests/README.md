# Video Models Testing Guide

## Quick Start

```bash
# Run all tests
npm run test:vitest

# Run specific test file
npm run test:vitest -- tests/unit/videoModels.test.ts

# Run with coverage
npm run test:vitest -- --coverage

# Run in watch mode
npm run test:vitest -- --watch

# Run manual test suite
npm run test:model -- validate
```

---

## Test Structure

```
tests/
├── unit/                          # Unit tests (fast, isolated)
│   └── videoModels.test.ts       # Model config & pricing (34 tests)
├── integration/                   # Integration tests (mocked APIs)
│   └── kieAiProvider.test.ts     # API integration (27 tests)
├── e2e/                           # End-to-end tests (full workflows)
│   └── videoGeneration.test.ts   # Complete flows (23 tests)
├── video-models-test.ts          # Manual testing suite
├── TEST_COVERAGE_REPORT.md       # Detailed coverage report
└── README.md                      # This file
```

---

## TDD Workflow

### 🔴 RED Phase (Current)
**Status**: 20/84 tests failing (expected)

```bash
# Run tests to see failures
npm run test:vitest -- tests/unit/videoModels.test.ts
npm run test:vitest -- tests/integration/kieAiProvider.test.ts
npm run test:vitest -- tests/e2e/videoGeneration.test.ts
```

### 🟢 GREEN Phase (Next)
**Goal**: Make all tests pass

1. Fix unit test failures:
   - Add duration validation (negative/zero)
   - Fix image-to-video model count
   - Adjust runway-aleph default pricing

2. Fix integration test failures:
   - Update Sora pricing calculations
   - Add proper timeout handling
   - Fix Veo 3 cost calculation

3. Fix E2E test failures:
   - Improve error message handling
   - Fix response format consistency
   - Add proper mock configurations

### 🔵 REFACTOR Phase (Final)
**Goal**: Achieve 80%+ coverage, clean code

1. Refactor duplicate code
2. Add performance benchmarks
3. Document test patterns
4. Achieve coverage targets

---

## Test Categories

### Unit Tests (34 tests)
**Fast, isolated, no external dependencies**

```bash
npm run test:vitest -- tests/unit/videoModels.test.ts
```

**What's tested**:
- Model configuration validation
- Pricing calculations (fixed & dynamic)
- Duration support validation
- Model filtering (text/image)
- Info formatting
- Category validation
- Price consistency

**Coverage**: 30/34 passing (88%)

---

### Integration Tests (27 tests)
**Mocked APIs, test provider integration**

```bash
npm run test:vitest -- tests/integration/kieAiProvider.test.ts
```

**What's tested**:
- KieAiProvider initialization
- Veo 3 generation (text & image)
- Runway Aleph generation
- Sora 2 generation
- Status checking
- Polling mechanism
- Error handling & retries
- Cost calculations

**Coverage**: 21/27 passing (78%)

---

### E2E Tests (23 tests)
**Complete workflows, full integration**

```bash
npm run test:vitest -- tests/e2e/videoGeneration.test.ts
```

**What's tested**:
- Complete text-to-video flow
- Complete image-to-video flow
- Error scenarios (rate limit, NSFW, etc.)
- Multi-model workflows
- Aspect ratio handling
- Localization (EN/RU)
- Webhook integration
- Performance & concurrency

**Coverage**: 13/23 passing (57%)

---

## Manual Testing Suite

For testing against real APIs (costs money!):

```bash
# Validate all configurations (no API calls)
npm run test:model -- validate

# Test webhook endpoints
npm run test:model -- webhooks

# Test single model (REAL API CALL - COSTS MONEY!)
npm run test:model -- test --model=veo3_fast --type=text --mock

# Batch test in mock mode
npm run test:model -- batch
```

---

## Common Issues

### Issue: Tests timeout
**Solution**: Add timeout configuration
```typescript
it('long running test', async () => {
  // test code
}, { timeout: 10000 })
```

### Issue: Mock not working
**Solution**: Clear mocks in beforeEach
```typescript
beforeEach(() => {
  vi.clearAllMocks()
})
```

### Issue: Environment variables missing
**Solution**: Load .env file
```typescript
import * as dotenv from 'dotenv'
dotenv.config()
```

### Issue: Coverage too low
**Solution**: Add edge case tests
```typescript
describe('Edge Cases', () => {
  it('should handle null input', () => {
    // test null handling
  })
})
```

---

## Test Writing Guidelines

### ✅ Good Test
```typescript
describe('getModelPriceInStars', () => {
  it('should return 40 stars for veo3_fast', () => {
    // Arrange
    const modelId = 'veo3_fast'

    // Act
    const price = getModelPriceInStars(modelId)

    // Assert
    expect(price).toBe(40)
  })
})
```

### ❌ Bad Test
```typescript
it('test', () => {
  expect(getModelPriceInStars('veo3_fast')).toBe(40)
  expect(getModelPriceInStars('veo3')).toBe(202)
  expect(getModelPriceInStars('sora-2')).toBe(2500)
  // Testing multiple things - hard to debug
})
```

---

## Coverage Targets

```
Statements:  ≥ 80%
Branches:    ≥ 75%
Functions:   ≥ 80%
Lines:       ≥ 80%
```

Check coverage:
```bash
npm run test:vitest -- --coverage
```

---

## Tested Models

### Text-to-Video (10 models):
- veo3_fast (40⭐)
- veo3 (202⭐)
- runway-aleph (dynamic)
- sora-2 (2500⭐)
- sora-2-pro (3333⭐)
- kling-v1.6-pro (9⭐)
- ray-v2 (16⭐)
- hunyuan-video-fast (18⭐)
- wan-text-to-video (23⭐)
- minimax (46⭐)

### Image-to-Video (13 models):
- veo3_fast (40⭐)
- runway-aleph (dynamic)
- kling-v1.6-pro (9⭐)
- ray-v2 (16⭐)
- wan-image-to-video (23⭐)
- minimax (46⭐)
- 7 additional models

---

## CI/CD Integration

Tests should run automatically on:
- Push to `production` branch
- Pull request creation
- Before deployment

Add to `.github/workflows/test.yml`:
```yaml
- name: Run Tests
  run: npm run test:vitest -- --run
```

---

## Resources

- **TDD Agent**: `.claude/agents/tdd-test-engineer.md`
- **Coverage Report**: `tests/TEST_COVERAGE_REPORT.md`
- **Source Code**: `src/services/videoModels.ts`, `src/services/video-providers/KieAiProvider.ts`
- **Vitest Docs**: https://vitest.dev

---

## Next Steps

1. **Fix RED phase failures** (20 tests)
2. **Achieve GREEN phase** (all tests passing)
3. **REFACTOR for quality** (80%+ coverage)
4. **Add CI/CD integration**
5. **Document patterns**

---

**Last Updated**: 2025-10-16
**Current Phase**: 🔴 RED
**Tests**: 64/84 passing (76%)
