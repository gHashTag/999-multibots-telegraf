#!/usr/bin/env bash

# Define colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Check if a test name was provided
if [ -z "$1" ]; then
  echo -e "${RED}ERROR: You must provide a test name (without the .test.ts extension)${NC}"
  echo -e "Usage: $0 <test-name> [--keep-temp|-k]"
  echo -e "Example: $0 textToVideoWizard"
  exit 1
fi

# Get the test name from the first argument
TEST_NAME=$1
KEEP_TEMP=false

# Parse additional arguments
for arg in "${@:2}"; do
  if [ "$arg" == "--keep-temp" ] || [ "$arg" == "-k" ]; then
    KEEP_TEMP=true
  fi
done

# Check if the test file exists
TEST_FILE="src/test-utils/tests/scenes/${TEST_NAME}.test.ts"
if [ ! -f "$TEST_FILE" ]; then
  echo -e "${RED}ERROR: Test file not found: ${TEST_FILE}${NC}"
  echo -e "Available tests:"
  find src/test-utils/tests/scenes -name "*.test.ts" | sed 's|src/test-utils/tests/scenes/||g' | sed 's|.test.ts||g' | sort
  exit 1
fi

# Create a temporary directory
TEMP_DIR=$(mktemp -d)
echo -e "${YELLOW}Created temporary directory: ${TEMP_DIR}${NC}"

# Copy the test runner to the temporary directory
cp src/test-utils/runScenesTests.ts "$TEMP_DIR/"

# Generate a temporary runner that only runs the specified test
cat > "$TEMP_DIR/runSingleTest.ts" << EOL
#!/usr/bin/env node
/**
 * Single test runner for ${TEST_NAME}
 */
import { TestResult } from './core/types';
import mockApi from './core/mock';
import * as database from '@/libs/database';
import * as supabaseModule from '@/supabase';

// Import the specified test
import run${TEST_NAME}Tests from './tests/scenes/${TEST_NAME}.test';

// Mock Supabase and database functions
try {
  Object.defineProperty(supabaseModule, 'supabase', {
    value: mockApi.mockSupabase(),
    configurable: true,
  });
  Object.defineProperty(database, 'getUserSub', { value: mockApi.create(), configurable: true });
  Object.defineProperty(database, 'getUserBalance', { value: mockApi.create(), configurable: true });
  Object.defineProperty(database, 'getUserByTelegramId', { value: mockApi.create(), configurable: true });
} catch (error) {
  console.log('Mocks already defined, skipping redefinition');
}

// Run the single test
async function runSingleTest() {
  console.log('🧪 Running ${TEST_NAME} tests...');
  
  try {
    const results = await run${TEST_NAME}Tests();
    results.forEach(result => {
      console.log(\`\${result.success ? '✅' : '❌'} \${result.name}: \${result.message}\`);
    });
    
    // Calculate success/failure statistics
    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;
    console.log(\`\n📊 Results: Total: \${results.length}, Success: \${successCount}, Failures: \${failCount}\`);
    
    return failCount === 0; // Return true if all tests passed
  } catch (error) {
    console.error('❌ Error running tests:', error);
    return false;
  }
}

// Run the test and exit with appropriate code
runSingleTest().then(success => {
  process.exit(success ? 0 : 1);
});
EOL

# Run the test using ts-node with ES module support
echo -e "${YELLOW}Running ${TEST_NAME} tests...${NC}"
cd "$TEMP_DIR" && npx ts-node --esm -r tsconfig-paths/register runSingleTest.ts

# Check the result and output success/failure message
TEST_RESULT=$?
if [ $TEST_RESULT -eq 0 ]; then
  echo -e "\n${GREEN}✅ All ${TEST_NAME} tests passed successfully!${NC}"
else
  echo -e "\n${RED}❌ Some tests failed. Please check the output above for details.${NC}"
fi

# Clean up temporary files unless --keep-temp was specified
if [ "$KEEP_TEMP" = false ]; then
  echo -e "${YELLOW}Cleaning up temporary files...${NC}"
  rm -rf "$TEMP_DIR"
else
  echo -e "${YELLOW}Keeping temporary files in: ${TEMP_DIR}${NC}"
  echo -e "To run the test again: cd $TEMP_DIR && npx ts-node --esm -r tsconfig-paths/register runSingleTest.ts"
fi

exit $TEST_RESULT 