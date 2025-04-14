import { TestCase, TestResult, TestRunnerConfig, TestSuite, TestSuiteResult, TestRunnerResult } from '../types/test'
import { logger } from '../logger'

const DEFAULT_CONFIG: TestRunnerConfig = {
  timeout: 30000,
  retries: 3,
  parallel: true,
  logLevel: 'info'
}

export class TestEngine {
  private config: TestRunnerConfig
  private suites: TestSuite[] = []
  
  constructor(config: Partial<TestRunnerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  public addSuite(suite: TestSuite): void {
    this.suites.push(suite)
  }

  private async runTest(test: TestCase): Promise<TestResult> {
    const startTime = Date.now()
    let lastError: Error | undefined

    for (let attempt = 0; attempt <= (test.retries ?? this.config.retries); attempt++) {
      try {
        if (attempt > 0) {
          logger.info(`🔄 Retry ${attempt} for test "${test.name}"`)
        }

        const result = await Promise.race([
          test.fn(),
          new Promise<TestResult>((_, reject) => 
            setTimeout(() => reject(new Error('Test timeout')), 
              test.timeout ?? this.config.timeout
            )
          )
        ])

        const duration = Date.now() - startTime
        return { ...result, duration }
      } catch (err) {
        lastError = err as Error
        logger.error(`❌ Test "${test.name}" failed on attempt ${attempt + 1}: ${err}`)
      }
    }

    return {
      success: false,
      name: test.name,
      message: `Test failed after ${test.retries ?? this.config.retries} retries`,
      duration: Date.now() - startTime,
      error: lastError
    }
  }

  private async runSuite(suite: TestSuite): Promise<TestSuiteResult> {
    const startTime = Date.now()
    const results: TestResult[] = []

    try {
      logger.info(`🚀 Starting test suite "${suite.name}"`)
      
      if (suite.beforeAll) {
        await suite.beforeAll()
      }

      if (this.config.parallel) {
        const testPromises = suite.tests.map(async (test) => {
          if (suite.beforeEach) {
            await suite.beforeEach()
          }

          const result = await this.runTest(test)
          results.push(result)

          if (suite.afterEach) {
            await suite.afterEach()
          }

          return result
        })

        await Promise.all(testPromises)
      } else {
        for (const test of suite.tests) {
          if (suite.beforeEach) {
            await suite.beforeEach()
          }

          const result = await this.runTest(test)
          results.push(result)

          if (suite.afterEach) {
            await suite.afterEach()
          }
        }
      }

      if (suite.afterAll) {
        await suite.afterAll()
      }

      const success = results.every(r => r.success)
      const duration = Date.now() - startTime

      logger.info(`${success ? '✅' : '❌'} Test suite "${suite.name}" completed in ${duration}ms`)

      return {
        name: suite.name,
        success,
        results,
        duration
      }
    } catch (err) {
      const error = err as Error
      logger.error(`❌ Test suite "${suite.name}" failed: ${error.message}`)

      return {
        name: suite.name,
        success: false,
        results,
        duration: Date.now() - startTime,
        error
      }
    }
  }

  public async runAll(): Promise<TestRunnerResult> {
    const startTime = Date.now()
    const suiteResults: TestSuiteResult[] = []

    logger.info('🎯 Starting test run')

    if (this.config.parallel) {
      const suitePromises = this.suites.map(suite => this.runSuite(suite))
      suiteResults.push(...await Promise.all(suitePromises))
    } else {
      for (const suite of this.suites) {
        const result = await this.runSuite(suite)
        suiteResults.push(result)
      }
    }

    const totalDuration = Date.now() - startTime
    const allResults = suiteResults.flatMap(s => s.results)
    const passedTests = allResults.filter(r => r.success).length
    const failedTests = allResults.length - passedTests

    const result: TestRunnerResult = {
      success: failedTests === 0,
      suites: suiteResults,
      totalDuration,
      passedTests,
      failedTests,
      totalTests: allResults.length
    }

    logger.info(`
🏁 Test run completed in ${totalDuration}ms
✅ Passed: ${passedTests}
❌ Failed: ${failedTests}
📊 Total: ${allResults.length}
    `)

    return result
  }
} 