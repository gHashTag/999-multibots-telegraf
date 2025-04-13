#!/bin/bash

# Script to run audioToTextScene tests

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting Audio-to-Text Scene Tests...${NC}"

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

# Create a specific test runner file
cat > "${TEMP_DIR}/audioToTextSceneTest.ts" << 'EOL'
import { runAudioToTextSceneTests } from './src/test-utils/tests/scenes/audioToTextScene.test';

async function run() {
  console.log('🎙️ Running Audio-to-Text Scene tests...');
  try {
    const results = await runAudioToTextSceneTests();
    
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
      console.log('\n🎉 All Audio-to-Text Scene tests passed!');
      process.exit(0);
    } else {
      console.error('\n❌ Some Audio-to-Text Scene tests failed!');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error running Audio-to-Text Scene tests:', error);
    process.exit(1);
  }
}

run();
EOL

# Go to temp directory
cd "${TEMP_DIR}"

# Run the tests using tsx (works better with ES modules)
echo -e "${YELLOW}Running tests...${NC}"
npx tsx audioToTextSceneTest.ts

# Check the exit status
if [ $? -eq 0 ]; then
  echo -e "${GREEN}Audio-to-Text Scene tests completed successfully!${NC}"
  EXIT_CODE=0
else
  echo -e "${RED}Audio-to-Text Scene tests failed!${NC}"
  EXIT_CODE=1
fi

# Clean up
cd - > /dev/null
rm -rf "${TEMP_DIR}"
echo "Cleaned up temporary directory"

exit $EXIT_CODE 