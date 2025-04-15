import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// Setup path handling for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Load environment variables
try {
  const dotenv = await import('dotenv');
  const envPath = path.resolve(process.cwd(), '.env.test');
  
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`Loaded environment from ${envPath}`);
  } else {
    dotenv.config();
    console.log('Loaded environment from default .env file');
  }
} catch (error) {
  console.warn('Failed to load environment variables:', error.message);
}

// Set test environment
process.env.NODE_ENV = 'test';

/**
 * Run scene tests
 * @param {string} specificTest - Optional specific test file to run
 * @returns {Promise<boolean>} - True if all tests pass
 */
async function runSceneTests(specificTest = null) {
  console.log('🧪 Running scene tests...');
  
  // Get the directory containing the scene tests
  const testDir = path.join(__dirname, 'tests', 'scenes');
  
  if (!fs.existsSync(testDir)) {
    console.error(`❌ Test directory not found: ${testDir}`);
    return false;
  }
  
  // Get all test files or specific test
  let testFiles = [];
  
  if (specificTest) {
    // If a specific test is requested, check if it exists
    const specificTestPath = path.join(testDir, specificTest.endsWith('.test.ts') 
      ? specificTest 
      : `${specificTest}.test.ts`);
      
    if (fs.existsSync(specificTestPath)) {
      testFiles = [specificTestPath];
    } else {
      console.error(`❌ Specific test file not found: ${specificTestPath}`);
      return false;
    }
  } else {
    // Otherwise, get all test files
    testFiles = fs.readdirSync(testDir)
      .filter(file => file.endsWith('.test.ts'))
      .map(file => path.join(testDir, file));
      
    if (testFiles.length === 0) {
      console.error('❌ No test files found');
      return false;
    }
  }
  
  console.log(`📋 Found ${testFiles.length} test files to run`);
  
  // Run each test
  let passedTests = 0;
  let failedTests = 0;
  
  for (const testFile of testFiles) {
    const relativeTestPath = path.relative(process.cwd(), testFile);
    console.log(`\n🔍 Running test: ${relativeTestPath}`);
    
    try {
      // Use dynamic import to load the test file
      const testModule = await import(`file://${testFile}`);
      
      // Try to find and run the main test function
      const runFunction = testModule.run || testModule.default || Object.values(testModule)[0];
      
      if (typeof runFunction === 'function') {
        const result = await runFunction();
        
        if (result === true || (typeof result === 'object' && result.success === true)) {
          console.log(`✅ Test passed: ${relativeTestPath}`);
          passedTests++;
        } else {
          console.error(`❌ Test failed: ${relativeTestPath}`);
          failedTests++;
        }
      } else {
        console.error(`❌ No runnable test function found in ${relativeTestPath}`);
        failedTests++;
      }
    } catch (error) {
      console.error(`❌ Error running test ${relativeTestPath}:`, error);
      failedTests++;
    }
  }
  
  // Report results
  console.log('\n📊 Test Results:');
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`🔄 Total: ${passedTests + failedTests}`);
  
  const allPassed = failedTests === 0;
  
  if (allPassed) {
    console.log('\n🎉 All tests passed!');
  } else {
    console.error('\n❌ Some tests failed');
  }
  
  return allPassed;
}

// Check if a specific test was requested
const specificTest = process.argv[2];

// Run the tests
runSceneTests(specificTest)
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Error in test runner:', error);
    process.exit(1);
  }); 