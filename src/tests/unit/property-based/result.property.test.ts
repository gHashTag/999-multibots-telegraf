/**
 * Property-based Tests for Result/Either
 * Using vitest's test.each for property-based testing
 */

import { describe, it, expect, vi } from 'vitest'
import {
  right,
  left,
  isRight,
  isLeft,
  map,
  mapLeft,
  chain,
  fold,
  getOrElse,
  tap,
  tapLeft,
  tryCatch,
  tryCatchAsync,
  flatten
} from '../../../core/functional/utils/result'

// ===== GENERATORS =====

const generateRandomString = (): string => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const len = Math.floor(Math.random() * 100) + 1
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

const generateRandomNumber = (): number => {
  return Math.floor(Math.random() * 1000000) - 500000
}

const generateRandomError = (): Error => {
  const messages = ['Error 1', 'Error 2', 'Error 3', 'Connection failed', 'Invalid input', 'Timeout']
  const message = messages[Math.floor(Math.random() * messages.length)]
  return new Error(message)
}

// ===== RIGHT VALUE PROPERTIES =====

describe('Result<E> - Right Value Properties', () => {
  describe('isRight should always return true for right values', () => {
    it.each([
      { value: 'test string' },
      { value: 123 },
      { value: { key: 'value' } },
      { value: [1, 2, 3] },
      { value: null },
      { value: undefined },
      { value: true },
      { value: false }
    ])('should return true for Right($value)', ({ value }) => {
      const result = right(value)
      expect(isRight(result)).toBe(true)
      expect(isLeft(result)).toBe(false)
    })
  })

  describe('map should preserve right values', () => {
    it.each([
      { input: 5, fn: (x: number) => x * 2, expected: 10 },
      { input: 'hello', fn: (x: string) => x.toUpperCase(), expected: 'HELLO' },
      { input: [1, 2, 3], fn: (x: number[]) => x.length, expected: 3 },
      { input: { a: 1 }, fn: (x: any) => x.a, expected: 1 }
    ])('should map Right($input) with $fn to Right($expected)', ({ input, fn, expected }) => {
      const result = right(input)
      const mapped = map(fn)(result)
      expect(isRight(mapped)).toBe(true)
      if (isRight(mapped)) {
        expect(mapped.right).toEqual(expected)
      }
    })
  })

  describe('chain should preserve right values', () => {
    it.each([
      { input: 5, fn: (x: number) => right(x * 2) },
      { input: 'test', fn: (x: string) => right(x.length) },
      { input: [1, 2], fn: (x: number[]) => right(x[0]) }
    ])('should chain Right($input) to Right(result)', ({ input, fn }) => {
      const result = right(input)
      const chained = chain(fn as any)(result as any)
      expect(isRight(chained)).toBe(true)
    })
  })

  describe('fold should call success callback for right values', () => {
    it.each([
      { value: 'success', expected: 'SUCCESS' },
      { value: 42, expected: 84 },
      { value: [1, 2], expected: 2 }
    ])('should fold Right($value) to $expected', ({ value, expected }) => {
      const result = right(value)
      const folded = fold(
        (error: any) => `ERROR: ${error instanceof Error ? error.message : String(error)}`,
        (value: any) => typeof value === 'string' ? value.toUpperCase() : (typeof value === 'number' ? value * 2 : (Array.isArray(value) ? value.length : value))
      )(result)
      expect(folded).toEqual(expected)
    })
  })

  describe('tap should execute side effects for right values', () => {
    it.each([
      { value: 1, expected: 1 },
      { value: 'test', expected: 'test' },
      { value: { a: 1 }, expected: { a: 1 } }
    ])('should tap Right($value) without changing it', ({ value, expected }) => {
      const tapFn = vi.fn()
      const result = right(value)
      const tapped = tap(tapFn)(result)
      expect(tapFn).toHaveBeenCalledWith(value)
      expect(isRight(tapped)).toBe(true)
      if (isRight(tapped)) {
        expect(tapped.right).toEqual(expected)
      }
    })
  })

  describe('getOrElse should return value for right values', () => {
    it.each([
      { value: 'real value', fallback: 'fallback' },
      { value: 42, fallback: 0 },
      { value: null, fallback: 'default' }
    ])('should get value for Right($value)', ({ value, fallback }) => {
      const result = right(value)
      const gotten = getOrElse(fallback)(result)
      expect(gotten).toEqual(value)
    })
  })
})

// ===== LEFT VALUE PROPERTIES =====

describe('Result<E> - Left Value Properties', () => {
  describe('isLeft should always return true for left values', () => {
    it.each([
      { error: new Error('Error 1') },
      { error: new Error('Error 2') },
      { error: new Error('Connection failed') }
    ])('should return true for Left(Error)', ({ error }) => {
      const result = left(error)
      expect(isLeft(result)).toBe(true)
      expect(isRight(result)).toBe(false)
    })
  })

  describe('map should not modify left values', () => {
    it.each([
      { error: new Error('test error') },
      { error: new Error('another error') }
    ])('should not map Left(Error)', ({ error }) => {
      const result = left(error)
      const mapped = map((x: any) => x * 2)(result)
      expect(isLeft(mapped)).toBe(true)
      if (isLeft(mapped)) {
        expect(mapped.left).toBe(error)
      }
    })
  })

  describe('mapLeft should transform left values', () => {
    it.each([
      { error: new Error('original'), fn: (e: Error) => new Error('modified') },
      { error: new Error('test'), fn: (e: Error) => new Error(e.message.toUpperCase()) }
    ])('should mapLeft Left(Error)', ({ error, fn }) => {
      const result = left(error)
      const mapped = mapLeft(fn)(result)
      expect(isLeft(mapped)).toBe(true)
      if (isLeft(mapped)) {
        expect(mapped.left.message).toBe(fn(error).message)
      }
    })
  })

  describe('chain should not execute chain function for left values', () => {
    it.each([
      { error: new Error('test error') },
      { error: new Error('another error') }
    ])('should not chain Left(Error)', ({ error }) => {
      const chainFn = vi.fn(() => right('should not be called'))
      const result = left(error)
      const chained = chain(chainFn as any)(result as any)
      expect(chainFn).not.toHaveBeenCalled()
      expect(isLeft(chained)).toBe(true)
    })
  })

  describe('fold should call error callback for left values', () => {
    it.each([
      { error: new Error('Error 1'), expected: 'ERROR: Error 1' },
      { error: new Error('Error 2'), expected: 'ERROR: Error 2' }
    ])('should fold Left(Error) to $expected', ({ error, expected }) => {
      const result = left(error)
      const folded = fold(
        (error: any) => `ERROR: ${error instanceof Error ? error.message : String(error)}`,
        (value) => value
      )(result)
      expect(folded).toEqual(expected)
    })
  })

  describe('tapLeft should execute side effects for left values', () => {
    it.each([
      { error: new Error('Error 1') },
      { error: new Error('Error 2') }
    ])('should tapLeft Left(Error)', ({ error }) => {
      const tapFn = vi.fn()
      const result = left(error)
      const tapped = tapLeft(tapFn)(result)
      expect(tapFn).toHaveBeenCalledWith(error)
      expect(isLeft(tapped)).toBe(true)
      if (isLeft(tapped)) {
        expect(tapped.left).toBe(error)
      }
    })
  })

  describe('getOrElse should return fallback for left values', () => {
    it.each([
      { error: new Error('test'), fallback: 'fallback' },
      { error: new Error('error'), fallback: 0 }
    ])('should get fallback for Left(Error)', ({ error, fallback }) => {
      const result = left(error)
      const gotten = getOrElse(fallback)(result)
      expect(gotten).toEqual(fallback)
    })
  })
})

// ===== TRY-CATCH PROPERTIES =====

describe('Result<E> - Try-Catch Properties', () => {
  describe('tryCatch should create right values for successful operations', () => {
    it.each([
      { fn: () => 42, expected: 42 },
      { fn: () => 'test', expected: 'test' },
      { fn: () => ({ a: 1 }), expected: { a: 1 } },
      { fn: () => [1, 2, 3], expected: [1, 2, 3] }
    ])('should create Right for successful $fn', ({ fn, expected }) => {
      const result = tryCatch(fn as any, () => new Error('Should not be called'))
      expect(isRight(result)).toBe(true)
      if (isRight(result)) {
        expect(result.right).toEqual(expected)
      }
    })
  })

  describe('tryCatch should create left values for throwing operations', () => {
    it.each([
      { fn: () => { throw new Error('Error 1') } },
      { fn: () => { throw new Error('Error 2') } },
      { fn: () => { throw 'string error' } }
    ])('should create Left for throwing $fn', ({ fn }) => {
      const result = tryCatch(fn, (e) => new Error(String(e)))
      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toBeInstanceOf(Error)
      }
    })
  })

  describe('tryCatchAsync should create right values for successful async operations', () => {
    it.each([
      { fn: async () => 42, expected: 42 },
      { fn: async () => 'test', expected: 'test' },
      { fn: async () => ({ a: 1 }), expected: { a: 1 } }
    ])('should create Right for successful async $fn', async ({ fn, expected }) => {
      const result = await tryCatchAsync(fn as any, () => new Error('Should not be called'))()
      expect(isRight(result)).toBe(true)
      if (isRight(result)) {
        expect(result.right).toEqual(expected)
      }
    })
  })

  describe('tryCatchAsync should create left values for failing async operations', () => {
    it.each([
      { fn: async () => { throw new Error('Async Error 1') } },
      { fn: async () => { throw new Error('Async Error 2') } }
    ])('should create Left for failing async $fn', async ({ fn }) => {
      const result = await tryCatchAsync(fn, (e) => new Error(String(e)))()
      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toBeInstanceOf(Error)
      }
    })
  })
})

// ===== COMPOSITION PROPERTIES =====

describe('Result<E> - Composition Properties', () => {
  describe('flatten should remove one level of nesting', () => {
    it('should flatten nested right values', () => {
      const nested = right(right(42))
      const flattened = flatten(nested)
      expect(isRight(flattened)).toBe(true)
      if (isRight(flattened)) {
        expect(flattened.right).toBe(42)
      }
    })

    it('should preserve left values', () => {
      const nested = left(new Error('outer error'))
      const flattened = flatten(nested)
      expect(isLeft(flattened)).toBe(true)
      if (isLeft(flattened)) {
        expect(flattened.left.message).toBe('outer error')
      }
    })
  })

  describe('chained operations should be associative', () => {
    it('should produce same result regardless of grouping', () => {
      const value = 5
      const fn1 = (x: number) => right(x + 1)
      const fn2 = (x: number) => right(x * 2)
      const fn3 = (x: number) => right(x - 3)

      // (right(value) |> chain(fn1) |> chain(fn2)) |> chain(fn3)
      const result1 = chain(fn2)(chain(fn1)(right(value)))
      const final1 = chain(fn3)(result1)

      // right(value) |> chain(fn1 |> chain(fn2) |> chain(fn3))
      const combined = (x: number) => chain(fn3)(chain(fn2)(fn1(x)))
      const final2 = chain(combined)(right(value))

      expect(isRight(final1) && isRight(final2)).toBe(true)
      if (isRight(final1) && isRight(final2)) {
        expect(final1.right).toBe(final2.right)
      }
    })
  })
})
