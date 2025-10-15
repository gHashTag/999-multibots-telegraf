# 🧪 AI Photoshop Dialog Mode Test Suite

This comprehensive test suite validates the AI Photoshop dialog mode functionality, covering all aspects from basic workflow to performance and regression prevention.

## 📁 Test Suite Structure

```
tests/ai-photoshop/
├── dialog-mode.test.ts              # Core dialog workflow tests
├── schema-validation.test.ts        # Zod schema validation tests
├── performance.test.ts              # Performance and load testing
├── integration/
│   └── regression-prevention.test.ts # Regression and bug prevention
├── fixtures/
│   └── test-data.ts                 # Centralized test data and mocks
└── run-dialog-mode-tests.ts         # Test runner script
```

## 🎯 Test Coverage

### 1. Dialog Mode Workflow Tests (`dialog-mode.test.ts`)

**Purpose**: Tests the complete dialog mode workflow for AI Photoshop

**Coverage**:
- ✅ Dialog mode initialization after first successful result
- ✅ Session state preservation during dialog mode
- ✅ Multi-turn conversation flow handling
- ✅ Text prompt processing for photo improvements
- ✅ Context preservation across interactions
- ✅ Memory management with result history limits (10 results max)
- ✅ Session cleanup on completion and errors
- ✅ Integration with multi-photo workflow
- ✅ Error recovery and fallback scenarios

**Key Test Scenarios**:
```typescript
// Dialog mode initialization
it('should enter dialog mode after first successful result')

// Multi-turn conversations
it('should handle text prompt for photo improvement')
it('should preserve conversation context across interactions')

// Memory management
it('should limit saved results to prevent memory bloat')
it('should handle memory cleanup on session reset')

// Error handling
it('should recover from corrupted dialog mode state')
it('should handle concurrent dialog mode access')
```

### 2. Schema Validation Tests (`schema-validation.test.ts`)

**Purpose**: Comprehensive validation of Zod schemas for AI Photoshop

**Coverage**:
- ✅ SeeDream4 input schema validation
- ✅ Prompt validation (length, format, special characters)
- ✅ Size validation (1K, 2K, 4K, custom)
- ✅ Multi-image validation (URLs, counts, consistency)
- ✅ Telegram user validation (ID format, optional fields)
- ✅ Aspect ratio validation
- ✅ Response and error schema validation
- ✅ Dialog mode specific validation requirements
- ✅ Performance validation for large inputs

**Key Test Scenarios**:
```typescript
// Prompt validation
it('should validate correct prompt lengths')
it('should reject prompts that are too short/long')
it('should handle special characters and emojis')

// Multi-image validation
it('should validate multiple image inputs')
it('should enforce max_images constraints')
it('should validate image URL formats')

// Custom size validation
it('should require width and height for custom size')
it('should validate custom dimensions constraints')

// Performance
it('should validate large inputs efficiently')
it('should handle rapid successive validations')
```

### 3. Performance Tests (`performance.test.ts`)

**Purpose**: Validates performance characteristics and optimization

**Coverage**:
- ✅ Multi-image processing performance benchmarks
- ✅ Memory usage optimization tests
- ✅ Session state performance validation
- ✅ Concurrent dialog mode handling
- ✅ Large dataset processing efficiency
- ✅ Cost calculation performance
- ✅ API response time simulation
- ✅ Load testing scenarios

**Key Test Scenarios**:
```typescript
// Multi-image performance
it('should handle single image processing efficiently')
it('should handle maximum image count (10 images) efficiently')
it('should optimize memory usage for large images')

// Session performance
it('should handle rapid session state changes efficiently')
it('should handle large dialog history efficiently')
it('should handle concurrent session access efficiently')

// Load testing
it('should handle burst load of dialog mode interactions')
it('should maintain performance under sustained load')
```

### 4. Regression Prevention Tests (`integration/regression-prevention.test.ts`)

**Purpose**: Prevents known bugs from reoccurring and catches new regressions

**Coverage**:
- ✅ Critical bug fix verification
- ✅ Schema validation regression tests
- ✅ Session state management regressions
- ✅ Error boundary regression tests
- ✅ Dialog mode specific regressions
- ✅ Performance regression prevention

**Key Test Scenarios**:
```typescript
// Critical bug fixes
it('REGRESSION: should preserve user prompt during multi-photo processing')
it('REGRESSION: should preserve size selection during multi-photo workflow')
it('REGRESSION: should handle empty morphingImages array gracefully')

// Dialog mode regressions
it('REGRESSION: should preserve dialog history across improvements')
it('REGRESSION: should handle dialog mode with corrupted session data')
it('REGRESSION: should limit dialog history to prevent memory bloat')

// Performance regressions
it('REGRESSION: should not cause memory leaks in multi-photo processing')
it('REGRESSION: should handle dialog mode memory efficiently')
```

## 🏗️ Test Architecture

### Mock Context Factory

The test suite includes a sophisticated mock context factory that creates realistic test scenarios:

```typescript
export function createMockContext(sessionState: any = MOCK_SESSION_STATES.initial): MyContext {
  return {
    from: MOCK_USER_DATA,
    chat: { id: parseInt(MOCK_USER_DATA.telegram_id), type: 'private' },
    session: { ...sessionState },
    telegram: {
      getFile: jest.fn(),
      getFileLink: jest.fn(),
      editMessageText: jest.fn(),
      deleteMessage: jest.fn()
    },
    reply: jest.fn(),
    editMessageText: jest.fn(),
    deleteMessage: jest.fn(),
    answerCbQuery: jest.fn(),
    scene: {
      enter: jest.fn(),
      leave: jest.fn(),
      reenter: jest.fn()
    }
  }
}
```

### Test Data Fixtures

Centralized test data ensures consistency across all tests:

```typescript
export const MOCK_SESSION_STATES = {
  initial: { /* clean state */ },
  model_selected: { /* model chosen */ },
  style_selected: { /* style chosen */ },
  custom_prompt: { /* awaiting custom prompt */ },
  ready_to_process: { /* ready for processing */ }
}

export const MOCK_PERFORMANCE_METRICS = {
  processing_times: {
    '1K_single': 30000,
    '1K_multi_2': 55000,
    '2K_single': 45000,
    '4K_single': 90000
  }
}
```

## 🚀 Running Tests

### Run All Dialog Mode Tests
```bash
# Using the test runner
npm run test:ai-photoshop-dialog

# Or directly with Node
node tests/ai-photoshop/run-dialog-mode-tests.ts
```

### Run Individual Test Files
```bash
# Dialog workflow tests
npm test tests/ai-photoshop/dialog-mode.test.ts

# Schema validation tests
npm test tests/ai-photoshop/schema-validation.test.ts

# Performance tests
npm test tests/ai-photoshop/performance.test.ts

# Regression tests
npm test tests/ai-photoshop/integration/regression-prevention.test.ts
```

### Run with Coverage
```bash
npm test tests/ai-photoshop/ -- --coverage
```

## 📊 Test Metrics and Expectations

### Performance Benchmarks

| Test Scenario | Expected Time | Memory Limit |
|---------------|---------------|--------------|
| Single Image (1K) | < 30ms | < 50MB |
| Multi Image (2x1K) | < 55ms | < 85MB |
| Dialog History (10 results) | < 100ms | < 10MB |
| Schema Validation (100 inputs) | < 100ms | N/A |
| Session Cleanup | < 10ms | N/A |

### Coverage Goals

- **Statements**: >90%
- **Branches**: >85%
- **Functions**: >90%
- **Lines**: >90%

## 🔧 Test Configuration

### Jest Configuration
```json
{
  "testMatch": [
    "**/tests/ai-photoshop/**/*.test.ts"
  ],
  "setupFilesAfterEnv": [
    "<rootDir>/tests/setup.ts"
  ],
  "testTimeout": 30000,
  "maxWorkers": 4
}
```

### Environment Setup
```typescript
// tests/setup.ts
import { jest } from '@jest/globals'

// Mock Telegram APIs
global.fetch = jest.fn()

// Mock performance.now for consistent testing
jest.spyOn(performance, 'now').mockImplementation(() => Date.now())
```

## 🚨 Known Issues and Limitations

### Test Environment Limitations
- File system operations are mocked
- Network requests are simulated
- Memory measurements may vary between environments
- Performance tests are relative to test environment

### Future Improvements
- [ ] Add E2E tests with real Telegram Bot API
- [ ] Implement visual regression testing for generated images
- [ ] Add stress testing for production-like loads
- [ ] Implement automated performance regression detection

## 📚 Test Writing Guidelines

### 1. Test Naming Convention
```typescript
describe('Feature Name', () => {
  describe('Specific Functionality', () => {
    it('should do something specific when condition is met', () => {
      // Test implementation
    })
  })
})
```

### 2. Arrange-Act-Assert Pattern
```typescript
it('should process dialog improvement correctly', () => {
  // Arrange
  const mockContext = createMockContext(MOCK_SESSION_STATES.initial)
  const improvementPrompt = 'make it brighter'

  // Act
  mockContext.session.aiPhotoshopPrompt = improvementPrompt

  // Assert
  expect(mockContext.session.aiPhotoshopPrompt).toBe(improvementPrompt)
})
```

### 3. Error Testing
```typescript
it('should handle invalid input gracefully', () => {
  const invalidInput = { /* malformed data */ }

  expect(() => {
    validateSeeDream4Input(invalidInput)
  }).not.toThrow()

  const result = validateSeeDream4Input(invalidInput)
  expect(result.success).toBe(false)
})
```

### 4. Performance Testing
```typescript
it('should complete operation within time limit', async () => {
  const startTime = performance.now()

  // Perform operation
  await someAsyncOperation()

  const endTime = performance.now()
  const duration = endTime - startTime

  expect(duration).toBeLessThan(EXPECTED_TIME_MS)
})
```

## 🎯 Success Criteria

The test suite is considered successful when:

1. **All tests pass** consistently across different environments
2. **Coverage targets** are met (>90% statements, >85% branches)
3. **Performance benchmarks** are within expected limits
4. **No regressions** are detected in critical functionality
5. **Error scenarios** are properly handled and tested
6. **Memory usage** remains within acceptable bounds
7. **Dialog mode workflow** operates correctly end-to-end

## 🤝 Contributing

When adding new tests:

1. Follow the established patterns in existing test files
2. Use the centralized mock data from `fixtures/test-data.ts`
3. Add performance expectations for new functionality
4. Include regression tests for any bug fixes
5. Update this documentation with new test coverage

---

**Note**: This test suite is designed to be comprehensive and maintainable. Each test should be independent, repeatable, and provide clear failure messages when issues occur.