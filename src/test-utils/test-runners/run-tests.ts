#!/usr/bin/env node
/**
 * Command-line interface for running tests
 * Usage:
 *   npx ts-node run-tests.ts [options] [testNames...]
 *
 * Options:
 *   --all                Run all tests
 *   --verbose            Show verbose output
 *   --timeout <ms>       Set test timeout (default: 60000ms)
 *   --no-color           Disable colored output
 */

import { runAllTests, runTest } from './runScenesTests'
import { testTextToVideo } from './tests/neuro/text-to-video/textToVideo.test'

// Map of available tests
const availableTests: Record<string, () => Promise<any>> = {
  'text-to-video': testTextToVideo,
  // Add more tests here as they're implemented
}

// Parse command line arguments
const args = process.argv.slice(2)
const options: Record<string, any> = {
  verbose: false,
  all: false,
  color: true,
  timeout: 60000,
  tests: [] as string[],
}

// Parse args
for (let i = 0; i < args.length; i++) {
  const arg = args[i]

  if (arg === '--verbose') {
    options.verbose = true
  } else if (arg === '--all') {
    options.all = true
  } else if (arg === '--no-color') {
    options.color = false
  } else if (arg === '--timeout') {
    if (i + 1 < args.length) {
      const timeout = parseInt(args[++i], 10)
      if (!isNaN(timeout)) {
        options.timeout = timeout
      }
    }
  } else if (arg.startsWith('--')) {
    console.error(`Unknown option: ${arg}`)
    process.exit(1)
  } else {
    // Assume it's a test name
    options.tests.push(arg)
  }
}

// Print usage
function printUsage() {
  console.log(`
Usage: npx ts-node run-tests.ts [options] [testNames...]

Options:
  --all                Run all tests
  --verbose            Show verbose output
  --timeout <ms>       Set test timeout (default: 60000ms)
  --no-color           Disable colored output

Available tests:
${Object.keys(availableTests)
  .map(name => `  ${name}`)
  .join('\n')}

Examples:
  npx ts-node run-tests.ts --all
  npx ts-node run-tests.ts text-to-video
  npx ts-node run-tests.ts --verbose text-to-video
`)
}

// If no tests specified and not --all, show usage
if (options.tests.length === 0 && !options.all) {
  printUsage()
  process.exit(1)
}

// Main execution
async function main() {
  try {
    if (options.all) {
      // Run all tests
      const exitCode = await runAllTests()
      process.exit(exitCode)
    } else {
      // Run specific tests
      const testsToRun = options.tests.filter((testName: string) => {
        if (!availableTests[testName]) {
          console.error(`Unknown test: ${testName}`)
          return false
        }
        return true
      })

      if (testsToRun.length === 0) {
        console.error('No valid tests to run')
        process.exit(1)
      }

      let failedCount = 0

      for (const testName of testsToRun) {
        const testFn = availableTests[testName]
        const result = await runTest(testName, testFn)

        if (!result.success) {
          failedCount++
        }
      }

      process.exit(failedCount === 0 ? 0 : 1)
    }
  } catch (error) {
    console.error('Error running tests:', error)
    process.exit(1)
  }
}

main()
