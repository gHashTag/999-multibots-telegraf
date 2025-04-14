import { TestResult, TestCase, TestSuite, TestRunnerConfig, MockFunction, SpyFunction, MockState, TestTimeouts, TestHooks } from '../types/test'
import { TEST_CONFIG, TEST_RUNNER_CONFIG } from './test-config'
import { logger } from '../logger'
import { performance } from 'perf_hooks'

const DEFAULT_TIMEOUTS: TestTimeouts = {
  test: 5000,
  suite: 30000,
  cleanup: 5000
}

const DEFAULT_CONFIG: TestRunnerConfig = {
  timeout: 5000,
  retries: 3,
  bail: false,
  logLevel: 'info',
  parallel: false,
  timeouts: DEFAULT_TIMEOUTS
}

// Utility to run a single test case
export async function runTest(test: TestCase, config: TestRunnerConfig = DEFAULT_CONFIG): Promise<TestResult> {
  const startTime = Date.now()
  
  try {
    for (let attempt = 1; attempt <= (test.retries || config.retries); attempt++) {
      try {
        const result = await Promise.race([
          test.fn(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Test timeout')), test.timeout || config.timeout)
          )
        ])
        
        result.duration = Date.now() - startTime
        return result
      } catch (error) {
        if (attempt === (test.retries || config.retries)) {
          throw error
        }
        logger.warn(`Test "${test.name}" failed, attempt ${attempt}/${test.retries || config.retries}`)
      }
    }
    throw new Error('All retries failed')
  } catch (error) {
    return createFailResult(test.name, error as Error)
  }
}

// Utility to run multiple test cases
export async function runTests(testCases: TestCase[]): Promise<TestResult[]> {
  logger.info(`🎯 Running ${testCases.length} tests`)
  
  const results = TEST_RUNNER_CONFIG.parallel
    ? await Promise.all(testCases.map(runTest))
    : await testCases.reduce(async (promise, testCase) => {
        const results = await promise
        const result = await runTest(testCase)
        
        if (TEST_RUNNER_CONFIG.stopOnFirstFailure && !result.success) {
          throw new Error(`Test suite stopped due to failure in test: ${result.name}`)
        }
        
        return [...results, result]
      }, Promise.resolve([] as TestResult[]))
  
  const summary = {
    total: results.length,
    passed: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length
  }
  
  logger.info(`
🏁 Test Summary:
📊 Total: ${summary.total}
✅ Passed: ${summary.passed}
❌ Failed: ${summary.failed}
  `)
  
  return results
}

// Utility to create a mock function
export function createMockFunction<T extends (...args: any[]) => any>(): MockFunction<T> {
  const state: MockState = {
    calls: [],
    results: [],
    instances: [],
    lastCall: undefined
  };

  const mockFn = function(...args: Parameters<T>): ReturnType<T> {
    state.calls.push(args);
    state.lastCall = args;

    const nextResult = state.results.shift();
    if (nextResult) {
      if (nextResult.type === 'throw') {
        throw nextResult.value;
      }
      return nextResult.value as ReturnType<T>;
    }

    return undefined as unknown as ReturnType<T>;
  } as MockFunction<T>;

  mockFn.mock = state;

  mockFn.mockClear = () => {
    state.calls = [];
    state.results = [];
    state.instances = [];
    state.lastCall = undefined;
  };

  mockFn.mockReset = () => {
    mockFn.mockClear();
  };

  mockFn.mockRestore = () => {
    mockFn.mockReset();
  };

  mockFn.mockImplementation = (fn: T) => {
    mockFn.mockReset();
    state.results.push({ type: 'return', value: fn() });
    return mockFn;
  };

  mockFn.mockImplementationOnce = (fn: T) => {
    state.results.push({ type: 'return', value: fn() });
    return mockFn;
  };

  mockFn.mockReturnValue = (value: ReturnType<T>) => {
    state.results = [{ type: 'return', value }];
    return mockFn;
  };

  mockFn.mockReturnValueOnce = (value: ReturnType<T>) => {
    state.results.push({ type: 'return', value });
    return mockFn;
  };

  mockFn.mockRejectedValue = (value: any) => {
    state.results = [{ type: 'throw', value }];
    return mockFn;
  };

  mockFn.mockRejectedValueOnce = (value: any) => {
    state.results.push({ type: 'throw', value });
    return mockFn;
  };

  return mockFn;
}

// Utility to wait for a condition
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = TEST_CONFIG.timeouts.default,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now()
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) return
    await new Promise(resolve => setTimeout(resolve, interval))
  }
  
  throw new Error(`Condition not met within ${timeout}ms timeout`)
}

// Utility to cleanup test resources
export async function cleanupTestResources(): Promise<void> {
  if (!TEST_CONFIG.cleanup.enabled) return
  
  try {
    logger.info('🧹 Cleaning up test resources...')
    // Add cleanup logic here
    
    logger.info('✨ Cleanup completed')
  } catch (err) {
    logger.error('🚨 Error during cleanup:', err)
  }
}

/**
 * Creates a test case
 */
export function createTest(name: string, fn: () => Promise<TestResult>, options?: Partial<TestCase>): TestCase {
  return {
    name,
    fn,
    ...options
  };
}

/**
 * Creates a test suite
 */
export function createSuite(name: string, tests: TestCase[], hooks?: Partial<TestSuite>): TestSuite {
  return {
    name,
    tests,
    ...hooks
  };
}

/**
 * Creates a successful test result
 */
export function createSuccessResult(name: string, message = 'Test passed'): TestResult {
  return {
    name,
    success: true,
    message,
    duration: 0
  };
}

/**
 * Creates a failed test result
 */
export function createFailResult(name: string, error: Error): TestResult {
  return {
    name,
    success: false,
    message: error.message,
    error,
    duration: 0
  };
}

/**
 * Asserts that a condition is true
 */
export function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Asserts that two values are equal
 */
export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected} but got ${actual}`);
  }
}

/**
 * Asserts that a value is defined
 */
export function assertDefined<T>(value: T | undefined | null, message?: string): asserts value is T {
  if (value === undefined || value === null) {
    throw new Error(message || 'Value is undefined or null');
  }
}

/**
 * Asserts that a promise rejects
 */
export async function assertRejects(promise: Promise<any>, errorType?: new (...args: any[]) => Error): Promise<void> {
  try {
    await promise;
    throw new Error('Expected promise to reject');
  } catch (error) {
    if (errorType && !(error instanceof errorType)) {
      throw new Error(`Expected error to be instance of ${errorType.name}`);
    }
  }
}

/**
 * Waits for the specified number of milliseconds
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Creates a spy function
 */
export function createSpyFunction<T extends (...args: any[]) => any>(implementation: T): SpyFunction<T> {
  const mockFn = createMockFunction<T>();
  mockFn.mockImplementation(implementation);
  return mockFn as SpyFunction<T>;
}

/**
 * Logs test results
 */
export function logTestResults(results: TestResult[]): void {
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  logger.info(`🎯 Test Results:
    ✅ Passed: ${passed}
    ❌ Failed: ${failed}
    ⏱️ Total Duration: ${results.reduce((sum, r) => sum + (r.duration || 0), 0)}ms
  `);

  results.forEach(result => {
    if (!result.success) {
      logger.error(`❌ ${result.name}: ${result.message}`, result.error);
    }
  });
}

/**
 * Runs a test suite
 */
export async function runTestSuite(suite: TestSuite): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  try {
    if (suite.beforeAll) {
      await suite.beforeAll();
    }

    for (const test of suite.tests) {
      if (suite.beforeEach) {
        await suite.beforeEach();
      }

      const startTime = Date.now();
      try {
        const result = await test.fn();
        result.duration = Date.now() - startTime;
        results.push(result);
      } catch (error) {
        results.push(createFailResult(test.name, error as Error));
      }

      if (suite.afterEach) {
        await suite.afterEach();
      }
    }

    if (suite.afterAll) {
      await suite.afterAll();
    }
  } catch (error) {
    logger.error(`❌ Suite "${suite.name}" failed:`, error);
  }

  return results;
}

/**
 * Runs multiple test suites
 */
export async function runTestSuites(suites: TestSuite[]): Promise<TestResult[]> {
  const allResults: TestResult[] = [];
  
  for (const suite of suites) {
    const results = await runTestSuite(suite);
    allResults.push(...results);
  }

  logTestResults(allResults);
  return allResults;
}

export class TestRunner {
  private suites: TestSuite[] = [];
  private config: TestRunnerConfig;

  constructor(config: Partial<TestRunnerConfig> = {}) {
    this.config = { 
      ...DEFAULT_CONFIG, 
      ...config,
      timeouts: { ...DEFAULT_TIMEOUTS, ...config.timeouts }
    };
  }

  addSuite(suite: TestSuite) {
    this.suites.push(suite);
  }

  private async runTest(test: TestCase, hooks?: TestHooks): Promise<TestResult> {
    const startTime = Date.now();
    const timeout = test.timeout || this.config.timeouts?.test || DEFAULT_TIMEOUTS.test;
    const maxRetries = test.retries || this.config.retries || DEFAULT_CONFIG.retries;
    
    let lastError: Error | null = null;
    let attempts = 0;

    while (attempts <= maxRetries) {
      try {
        if (hooks?.beforeEach) {
          await hooks.beforeEach();
        }

        const result = await Promise.race([
          test.fn(),
          new Promise<TestResult>((_, reject) => {
            setTimeout(() => reject(new Error(`Test "${test.name}" timed out after ${timeout}ms`)), timeout);
          })
        ]);

        if (hooks?.afterEach) {
          await hooks.afterEach();
        }

        return {
          name: test.name,
          success: true,
          message: result.message || 'Test passed successfully',
          duration: Date.now() - startTime
        };
      } catch (error) {
        lastError = error as Error;
        attempts++;
        
        if (attempts <= maxRetries) {
          logger.warn(`Test "${test.name}" failed, retrying (${attempts}/${maxRetries})`);
          continue;
        }
      }
    }

    return {
      name: test.name,
      success: false,
      message: lastError?.message || 'Unknown error',
      duration: Date.now() - startTime
    };
  }

  private async runSuite(suite: TestSuite): Promise<TestResult[]> {
    const results: TestResult[] = [];
    const timeout = this.config.timeouts?.suite || DEFAULT_TIMEOUTS.suite;

    try {
      if (suite.hooks?.beforeAll) {
        await suite.hooks.beforeAll();
      }

      for (const test of suite.tests) {
        const result = await this.runTest(test, suite.hooks);
        results.push({
          name: result.name,
          success: result.success,
          message: result.message,
          duration: result.duration,
          suite: suite.name
        });

        if (!result.success && this.config.bail) {
          break;
        }
      }

      if (suite.hooks?.afterAll) {
        await suite.hooks.afterAll();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Suite "${suite.name}" failed: ${errorMessage}`);
      results.push({
        name: suite.name,
        success: false,
        message: errorMessage,
        suite: suite.name,
        duration: 0
      });
    }

    return results;
  }

  async run(): Promise<TestResult[]> {
    const allResults: TestResult[] = [];

    if (this.config.parallel) {
      const suitePromises = this.suites.map(suite => this.runSuite(suite));
      const results = await Promise.all(suitePromises);
      results.forEach(suiteResults => allResults.push(...suiteResults));
    } else {
      for (const suite of this.suites) {
        const results = await this.runSuite(suite);
        allResults.push(...results);
      }
    }

    return allResults;
  }
}

export function generateTestId(): string {
  return `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
} 