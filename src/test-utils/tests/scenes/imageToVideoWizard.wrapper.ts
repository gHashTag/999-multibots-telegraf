/**
 * CommonJS compatible wrapper for imageToVideoWizard tests
 * This file helps resolve ES Module / CommonJS interoperability issues
 */

// Set path alias for imports
require('module-alias/register');

// Import the actual test runner
async function runTests() {
  try {
    // Dynamically import the test file
    const { default: runImageToVideoWizardTests } = await import('./imageToVideoWizard.test');
    
    // Run the tests
    const results = await runImageToVideoWizardTests();
    
    // Log results
    results.forEach(result => {
      console.log(`${result.success ? '✅' : '❌'} ${result.name}: ${result.message}`);
    });
    
    // Return success status
    return results.every(r => r.success);
  } catch (error) {
    console.error('❌ Error running imageToVideoWizard tests:', error);
    return false;
  }
}

// Run tests and exit with appropriate code
runTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error in test execution:', error);
    process.exit(1);
  }); 