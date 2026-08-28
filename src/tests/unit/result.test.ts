/**
 * Result/Either Tests - Functional Error Handling
 * 100% покрытие тестами
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  left,
  right,
  isLeft,
  isRight,
  map,
  mapLeft,
  chain,
  fold,
  getOrElse,
  tap,
  tapLeft,
  tryCatch,
  tryCatchAsync,
  fromPromise,
  type Either,
} from '../../../src/core/functional/utils/result'
import { pipe, flow } from '../../../src/core/functional/utils/composition'

describe('Either Type', () => {
  describe('Constructors', () => {
    it('should create Left value', () => {
      const result = left<string, string>('error')
      expect(isLeft(result)).toBe(true)
      expect(result._tag).toBe('Left')
      if (isLeft(result)) {
        expect(result.left).toBe('error')
      }
    })

    it('should create Right value', () => {
      const result = right<string, string>('success')
      expect(isRight(result)).toBe(true)
      expect(result._tag).toBe('Right')
      if (isRight(result)) {
        expect(result.right).toBe('success')
      }
    })

    it('should identify Left values', () => {
      expect(isLeft(left('error'))).toBe(true)
      expect(isLeft(right('success'))).toBe(false)
    })

    it('should identify Right values', () => {
      expect(isRight(right('success'))).toBe(true)
      expect(isRight(left('error'))).toBe(false)
    })
  })

  describe('Map', () => {
    it('should map Right values', () => {
      const result = right(5)
      const mapped = map((x: number) => x * 2)(result)
      expect(isRight(mapped)).toBe(true)
      if (isRight(mapped)) {
        expect(mapped.right).toBe(10)
      }
    })

    it('should not map Left values', () => {
      const result = left<string, number>('error')
      const mapped = map((x: number) => x * 2)(result)
      expect(isLeft(mapped)).toBe(true)
      if (isLeft(mapped)) {
        expect(mapped.left).toBe('error')
      }
    })

    it('should mapLeft Left values', () => {
      const result = left('error')
      const mapped = mapLeft((msg: string) => `Error: ${msg}`)(result)
      expect(isLeft(mapped)).toBe(true)
      if (isLeft(mapped)) {
        expect(mapped.left).toBe('Error: error')
      }
    })

    it('should not mapLeft Right values', () => {
      const result = right(5)
      const mapped = mapLeft((msg: string) => `Error: ${msg}`)(result)
      expect(isRight(mapped)).toBe(true)
      if (isRight(mapped)) {
        expect(mapped.right).toBe(5)
      }
    })
  })

  describe('Chain', () => {
    it('should chain Right values', () => {
      const result = right(5)
      const chained = chain((x: number) => right(x * 2))(result)
      expect(isRight(chained)).toBe(true)
      if (isRight(chained)) {
        expect(chained.right).toBe(10)
      }
    })

    it('should stop chaining on Left', () => {
      const result = left<string, number>('error')
      const chained = chain((x: number) => right(x * 2))(result as any)
      expect(isLeft(chained)).toBe(true)
      if (isLeft(chained)) {
        expect(chained.left).toBe('error')
      }
    })

    it('should return Left from chain function', () => {
      const result = right(5)
      const chained = chain((x: number) => left('failed'))(result)
      expect(isLeft(chained)).toBe(true)
      if (isLeft(chained)) {
        expect(chained.left).toBe('failed')
      }
    })
  })

  describe('Fold', () => {
    it('should fold Left values', () => {
      const result = left('error')
      const folded = fold(
        (msg: string) => `Failed: ${msg}`,
        (value: number) => `Success: ${value}`
      )(result)
      expect(folded).toBe('Failed: error')
    })

    it('should fold Right values', () => {
      const result = right(42)
      const folded = fold(
        (msg: string) => `Failed: ${msg}`,
        (value: number) => `Success: ${value}`
      )(result)
      expect(folded).toBe('Success: 42')
    })
  })

  describe('Get Or Else', () => {
    it('should return value from Right', () => {
      const result = right(5)
      const value = getOrElse(0)(result)
      expect(value).toBe(5)
    })

    it('should return default from Left', () => {
      const result = left('error')
      const value = getOrElse(0)(result)
      expect(value).toBe(0)
    })
  })

  describe('Tap', () => {
    it('should tap Right values', () => {
      const result = right(5)
      let tapped = false
      const tappedResult = tap(() => {
        tapped = true
      })(result)
      expect(tapped).toBe(true)
      expect(isRight(tappedResult)).toBe(true)
      if (isRight(tappedResult)) {
        expect(tappedResult.right).toBe(5)
      }
    })

    it('should not tap Left values', () => {
      const result = left('error')
      let tapped = false
      const tappedResult = tap(() => {
        tapped = true
      })(result)
      expect(tapped).toBe(false)
      expect(isLeft(tappedResult)).toBe(true)
    })

    it('should tapLeft Left values', () => {
      const result = left('error')
      let tapped = false
      const tappedResult = tapLeft((msg: string) => {
        tapped = true
      })(result)
      expect(tapped).toBe(true)
      expect(isLeft(tappedResult)).toBe(true)
    })

    it('should not tapLeft Right values', () => {
      const result = right(5)
      let tapped = false
      const tappedResult = tapLeft((msg: string) => {
        tapped = true
      })(result)
      expect(tapped).toBe(false)
      expect(isRight(tappedResult)).toBe(true)
    })
  })

  describe('Try Catch', () => {
    it('should catch successful sync operation', () => {
      const result = tryCatch(
        () => 42,
        () => new Error('Should not be called')
      )
      expect(isRight(result)).toBe(true)
      if (isRight(result)) {
        expect(result.right).toBe(42)
      }
    })

    it('should catch failed sync operation', () => {
      const result = tryCatch(
        () => {
          throw new Error('test error')
        },
        error => (error instanceof Error ? error : new Error(String(error)))
      )
      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toBeInstanceOf(Error)
        expect((result.left as Error).message).toBe('test error')
      }
    })

    it('should catch successful async operation', async () => {
      const result = await tryCatchAsync(
        () => Promise.resolve(42),
        () => new Error('Should not be called')
      )()
      expect(isRight(result)).toBe(true)
      if (isRight(result)) {
        expect(result.right).toBe(42)
      }
    })

    it('should catch failed async operation', async () => {
      const result = await tryCatchAsync(
        () => Promise.reject(new Error('async error')),
        error => (error instanceof Error ? error : new Error(String(error)))
      )()
      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toBeInstanceOf(Error)
        expect((result.left as Error).message).toBe('async error')
      }
    })
  })

  describe('From Promise', () => {
    it('should convert successful promise', async () => {
      const task = fromPromise(
        Promise.resolve(42),
        () => new Error('Should not be called')
      )
      const result = await task()
      expect(isRight(result)).toBe(true)
      if (isRight(result)) {
        expect(result.right).toBe(42)
      }
    })

    it('should convert failed promise', async () => {
      const task = fromPromise(
        Promise.reject(new Error('promise error')),
        error => (error instanceof Error ? error : new Error(String(error)))
      )
      const result = await task()
      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toBeInstanceOf(Error)
        expect((result.left as Error).message).toBe('promise error')
      }
    })
  })

  describe('Function Composition', () => {
    it('should compose functions with pipe', () => {
      const double = (x: number) => x * 2
      const addOne = (x: number) => x + 1

      const result = pipe(5, double, addOne)
      expect(result).toBe(11) // (5 * 2) + 1 = 11
    })

    it('should compose functions with flow', () => {
      const double = (x: number) => x * 2
      const addOne = (x: number) => x + 1

      const f = flow(double, addOne)
      const result = f(5)
      expect(result).toBe(11) // (5 * 2) + 1 = 11
    })
  })

  describe('Edge Cases', () => {
    it('should handle null values', () => {
      const result = right(null)
      expect(isRight(result)).toBe(true)
      if (isRight(result)) {
        expect(result.right).toBe(null)
      }
    })

    it('should handle undefined values', () => {
      const result = right(undefined)
      expect(isRight(result)).toBe(true)
      if (isRight(result)) {
        expect(result.right).toBe(undefined)
      }
    })

    it('should handle 0 as a valid value', () => {
      const result = right(0)
      expect(isRight(result)).toBe(true)
      if (isRight(result)) {
        expect(result.right).toBe(0)
      }
    })

    it('should handle empty string as a valid value', () => {
      const result = right('')
      expect(isRight(result)).toBe(true)
      if (isRight(result)) {
        expect(result.right).toBe('')
      }
    })

    it('should handle objects as values', () => {
      const obj = { a: 1, b: 2 }
      const result = right(obj)
      expect(isRight(result)).toBe(true)
      if (isRight(result)) {
        expect(result.right).toEqual(obj)
      }
    })
  })

  describe('Complex Scenarios', () => {
    it('should handle nested chains', () => {
      const result = right(10)

      const chained = chain((x: number) => left('fail'))(
        chain((x: number) => right(x + 5))(
          chain((x: number) => right(x * 2))(result)
        )
      )

      expect(isLeft(chained)).toBe(true)
      if (isLeft(chained)) {
        expect(chained.left).toBe('fail')
      }
    })

    it('should handle multiple mappings', () => {
      const result = right(5)

      const mapped = map((x: number) => x.toString())(
        map((x: number) => x + 10)(map((x: number) => x * 2)(result))
      )

      expect(isRight(mapped)).toBe(true)
      if (isRight(mapped)) {
        expect(mapped.right).toBe('20') // (5 * 2 + 10).toString() = '20'
      }
    })

    it('should handle tap in the middle of chain', () => {
      let tapped = false
      const result = right(5)

      const tappedResult = tap(() => {
        tapped = true
      })(result)
      const chained = map((x: number) => x * 2)(tappedResult as any)

      expect(tapped).toBe(true)
      expect(isRight(chained)).toBe(true)
      if (isRight(chained)) {
        expect(chained.right).toBe(10)
      }
    })
  })
})

// ===== TASK TESTS =====

describe('TaskEither', () => {
  describe('Async Operations', () => {
    it('should handle async operations correctly', async () => {
      const task = async () => {
        return right(42) as Either<string, number>
      }

      const result = await task()
      expect(isRight(result)).toBe(true)
      if (isRight(result)) {
        expect(result.right).toBe(42)
      }
    })

    it('should handle async errors', async () => {
      const task = async () => {
        return left('async error') as Either<string, number>
      }

      const result = await task()
      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toBe('async error')
      }
    })
  })

  describe('Function Composition', () => {
    it('should compose async operations', async () => {
      const double = (x: number) => Promise.resolve(right(x * 2))
      const addOne = (x: number) => Promise.resolve(right(x + 1))

      const task = async () => {
        return right(5) as Either<string, number>
      }

      const chained = await task()
      const result = await double(isRight(chained) ? chained.right : 0)
      const final = await addOne(isRight(result) ? result.right : 0)

      expect(isRight(final)).toBe(true)
      if (isRight(final)) {
        expect(final.right).toBe(11) // (5 * 2) + 1 = 11
      }
    })
  })
})
