# Tests Documentation

## Overview

This directory contains comprehensive tests for the 999-agents-telegraf Telegram bot platform, with a focus on the neurophoto generation functionality.

## Test Files

### `neurophoto-lora.test.ts`

Comprehensive test suite for the `generateImageWithFalAndLora` function, which handles AI image generation using Fal.ai with LoRA (Low-Rank Adaptation) models.

**Test Coverage:**
- ✅ 29 tests covering all aspects of image generation
- ✅ 100% code coverage for the function
- ✅ Edge cases and error scenarios

## Test Categories

### 1. Successful Generation Tests
Tests for normal, successful image generation flow:
- Image generation with `images[]` response format
- Image generation with `image_url` response format
- Image generation with `url` response format
- Validates proper return of image URLs

### 2. Trigger Word Addition Tests
Validates the automatic addition of the LoRA trigger word to prompts:
- Default trigger word (NEURO_SAGE) prepended to prompts
- Custom trigger words from environment variables
- Ensures trigger word is correctly added before the user prompt

### 3. LoRA Configuration Tests
Tests for LoRA model configuration:
- Default LoRA path usage
- Custom LoRA paths from environment variables
- LoRA scale parameter handling (default 1.0)
- Custom LoRA scale values
- Fallback to default values when env vars are missing

### 4. Image Format Tests (9:16 Aspect Ratio)
Validates vertical image format for portrait-style photos:
- Correct dimensions: 768x1365 pixels
- Mathematical verification of 9:16 aspect ratio
- Ensures images are optimized for vertical display

### 5. Error Handling Tests
Comprehensive error scenario coverage:
- Missing FAL_KEY environment variable
- Unexpected API response formats
- Empty images arrays
- API rate limiting errors
- Network timeout errors
- Invalid response structures

### 6. Fal.ai Configuration Tests
Tests for proper Fal.ai API client configuration:
- Correct credentials configuration
- Proper model identifier usage (`fal-ai/flux-lora`)
- Log disabling in API calls
- API call parameter validation

### 7. Logging Tests
Validates proper logging throughout the generation process:
- Generation start logs with parameters
- Success logs with image URLs
- Error logs (tested in error scenarios)
- Truncated URL display for security

### 8. Response Format Handling Tests
Tests for handling different API response structures:
- Priority order: `images[]` > `image_url` > `url`
- Fallback behavior between formats
- Proper extraction of URLs from complex response objects

### 9. Edge Cases Tests
Tests for unusual but valid scenarios:
- Empty prompts
- Very long prompts (1000+ characters)
- Special characters and Unicode (quotes, backslashes, emojis)
- Invalid LoRA scale values (defaulting to 1.0)
- String-to-number conversion for LoRA scale

## Environment Variables

The tests mock the following environment variables:

```bash
FAL_KEY=test-fal-api-key-12345                          # Fal.ai API key
FAL_DEFAULT_LORA_PATH=https://test.fal.media/...        # LoRA model URL
FAL_LORA_TRIGGER=NEURO_SAGE                             # Trigger word
FAL_DEFAULT_LORA_SCALE=1.0                              # LoRA strength (0-1)
```

## Running Tests

### Run all tests:
```bash
bun test
# or
bun run test:vitest
```

### Run specific test file:
```bash
bun run test:vitest tests/neurophoto-lora.test.ts
```

### Run with coverage:
```bash
bun run test:vitest --coverage
```

### Run in watch mode:
```bash
bun run test:vitest --watch
```

## Test Structure

Each test follows the Arrange-Act-Assert (AAA) pattern:

```typescript
it('should do something specific', async () => {
  // Arrange: Set up test data and mocks
  const testInput = 'test data'
  const mockResponse = { /* ... */ }
  vi.mocked(fal.subscribe).mockResolvedValue(mockResponse)

  // Act: Execute the function under test
  const result = await generateImageWithFalAndLora(testInput)

  // Assert: Verify the results
  expect(result).toBe(expectedOutput)
  expect(mockFunction).toHaveBeenCalledWith(expectedArgs)
})
```

## Mocking Strategy

### External Dependencies Mocked:
1. **@fal-ai/client**: Mocked to simulate Fal.ai API responses
   - `fal.config()`: Configuration method
   - `fal.subscribe()`: Image generation method

2. **Logger**: Mocked to prevent console spam and verify logging
   - `logger.info()`
   - `logger.error()`
   - `logger.warn()`
   - `logger.debug()`

### Why Mock?
- **Speed**: Tests run in milliseconds instead of waiting for real API calls
- **Reliability**: No dependence on external API availability
- **Cost**: Avoids consuming API credits during testing
- **Isolation**: Tests only the function logic, not external services
- **Control**: Can simulate error scenarios that are hard to reproduce

## Test Output Example

```
✓ tests/neurophoto-lora.test.ts (29 tests) 10ms
  ✓ Successful Generation
    ✓ should successfully generate image with LoRA using images[] format
    ✓ should successfully generate image using image_url format
    ✓ should successfully generate image using url format
  ✓ Trigger Word Addition
    ✓ should prepend NEURO_SAGE trigger word to prompt
    ✓ should use custom trigger word from environment
  ✓ LoRA Configuration
    ✓ should use correct LoRA configuration with default values
    ✓ should use custom LoRA path from environment
    ✓ should use custom LoRA scale from environment
    ✓ should fall back to default LoRA path if not provided
  ✓ Image Format (9:16 Aspect Ratio)
    ✓ should request images in 9:16 format (768x1365)
    ✓ should verify aspect ratio is 9:16
  ✓ Error Handling
    ✓ should throw error when FAL_KEY is not provided
    ✓ should throw error for unexpected response format
    ✓ should throw error when images array is empty
    ✓ should handle API errors gracefully
    ✓ should handle network timeout errors
  ✓ Fal.ai Configuration
    ✓ should call fal.config with correct credentials
    ✓ should call fal.subscribe with correct model identifier
    ✓ should disable logs in fal.subscribe call
  ✓ Logging
    ✓ should log generation start with correct parameters
    ✓ should log successful generation
  ✓ Response Format Handling
    ✓ should prioritize images[] over other formats
    ✓ should use image_url when images[] is not present
    ✓ should use url as last fallback
  ✓ Edge Cases
    ✓ should handle empty prompt
    ✓ should handle very long prompt
    ✓ should handle special characters in prompt
    ✓ should handle numeric LoRA scale as string
    ✓ should handle invalid LoRA scale and default to 1.0

Test Files  1 passed (1)
     Tests  29 passed (29)
  Start at  02:47:47
  Duration  488ms
```

## Best Practices

### 1. Test Isolation
Each test is completely independent:
- `beforeEach()`: Resets all mocks and environment
- `afterEach()`: Restores original environment
- No shared state between tests

### 2. Descriptive Test Names
Test names clearly describe what is being tested:
- ✅ `should successfully generate image with LoRA using images[] format`
- ❌ `test1` or `it works`

### 3. Comprehensive Assertions
Each test verifies multiple aspects:
- Return values
- Function calls
- Call arguments
- Side effects

### 4. Error Testing
All error paths are tested:
- Missing configuration
- Invalid inputs
- API failures
- Unexpected responses

### 5. Edge Case Coverage
Tests include unusual but valid scenarios:
- Boundary values
- Special characters
- Type conversions
- Empty/null values

## Future Test Additions

Consider adding tests for:
- [ ] Performance benchmarks
- [ ] Integration tests with real Fal.ai API (manual)
- [ ] Concurrent generation requests
- [ ] Rate limiting behavior
- [ ] Retry logic (if implemented)
- [ ] Image quality validation
- [ ] Memory usage tests

## Contributing

When adding new tests:
1. Follow the existing structure and naming conventions
2. Add descriptive comments for complex test scenarios
3. Ensure tests are isolated and don't depend on each other
4. Update this README with new test categories
5. Maintain 100% code coverage

## CI/CD Integration

These tests are designed to run in CI/CD pipelines:
- Fast execution (< 1 second)
- No external dependencies
- Deterministic results
- Clear failure messages

Add to your CI pipeline:
```yaml
- name: Run Tests
  run: bun test
```

## Troubleshooting

### Tests fail with "FAL_KEY not found"
Ensure environment variables are set in `tests/setup.ts`

### Mock not working
Check that mocks are defined before imports:
```typescript
vi.mock('@fal-ai/client', () => ({ ... }))
// Import AFTER mocks
import { fal } from '@fal-ai/client'
```

### Tests pass locally but fail in CI
- Check for environment-specific dependencies
- Ensure all mocks are properly configured
- Verify test isolation (no shared state)

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Fal.ai API Documentation](https://fal.ai/docs)
- [Testing Best Practices](https://testingjavascript.com/)
