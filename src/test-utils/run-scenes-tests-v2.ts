import { resolve, join } from 'path'
import { existsSync, readdirSync } from 'fs'
import * as dotenv from 'dotenv'

// Load environment variables from .env.test if it exists
const testEnvPath = resolve(process.cwd(), '.env.test')
if (existsSync(testEnvPath)) {
  console.log('Loading environment variables from .env.test')
  dotenv.config({ path: testEnvPath })
} else {
  console.log('No .env.test file found, using default .env')
  dotenv.config()
}

// Set environment to test
process.env.NODE_ENV = 'test'

/**
 * Runs all scene tests or a specific test if provided
 * @param specificTest Optional name of a specific test to run (without .test.ts extension)
 */
async function runSceneTests(specificTest?: string) {
  try {
    const scenesDir = resolve(process.cwd(), 'src/test-utils/tests/scenes')
    console.log(`Looking for tests in: ${scenesDir}`)

    if (!existsSync(scenesDir)) {
      console.error(`Directory not found: ${scenesDir}`)
      process.exit(1)
    }

    const testFiles = readdirSync(scenesDir)
      .filter(file => file.endsWith('.test.ts'))
      .filter(file => !specificTest || file === `${specificTest}.test.ts`)

    if (testFiles.length === 0) {
      if (specificTest) {
        console.error(`Test file not found: ${specificTest}.test.ts`)
      } else {
        console.error('No test files found in the scenes directory')
      }
      process.exit(1)
    }

    console.log(`Found ${testFiles.length} test files to run`)

    // Import and run each test file
    let successCount = 0
    let failCount = 0

    for (const file of testFiles) {
      try {
        console.log(`\n----- Running test: ${file} -----`)

        // We need to use dynamic import for ES modules compatibility
        const testPath = join(scenesDir, file)
        const testModule = await import(testPath)

        // Most test files export a run function
        if (typeof testModule.run === 'function') {
          await testModule.run()
          console.log(`✅ Test passed: ${file}`)
          successCount++
        } else if (typeof testModule.default === 'function') {
          // Some might use default export
          await testModule.default()
          console.log(`✅ Test passed: ${file}`)
          successCount++
        } else {
          // If no run function, assume the test runs automatically on import
          console.log(
            `✅ Test imported: ${file} (no explicit run function found)`
          )
          successCount++
        }
      } catch (error) {
        console.error(`❌ Test failed: ${file}`)
        console.error(error)
        failCount++
      }
    }

    console.log('\n----- Test Results -----')
    console.log(`Total tests: ${testFiles.length}`)
    console.log(`Passed: ${successCount}`)
    console.log(`Failed: ${failCount}`)

    if (failCount > 0) {
      process.exit(1)
    }
  } catch (error) {
    console.error('Error running scene tests:', error)
    process.exit(1)
  }
}

// Check if a specific test was requested
const specificTest = process.argv[2]
runSceneTests(specificTest)
