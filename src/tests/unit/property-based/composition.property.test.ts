/**
 * Property-based Tests for Composition Utilities
 * Using vitest's test.each for property-based testing
 */

import { describe, it, expect, vi } from 'vitest'
import { pipe, flow, curry, uncurry, flip, identity, constant, tap } from '../../../core/functional/utils/composition'

// ===== BASIC PROPERTIES =====

describe('Composition - Basic Properties', () => {
  describe('pipe should compose functions left-to-right', () => {
    it.each([
      {
        input: 5,
        fns: [
          (x: number) => x + 1,
          (x: number) => x * 2,
          (x: number) => x - 3
        ],
        expected: 9
      },
      {
        input: 'hello',
        fns: [
          (x: string) => x.toUpperCase(),
          (x: string) => x + '!',
          (x: string) => x.repeat(2)
        ],
        expected: 'HELLO!HELLO!'
      }
    ])('should pipe $input through functions to get $expected', ({ input, fns, expected }) => {
      const piped = pipe(...fns)
      const result = piped(input)
      expect(result).toEqual(expected)
    })
  })

  describe('flow should compose functions right-to-left', () => {
    it.each([
      {
        input: 10,
        fns: [
          (x: number) => x - 3,
          (x: number) => x * 2,
          (x: number) => x + 1
        ],
        expected: 21
      },
      {
        input: 'test',
        fns: [
          (x: string) => x.repeat(2),
          (x: string) => x + '!',
          (x: string) => x.toUpperCase()
        ],
        expected: 'TEST!TEST!'
      }
    ])('should flow $input through functions to get $expected', ({ input, fns, expected }) => {
      const flowed = flow(...fns)
      const result = flowed(input)
      expect(result).toEqual(expected)
    })
  })

  describe('identity should return input unchanged', () => {
    it.each([
      { value: 42 },
      { value: 'test' },
      { value: { a: 1, b: 2 } },
      { value: [1, 2, 3] },
      { value: null },
      { value: undefined },
      { value: true }
    ])('should return $value unchanged', ({ value }) => {
      const result = identity(value)
      expect(result).toBe(value)
    })
  })

  describe('constant should always return the same value', () => {
    it.each([
      { value: 42, input: 'anything' },
      { value: 'constant', input: 123 },
      { value: { a: 1 }, input: [1, 2, 3] }
    ])('should always return $value regardless of input', ({ value, input }) => {
      const constantFn = constant(value)
      const result = constantFn(input)
      expect(result).toBe(value)
    })
  })

  describe('tap should execute side effects without changing value', () => {
    it.each([
      { value: 42, expected: 42 },
      { value: 'test', expected: 'test' },
      { value: { a: 1 }, expected: { a: 1 } }
    ])('should tap $value without changing it', ({ value, expected }) => {
      const tapFn = vi.fn()
      const result = tap(value, tapFn)
      expect(tapFn).toHaveBeenCalledWith(value)
      expect(result).toEqual(expected)
    })
  })
})

// ===== CURRYING PROPERTIES =====

describe('Composition - Currying Properties', () => {
  describe('curry should transform function for partial application', () => {
    it('should allow partial application', () => {
      const add = (a: number, b: number) => a + b
      const curriedAdd = curry(add)
      const add5 = curriedAdd(5)
      const result = add5(3)
      expect(result).toBe(8)
    })

    it('should work with multiple arguments', () => {
      const multiply = (a: number, b: number, c: number) => a * b * c
      const curriedMultiply = curry(multiply)
      const multiply2and3 = curriedMultiply(2)(3)
      const result = multiply2and3(4)
      expect(result).toBe(24)
    })

    it('should allow all arguments at once', () => {
      const add = (a: number, b: number) => a + b
      const curriedAdd = curry(add)
      const result = curriedAdd(5)(3)
      expect(result).toBe(8)
    })
  })

  describe('uncurry should transform curried function to regular function', () => {
    it('should convert curried function to regular function', () => {
      const curriedAdd = (a: number) => (b: number) => a + b
      const uncurriedAdd = uncurry(curriedAdd)
      const result = uncurriedAdd(5, 3)
      expect(result).toBe(8)
    })

    it('should work with multiple arguments', () => {
      const curriedMultiply = (a: number) => (b: number) => (c: number) => a * b * c
      const uncurriedMultiply = uncurry(curriedMultiply)
      const result = uncurriedMultiply(2, 3, 4)
      expect(result).toBe(24)
    })
  })

  describe('flip should swap function arguments', () => {
    it('should swap two arguments', () => {
      const subtract = (a: number, b: number) => a - b
      const flipped = flip(subtract)
      const result1 = subtract(5, 3) // 5 - 3 = 2
      const result2 = flipped(5, 3) // 3 - 5 = -2
      expect(result1).toBe(2)
      expect(result2).toBe(-2)
    })

    it('should work with any types', () => {
      const concat = (a: string, b: string) => a + b
      const flipped = flip(concat)
      const result = flipped('world', 'hello')
      expect(result).toBe('helloworld')
    })
  })
})

// ===== COMPOSITION LAWS =====

describe('Composition - Functional Laws', () => {
  describe('pipe should be associative', () => {
    it('should produce same result regardless of grouping', () => {
      const fn1 = (x: number) => x + 1
      const fn2 = (x: number) => x * 2
      const fn3 = (x: number) => x - 3
      const input = 5

      // (fn1 |> fn2) |> fn3
      const composed1 = pipe(pipe(fn1, fn2), fn3)
      const result1 = composed1(input)

      // fn1 |> (fn2 |> fn3)
      const composed2 = pipe(fn1, pipe(fn2, fn3))
      const result2 = composed2(input)

      expect(result1).toBe(result2)
    })
  })

  describe('flow should be associative', () => {
    it('should produce same result regardless of grouping', () => {
      const fn1 = (x: number) => x + 1
      const fn2 = (x: number) => x * 2
      const fn3 = (x: number) => x - 3
      const input = 5

      // (fn1 |> fn2) |> fn3
      const composed1 = flow(flow(fn1, fn2), fn3)
      const result1 = composed1(input)

      // fn1 |> (fn2 |> fn3)
      const composed2 = flow(fn1, flow(fn2, fn3))
      const result2 = composed2(input)

      expect(result1).toBe(result2)
    })
  })

  describe('identity should be neutral element', () => {
    it('should work on left side of pipe', () => {
      const fn = (x: number) => x * 2
      const input = 5
      const result1 = pipe(identity, fn)(input)
      const result2 = fn(input)
      expect(result1).toBe(result2)
    })

    it('should work on right side of pipe', () => {
      const fn = (x: number) => x * 2
      const input = 5
      const result1 = pipe(fn, identity)(input)
      const result2 = fn(input)
      expect(result1).toBe(result2)
    })
  })

  describe('pipe with identity should be equivalent to no composition', () => {
    it.each([
      { fn: (x: number) => x + 1, input: 5 },
      { fn: (x: string) => x.toUpperCase(), input: 'hello' },
      { fn: (x: number[]) => x.length, input: [1, 2, 3] }
    ])('should be equivalent to calling $fn directly', ({ fn, input }) => {
      const result1 = pipe(fn)(input)
      const result2 = fn(input)
      expect(result1).toEqual(result2)
    })
  })
})

// ===== COMPLEX COMPOSITIONS =====

describe('Composition - Complex Compositions', () => {
  it('should handle complex function pipelines', () => {
    const input = 10

    const result = pipe(
      (x: number) => x + 5,
      (x: number) => x * 2,
      (x: number) => Math.floor(x / 3),
      (x: number) => x - 1
    )(input)

    // (10 + 5) * 2 = 30
    // floor(30 / 3) = 10
    // 10 - 1 = 9
    expect(result).toBe(9)
  })

  it('should handle async functions with pipe', async () => {
    const asyncFn1 = async (x: number) => x + 1
    const asyncFn2 = async (x: number) => x * 2

    const piped = pipe(asyncFn1, asyncFn2)
    const result = await piped(5)

    expect(result).toBe(12) // (5 + 1) * 2 = 12
  })

  it('should preserve function arity through composition', () => {
    const fn1 = (a: number, b: number) => a + b
    const fn2 = (x: number) => x * 2

    const composed = pipe(fn1, fn2)
    // Should still work with two arguments for fn1
    const result1 = composed(5, 3) // (5 + 3) * 2 = 16
    expect(result1).toBe(16)
  })
})
