#!/bin/bash

# Script to run helpScene tests with proper environment settings

echo "🧪 Running Help Scene tests..."

# Set NODE_ENV to test
export NODE_ENV=test

# Create a temporary test script that handles Jest globals
cat > temp-test-runner.js << 'EOF'
// Set up global Jest object for compatibility
global.jest = {
  fn: (impl) => {
    const mockFn = function(...args) {
      mockFn.mock.calls.push(args);
      if (typeof impl === 'function') {
        return impl(...args);
      }
      return undefined;
    };
    mockFn.mock = { calls: [] };
    mockFn.mockResolvedValue = function(val) {
      impl = () => Promise.resolve(val);
      return mockFn;
    };
    mockFn.mockRejectedValue = function(err) {
      impl = () => Promise.reject(err);
      return mockFn;
    };
    mockFn.mockClear = function() {
      mockFn.mock.calls = [];
      return mockFn;
    };
    return mockFn;
  },
  mock: (path, factory) => {
    console.log(`Mocking ${path}`);
    return factory ? factory() : {};
  },
  clearAllMocks: () => {}
};

// Run the test file
require('../src/test-utils/tests/scenes/helpScene.test.js');
EOF

# Compile TypeScript with CommonJS module system
echo "Compiling TypeScript to JavaScript..."
npx tsc \
  --allowJs \
  src/test-utils/tests/scenes/helpScene.test.ts \
  --outDir temp-build \
  --module commonjs \
  --esModuleInterop \
  --skipLibCheck \
  --target es2020

# Run the test with Node directly to avoid module issues
echo "Running test with Node..."
node temp-test-runner.js

# Save the exit code
EXIT_CODE=$?

# Clean up temporary files
rm -rf temp-test-runner.js temp-build

# Print result based on exit code
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Help Scene tests completed successfully"
else
  echo "❌ Help Scene tests failed with exit code $EXIT_CODE"
fi

exit $EXIT_CODE 