export interface TestConfig {
  timeouts: {
    default: number
    sandbox: number
    model: number
  }
  retries: {
    default: number
    sandbox: number
    model: number
  }
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error'
    format: 'emoji' | 'text'
  }
  cleanup: {
    enabled: boolean
    interval: number
  }
}

export interface TestResult {
  name: string;
  success: boolean;
  message: string;
  duration: number;
  suite?: string;
  error?: Error;
}

/**
 * Represents a test case
 */
export interface TestCase {
  name: string;
  fn: () => Promise<TestResult>;
  timeout?: number;
  retries?: number;
}

/**
 * Configuration for the test runner
 */
export interface TestRunnerConfig {
  timeout: number;
  retries: number;
  bail: boolean;
  logLevel: string;
  parallel: boolean;
  timeouts: TestTimeouts;
  cleanup?: boolean;
}

// Test environment configuration interface
export interface TestEnvironmentConfig {
  isCI: boolean
  isDevelopment: boolean
  isProduction: boolean
}

/**
 * Represents a test suite
 */
export interface TestSuite {
  name: string;
  tests: TestCase[];
  hooks?: TestHooks;
  timeout?: number;
}

/**
 * Result of running a test suite
 */
export interface TestSuiteResult {
  name: string;
  results: TestResult[];
  duration: number;
  timestamp: number;
}

/**
 * Result of running all test suites
 */
export interface TestRunnerResult {
  suites: TestSuiteResult[];
  totalDuration: number;
  timestamp: number;
  passed: number;
  failed: number;
  total: number;
}

// Функция теста
export type TestFunction = () => Promise<TestResult>;

// Хуки для набора тестов
export interface TestHooks {
  beforeAll?: () => Promise<void>;
  afterAll?: () => Promise<void>;
  beforeEach?: () => Promise<void>;
  afterEach?: () => Promise<void>;
}

// Набор тестов
export interface TestTimeouts {
  test: number;
  suite: number;
  cleanup: number;
  default?: number;
}

// Мок функция
export interface MockResult<T = any> {
  type: 'return' | 'throw';
  value: T;
}

export interface MockState {
  calls: any[][];
  results: Array<{ type: 'return' | 'throw'; value: any }>;
  instances: any[];
  lastCall?: any[];
}

export interface MockFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): ReturnType<T>;
  mock: MockState;
  mockClear: () => void;
  mockReset: () => void;
  mockRestore: () => void;
  mockImplementation: (fn: T) => MockFunction<T>;
  mockImplementationOnce: (fn: T) => MockFunction<T>;
  mockReturnValue: (value: ReturnType<T>) => MockFunction<T>;
  mockReturnValueOnce: (value: ReturnType<T>) => MockFunction<T>;
  mockRejectedValue: (value: any) => MockFunction<T>;
  mockRejectedValueOnce: (value: any) => MockFunction<T>;
}

// Spy функция
export interface SpyFunction<T extends (...args: any[]) => any> extends MockFunction<T> {
  mockImplementation: (fn: T) => SpyFunction<T>;
  mockImplementationOnce: (fn: T) => SpyFunction<T>;
  mockReturnValue: (value: ReturnType<T>) => SpyFunction<T>;
  mockReturnValueOnce: (value: ReturnType<T>) => SpyFunction<T>;
  mockRejectedValue: (value: any) => SpyFunction<T>;
  mockRejectedValueOnce: (value: any) => SpyFunction<T>;
} 