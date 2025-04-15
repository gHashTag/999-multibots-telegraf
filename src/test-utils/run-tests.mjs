import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// Categories to consider
const categories = ['scenes', 'inngest', 'utils', 'commands'];

// Get test files based on command line arguments
async function getTestFiles() {
  const args = process.argv.slice(2);
  
  // If specific files are provided, use them
  if (args.length > 0) {
    return args.map(file => {
      if (file.startsWith('/')) {
        return file;
      }
      return path.resolve(process.cwd(), file);
    });
  }
  
  // Otherwise, find all test files
  const testFiles = [];
  
  for (const category of categories) {
    const categoryDir = path.join(__dirname, 'tests', category);
    if (fs.existsSync(categoryDir)) {
      const files = fs.readdirSync(categoryDir)
        .filter(file => file.endsWith('.test.mjs'))
        .map(file => path.join(categoryDir, file));
      
      testFiles.push(...files);
    }
  }
  
  return testFiles;
}

// Run a single test file
async function runTestFile(filePath) {
  console.log(`${colors.cyan}Running test: ${colors.yellow}${path.basename(filePath)}${colors.reset}`);
  
  try {
    const testModule = await import(filePath);
    
    if (typeof testModule.run === 'function') {
      const { passed, failed, total } = await testModule.run();
      return { passed, failed, total, file: path.basename(filePath) };
    } else {
      console.error(`${colors.red}Test file ${filePath} does not export a run function${colors.reset}`);
      return { passed: 0, failed: 1, total: 1, file: path.basename(filePath) };
    }
  } catch (error) {
    console.error(`${colors.red}Error running test file ${filePath}:${colors.reset}`, error);
    return { passed: 0, failed: 1, total: 1, file: path.basename(filePath) };
  }
}

// Main function to run all tests
async function main() {
  console.log(`${colors.magenta}Starting test run...${colors.reset}`);
  
  const testFiles = await getTestFiles();
  console.log(`${colors.blue}Found ${testFiles.length} test files to run${colors.reset}`);
  
  const results = [];
  let totalPassed = 0;
  let totalFailed = 0;
  
  for (const file of testFiles) {
    const result = await runTestFile(file);
    results.push(result);
    totalPassed += result.passed;
    totalFailed += result.failed;
  }
  
  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log(`${colors.magenta}Test Summary:${colors.reset}`);
  console.log('='.repeat(50));
  
  results.forEach(result => {
    const status = result.failed === 0 
      ? `${colors.green}PASSED${colors.reset}` 
      : `${colors.red}FAILED${colors.reset}`;
    console.log(`${result.file}: ${status} (${result.passed}/${result.total})`);
  });
  
  console.log('='.repeat(50));
  console.log(`${colors.blue}Total: ${totalPassed + totalFailed} tests${colors.reset}`);
  console.log(`${colors.green}Passed: ${totalPassed} tests${colors.reset}`);
  console.log(`${colors.red}Failed: ${totalFailed} tests${colors.reset}`);
  
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, err);
  process.exit(1);
}); 