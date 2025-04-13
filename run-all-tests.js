#!/usr/bin/env node

/**
 * Comprehensive Testing Script for Telegram Bot Scenes
 * 
 * This script provides a flexible way to run tests for all scenes
 * or individual scenes with proper error handling and environment setup.
 */

// Set environment variables for testing
process.env.TEST = 'true';
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://mock-supabase-url.supabase.co';
process.env.SUPABASE_KEY = 'mock-supabase-key';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Install required dependencies if they don't exist
try {
  require('module-alias');
} catch (error) {
  console.log('Installing required dependencies for tests...');
  execSync('npm install --no-save module-alias', { stdio: 'inherit' });
}

// Configuration
const config = {
  testDir: path.join(__dirname, 'src/test-utils/tests/scenes'),
  sceneMapping: {
    'neurophoto': 'selectNeuroPhotoScene.test.ts',
    'neurophoto-v2': 'neuroPhotoWizardV2.test.ts',
    'menu': 'menuScene.test.ts',
    'start': 'startScene.test.ts',
    'help': 'helpScene.test.ts',
    'balance': 'checkBalanceScene.test.ts',
    'balance-notifier': 'balanceNotifierScene.test.ts',
    'subscription': 'subscriptionCheckScene.test.ts',
    'train-flux': 'trainFluxModelWizard.test.ts',
    'avatar-body': 'digitalAvatarBodyWizard.test.ts',
    'avatar-body-v2': 'digitalAvatarBodyWizardV2.test.ts'
  }
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

/**
 * Print a formatted header
 * @param {string} text - The header text
 */
function printHeader(text) {
  const line = '='.repeat(text.length + 8);
  console.log('\n' + colors.cyan + line + colors.reset);
  console.log(colors.cyan + `==  ${text}  ==` + colors.reset);
  console.log(colors.cyan + line + colors.reset + '\n');
}

/**
 * Print a formatted section
 * @param {string} text - The section text
 */
function printSection(text) {
  console.log(colors.yellow + '\n' + text + colors.reset);
  console.log(colors.yellow + '-'.repeat(text.length) + colors.reset + '\n');
}

/**
 * Ensure required mock files exist
 */
function ensureMockFiles() {
  const requiredMocks = [
    'src/test-utils/core/mock/loggerMock.js',
    'src/test-utils/core/mock/supabaseMock.js',
    'src/test-utils/core/mock/languageMock.js'
  ];
  
  let allExist = true;
  
  for (const mockPath of requiredMocks) {
    const fullPath = path.join(__dirname, mockPath);
    if (!fs.existsSync(fullPath)) {
      console.error(colors.red + `Required mock file not found: ${mockPath}` + colors.reset);
      allExist = false;
    }
  }
  
  return allExist;
}

/**
 * Get a list of all available test files
 * @returns {string[]} Array of test file paths
 */
function getAvailableTests() {
  try {
    return fs.readdirSync(config.testDir)
      .filter(file => file.endsWith('.test.ts'))
      .map(file => path.join(config.testDir, file));
  } catch (error) {
    console.error(colors.red + `Error reading test directory: ${error.message}` + colors.reset);
    return [];
  }
}

/**
 * Run a specific test
 * @param {string} testFile - The test file path
 * @returns {boolean} Whether the test was successful
 */
function runTest(testFile) {
  const fileName = path.basename(testFile);
  printSection(`Running test: ${fileName}`);
  
  try {
    // Create a temporary JavaScript file to run the test
    const tempFile = path.join(__dirname, 'temp-test-runner.js');
    
    const testCode = `
      // Set up environment variables for tests
      process.env.TEST = 'true';
      process.env.NODE_ENV = 'test';
      process.env.SUPABASE_URL = 'https://mock-supabase-url.supabase.co';
      process.env.SUPABASE_KEY = 'mock-supabase-key';
      process.env.BOT_TOKEN = 'mock-bot-token';
      
      // Register module aliases to support @ imports
      try {
        require('./src/test-utils/core/setup/module-aliases.js');
        console.log('Module aliases registered');
      } catch (error) {
        console.error('Error registering module aliases:', error);
      }
      
      // Redirect console.error to capture errors
      const originalConsoleError = console.error;
      const errors = [];
      console.error = (...args) => {
        errors.push(args.join(' '));
        originalConsoleError(...args);
      };
      
      // Create global mocks for test environment
      global.mockCtx = {
        reply: () => {},
        replyWithHTML: () => {},
        replyWithMarkdown: () => {},
        wizard: { cursor: 0, scene: { current: '' } },
        session: {},
        replies: [],
        i18n: { t: (key) => key },
        from: { id: 12345, first_name: 'Test', username: 'testuser', language_code: 'en' }
      };
      
      async function runTheTest() {
        try {
          // Dynamic import to load the test module
          const testPath = '${testFile.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}';
          console.log('Loading test from: ' + testPath);
          
          // For TypeScript files, we need to use require with ts-node/register
          require('ts-node/register');
          
          // Attempt to load and run the test
          require(testPath);
          
          console.log('Test completed successfully');
          process.exit(0);
        } catch (error) {
          console.error('Test failed with error:', error);
          process.exit(1);
        }
      }
      
      runTheTest().catch(err => {
        console.error('Unhandled promise rejection:', err);
        process.exit(1);
      });
    `;
    
    fs.writeFileSync(tempFile, testCode);
    
    // Execute the test with proper environment variables
    execSync(`node ${tempFile}`, { 
      stdio: 'inherit',
      env: {
        ...process.env,
        TEST: 'true',
        NODE_ENV: 'test',
        SUPABASE_URL: 'https://mock-supabase-url.supabase.co',
        SUPABASE_KEY: 'mock-supabase-key',
        BOT_TOKEN: 'mock-bot-token'
      }
    });
    
    // Clean up temp file
    fs.unlinkSync(tempFile);
    
    console.log(colors.green + `✅ Test ${fileName} passed` + colors.reset);
    return true;
  } catch (error) {
    console.error(colors.red + `❌ Test ${fileName} failed: ${error.message}` + colors.reset);
    return false;
  }
}

/**
 * Run tests for a specific scene by name
 * @param {string} sceneName - The name of the scene to test
 * @returns {boolean} Whether the test was successful
 */
function runSceneTest(sceneName) {
  const fileName = config.sceneMapping[sceneName.toLowerCase()];
  
  if (!fileName) {
    console.error(colors.red + `No test found for scene: ${sceneName}` + colors.reset);
    console.log(colors.yellow + `Available scenes: ${Object.keys(config.sceneMapping).join(', ')}` + colors.reset);
    return false;
  }
  
  const testFile = path.join(config.testDir, fileName);
  
  if (!fs.existsSync(testFile)) {
    console.error(colors.red + `Test file not found: ${testFile}` + colors.reset);
    return false;
  }
  
  return runTest(testFile);
}

/**
 * Run all available tests
 * @returns {Object} Results of all tests
 */
function runAllTests() {
  printHeader('Running All Scene Tests');
  
  const tests = getAvailableTests();
  const results = {
    total: tests.length,
    passed: 0,
    failed: 0,
    skipped: 0,
    failedTests: []
  };
  
  if (tests.length === 0) {
    console.log(colors.yellow + 'No tests found.' + colors.reset);
    return results;
  }
  
  tests.forEach(testFile => {
    try {
      const success = runTest(testFile);
      if (success) {
        results.passed++;
      } else {
        results.failed++;
        results.failedTests.push(path.basename(testFile));
      }
    } catch (error) {
      console.error(colors.red + `Error running test ${path.basename(testFile)}: ${error.message}` + colors.reset);
      results.failed++;
      results.failedTests.push(path.basename(testFile));
    }
  });
  
  return results;
}

/**
 * Print help information
 */
function printHelp() {
  printHeader('Telegram Bot Scene Test Runner');
  console.log('Usage:');
  console.log('  node run-all-tests.js [options] [scene-name]');
  console.log('\nOptions:');
  console.log('  --help, -h     Show this help message');
  console.log('  --all          Run all available tests');
  console.log('  --list         List all available scene tests');
  console.log('\nExamples:');
  console.log('  node run-all-tests.js --all           Run all tests');
  console.log('  node run-all-tests.js neurophoto      Run tests for neurophoto scene');
  console.log('  node run-all-tests.js --list          List all available tests');
}

/**
 * List all available tests
 */
function listAvailableTests() {
  printHeader('Available Scene Tests');
  
  const scenes = Object.keys(config.sceneMapping).sort();
  
  scenes.forEach(scene => {
    const file = config.sceneMapping[scene];
    const testFile = path.join(config.testDir, file);
    const exists = fs.existsSync(testFile);
    
    console.log(
      `${colors.yellow}${scene.padEnd(20)}${colors.reset} -> ${exists ? colors.green : colors.red}${file}${colors.reset}`
    );
  });
}

/**
 * Main function to run the script
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }
  
  // Ensure all required mock files exist
  if (!ensureMockFiles()) {
    console.error(colors.red + 'Missing required mock files. Please create them before running tests.' + colors.reset);
    process.exit(1);
  }
  
  if (args.includes('--list')) {
    listAvailableTests();
    return;
  }
  
  if (args.includes('--all')) {
    const results = runAllTests();
    
    printHeader('Test Results Summary');
    console.log(`Total tests: ${results.total}`);
    console.log(`${colors.green}Passed: ${results.passed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${results.failed}${colors.reset}`);
    
    if (results.failed > 0) {
      console.log('\nFailed tests:');
      results.failedTests.forEach(test => {
        console.log(colors.red + `  - ${test}` + colors.reset);
      });
      process.exit(1);
    }
    
    return;
  }
  
  // Run specific scene test
  const sceneName = args[0];
  const success = runSceneTest(sceneName);
  
  if (!success) {
    process.exit(1);
  }
}

// Execute the main function
main(); 