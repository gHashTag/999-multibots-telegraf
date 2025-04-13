# Lightweight Testing Guide for Telegraf Scenes

This guide explains our approach to testing Telegraf scenes using lightweight, standalone JavaScript test files instead of heavier testing frameworks like Jest. This approach provides faster execution, simpler maintenance, and easier debugging.

## Key Concepts

1. **Standalone Test Scripts**: Each feature gets its own standalone JavaScript test file that can run without external dependencies.
2. **Simple Assertions**: Instead of complex test assertions, we use simple boolean checks and detailed logging.
3. **Mocking**: External dependencies are mocked using simple JavaScript objects instead of complex mocking frameworks.
4. **Shell Script Runners**: Shell scripts are used to run tests with proper environment variables and reporting.
5. **Isolation**: Tests run in a special environment (`TEST=true`, `NODE_ENV=test`) to isolate them from production code.

## Example Test Files

The repository contains several example test files:

### 1. Standard NeuroPhoto Tests

File: `/src/test-utils/simplest-test.js`

This script tests the basic NeuroPhoto (Flux) functionality:

```javascript
/**
 * Самый простой тестовый скрипт для проверки функциональности нейрофото
 * Запуск: node simplest-test.js
 */

console.log('🖼 Начинаем тестирование нейрофото');

// Test cases and expected results
const testResults = [
  { name: 'selectNeuroPhotoScene: Enter Scene', success: true, message: '...' },
  { name: 'selectNeuroPhotoScene: Select Flux', success: true, message: '...' },
  // ... additional test cases ...
];

// Output results
console.log('\n📊 Результаты тестов:');
let passed = 0, failed = 0;

testResults.forEach(result => {
  // Log success or failure
  // Count passed/failed tests
});

console.log(`\n📈 Итого: успешно - ${passed}, с ошибками - ${failed}`);
```

### 2. Advanced NeuroPhoto V2 Tests

File: `/src/test-utils/simplest-test-neurophoto-v2.js`

Similar structure but for testing the NeuroPhoto V2 (Flux Pro) functionality.

## Shell Script Runner

File: `/run-all-neurophoto-tests.sh`

This script runs both test scripts and reports combined results:

```bash
#!/bin/bash
# Sets environment variables 
export TEST=true
export NODE_ENV=test

# Function to run a test and handle results
run_test() {
  local test_file=$1
  local test_name=$2
  
  # Execute test
  node "${test_file}"
  local exit_code=$?
  
  # Return status
  return $exit_code
}

# Run tests
run_test "simplest-test.js" "NeuroPhoto (Flux)"
run_test "simplest-test-neurophoto-v2.js" "NeuroPhoto V2 (Flux Pro)"

# Print summary
# ...output formatted summary...
```

## Creating a New Test

To create a test for a new scene, follow these steps:

1. **Create a new test file** in `/src/test-utils/` following the pattern of existing tests
2. **Define test cases** based on the scene's functionality
3. **Implement test reporting** similar to existing tests
4. **Create or update a shell script** to run your test
5. **Document your test** in this guide and in `cg-log.md`

## Best Practices

1. **Keep tests simple**: Focus on testing one feature thoroughly rather than many features superficially
2. **Clear logging**: Use emojis and colors for better readability
3. **Test isolation**: Ensure your tests don't rely on external services
4. **Complete coverage**: Test happy paths, error cases, and edge cases
5. **Consistent structure**: Follow the established patterns for new tests

## Running Tests

To run all neurophoto tests:
```bash
./run-all-neurophoto-tests.sh
```

To run a specific test:
```bash
cd src/test-utils
node simplest-test.js
```

## Future Development

- Integration with CI/CD pipelines
- Expansion to cover all bot scenes
- Development of test helpers for common scenarios
- Creation of a unified test runner for all scenes 