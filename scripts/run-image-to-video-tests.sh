#!/bin/bash

# Script to run imageToVideoWizard tests

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting Image-to-Video Wizard Tests...${NC}"

# Create temporary directory for test files
TEMP_DIR=$(mktemp -d)
echo -e "Created temporary directory: ${TEMP_DIR}"

# Copy necessary test files to temp directory
cp -r src/test-utils "${TEMP_DIR}/"
mkdir -p "${TEMP_DIR}/src"
cp -r src/scenes "${TEMP_DIR}/src/"
cp -r src/interfaces "${TEMP_DIR}/src/"
cp -r src/core "${TEMP_DIR}/src/"
cp -r src/services "${TEMP_DIR}/src/"
cp -r src/utils "${TEMP_DIR}/src/"
cp -r src/libs "${TEMP_DIR}/src/"
cp -r src/types "${TEMP_DIR}/src/"
cp -r src/price "${TEMP_DIR}/src/"
cp -r src/supabase "${TEMP_DIR}/src/"
cp -r src/menu "${TEMP_DIR}/src/"
cp -r src/handlers "${TEMP_DIR}/src/"
cp -r src/helpers "${TEMP_DIR}/src/"
cp -r src/inngest-functions "${TEMP_DIR}/src/"

# Create a specific test runner file
cat > "${TEMP_DIR}/imageToVideoWizardTest.ts" << 'EOL'
import { runImageToVideoWizardTests } from './src/test-utils/tests/scenes/imageToVideoWizard.test';

async function run() {
  console.log('🎬 Running Image-to-Video Wizard tests...');
  try {
    const results = await runImageToVideoWizardTests();
    
    let success = true;
    
    results.forEach(result => {
      if (result.success) {
        console.log(`✅ ${result.name}: ${result.message}`);
      } else {
        console.error(`❌ ${result.name}: ${result.message}`);
        success = false;
      }
    });
    
    if (success) {
      console.log('\n🎉 All Image-to-Video Wizard tests passed!');
      process.exit(0);
    } else {
      console.error('\n❌ Some Image-to-Video Wizard tests failed!');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error running Image-to-Video Wizard tests:', error);
    process.exit(1);
  }
}

run();
EOL

# Go to temp directory
cd "${TEMP_DIR}"

# Run the tests using tsx (works better with ES modules)
echo -e "${YELLOW}Running tests...${NC}"
npx tsx imageToVideoWizardTest.ts

# Check the exit status
if [ $? -eq 0 ]; then
  echo -e "${GREEN}Image-to-Video Wizard tests completed successfully!${NC}"
  EXIT_CODE=0
else
  echo -e "${RED}Image-to-Video Wizard tests failed!${NC}"
  EXIT_CODE=1
fi

# Clean up
cd - > /dev/null
rm -rf "${TEMP_DIR}"
echo "Cleaned up temporary directory"

exit $EXIT_CODE 