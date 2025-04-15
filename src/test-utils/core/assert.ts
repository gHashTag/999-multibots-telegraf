/**
 * Модуль для проверки условий в тестах
 */

export class AssertionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AssertionError'
  }
}

export interface Assert {
  (condition: boolean, message?: string): void
  isTrue(condition: boolean, message?: string): void
  isFalse(condition: boolean, message?: string): void
  equal<T>(actual: T, expected: T, message?: string): void
  notEqual<T>(actual: T, expected: T, message?: string): void
  wasCalled(fn: Function, message?: string): void
  wasCalledWith(fn: Function, args: any[], message?: string): void
}

const assert: Assert = Object.assign(
  (condition: boolean, message?: string) => {
    if (!condition) {
      throw new AssertionError(message || 'Assertion failed')
    }
  },
  {
    isTrue(condition: boolean, message?: string) {
      if (!condition) {
        throw new AssertionError(message || 'Expected condition to be true')
      }
    },
    isFalse(condition: boolean, message?: string) {
      if (condition) {
        throw new AssertionError(message || 'Expected condition to be false')
      }
    },
    equal<T>(actual: T, expected: T, message?: string) {
      if (actual !== expected) {
        throw new AssertionError(
          message || `Expected ${actual} to equal ${expected}`
        )
      }
    },
    notEqual<T>(actual: T, expected: T, message?: string) {
      if (actual === expected) {
        throw new AssertionError(
          message || `Expected ${actual} not to equal ${expected}`
        )
      }
    },
    wasCalled(fn: Function, message?: string) {
      const mockFn = fn as any
      if (!mockFn.mock?.calls?.length) {
        throw new AssertionError(message || 'Expected function to be called')
      }
    },
    wasCalledWith(fn: Function, args: any[], message?: string) {
      const mockFn = fn as any
      if (!mockFn.mock?.calls?.some((call: any[]) => 
        JSON.stringify(call) === JSON.stringify(args)
      )) {
        throw new AssertionError(
          message || `Expected function to be called with ${JSON.stringify(args)}`
        )
      }
    }
  }
)

export default assert 