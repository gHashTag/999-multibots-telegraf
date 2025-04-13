#!/bin/bash

# Set colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Running imageToVideoWizard tests...${NC}"

# Create a temporary test runner file
TEMP_DIR="./temp_test_runner"
TEMP_FILE="$TEMP_DIR/runImageToVideoTests.ts"

# Create temp directory if it doesn't exist
mkdir -p $TEMP_DIR

# Create a simple test runner that imports and runs our tests
cat > $TEMP_FILE << 'EOF'
// Set path alias for imports
import 'module-alias/register';

// Import test function from test file
import runImageToVideoWizardTests from '../src/test-utils/tests/scenes/imageToVideoWizard.test';

// Run tests
async function main() {
  try {
    console.log('Starting imageToVideoWizard tests...');
    const results = await runImageToVideoWizardTests();
    
    // Log results
    let success = true;
    results.forEach(result => {
      if (result.success) {
        console.log(`✅ ${result.name}: ${result.message}`);
      } else {
        console.log(`❌ ${result.name}: ${result.message}`);
        success = false;
      }
    });
    
    // Exit with appropriate code
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('❌ Error running tests:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
EOF

# Run the test with ts-node
echo -e "Executing tests via ts-node..."
NODE_OPTIONS="--experimental-specifier-resolution=node" npx ts-node --esm $TEMP_FILE

# Store result
TEST_RESULT=$?

# Clean up
echo -e "Cleaning up temporary files..."
rm -rf $TEMP_DIR

# Exit with test result
if [ $TEST_RESULT -eq 0 ]; then
  echo -e "${GREEN}✅ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ Tests failed!${NC}"
  exit 1
fi 