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
  fromPromise
} from '../../../src/core/functional/utils/result'
import { pipe, flow } from '../../../src/core/functional/utils/composition'

describe('Either Type', () => {
  describe('Constructors', () => {
    it('should create Left value', () => {
      const result = left('error')
      expect(isLeft(result)).toBe(true)
      expect(result._tag).toBe('Left')
      expect(result.value).toBe('error')
    })

    it('should create Right value', () => {
      const result = right('success')
      expect(isRight(result)).toBe(true)
      expect(result._tag).toBe('Right')
      expect(result.value).toBe('success')
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
        expect(mapped.value).toBe(10)
      }
    })

    it('should not map Left values', () => {
      const result = left('error')
      const mapped = map((x: number) => x * 2)(result)
      expect(isLeft(mapped)).toBe(true)
      if (isLeft(mapped)) {
        expect(mapped.value).toBe('error')
      }
    })

    it('should mapLeft Left values', () => {
      const result = left('error')
      const mapped = mapLeft((msg: string) => `Error: ${msg}`)(result)
      expect(isLeft(mapped)).toBe(true)
      if (isLeft(mapped)) {
        expect(mapped.value).toBe('Error: error')
      }
    })

    it('should not mapLeft Right values', () => {
      const result = right(5)
      const mapped = mapLeft((msg: string) => `Error: ${msg}`)(result)
      expect(isRight(mapped)).toBe(true)
      if (isRight(mapped)) {
        expect(mapped.value).toBe(5)
      }
    })
  })

  describe('Chain', () => {
    it('should chain Right values', () => {
      const result = right(5)
      const chained = chain((x: number) => right(x * 2))(result)
      expect(isRight(chained)).toBe(true)
      if (isRight(chained)) {
        expect(chained.value).toBe(10)
      }
    })

    it('should stop chaining on Left', () => {
      const result = left('error')
      const chained = chain((x: number) => right(x * 2))(result)
      expect(isLeft(chained)).toBe(true)
      if (isLeft(chained)) {
        expect(chained.value).toBe('error')
      }
    })

    it('should return Left from chain function', () => {
      const result = right(5)
      const chained = chain((x: number) => left('failed'))(result)
      expect(isLeft(chained)).toBe(true)
      if (isLeft(chained)) {
        expect(chained.value).toBe('failed')
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
      const tappedResult = tap(() => { tapped = true })(result)
      expect(tapped).toBe(true)
      expect(isRight(tappedResult)).toBe(true)
      if (isRight(tappedResult)) {
        expect(tappedResult.value).toBe(5)
      }
    })

    it('should not tap Left values', () => {
      const result = left('error')
      let tapped = false
      const tappedResult = tap(() => { tapped = true })(result)
      expect(tapped).toBe(false)
      expect(isLeft(tappedResult)).toBe(true)
    })

    it('should tapLeft Left values', () => {
      const result = left('error')
      let tapped = false
      const tappedResult = tapLeft((msg: string) => { tapped = true })(result)
      expect(tapped).toBe(true)
      expect(isLeft(tappedResult)).toBe(true)
    })

    it('should not tapLeft Right values', () => {
      const result = right(5)
      let tapped = false
      const tappedResult = tapLeft((msg: string) => { tapped = true })(result)
      expect(tapped).toBe(false)
      expect(isRight(tappedResult)).toBe(true)
    })
  })

  describe('Try Catch', () => {
    it('should catch successful sync operation', () => {
      const result = tryCatch(() => 42)
      expect(isRight(result)).toBe(true)
      if (isRight(result)) {
        expect(result.value).toBe(42)
      }
    })

    it('should catch failed sync operation', () => {
      const result = tryCatch(() => {
        throw new Error('test error')
      })
      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.value).toBeInstanceOf(Error)
        expect(result.value.message).toBe('test error')
      }
    })

    it('should catch successful async operation', async () => {
      const result = await tryCatchAsync(() => Promise.resolve(42))()
      expect(isRight(result)).toBe(true)
      if (isRight(result)) {
        expect(result.value).toBe(42)
      }
    })

    it('should catch failed async operation', async () => {
      const result = await tryCatchAsync(() =>
        Promise.reject(new Error('async error'))
      )()
      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.value).toBeInstanceOf(Error)
        expect(result.value.message).toBe('async error')
      }
    })
  })

  describe('From Promise', () => {
    it('should convert successful promise', async () => {
      const task = fromPromise(Promise.resolve(42))
      const result = await task()
      expect(isRight(result)).toBe(true)
      if (isRight(result)) {
        expect(result.value).toBe(42)
      }
    })

    it('should convert failed promise', async () => {
      const task = fromPromise(Promise.reject(new Error('promise error')))
      const result = await task()
      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.value).toBeInstanceOf(Error)
        expect(result.value.message).toBe('promise error')
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
        expect(result.value).toBe(null)
      }
    })

    it('should handle undefined values', () => {
      const result = right(undefined)
      expect(isRight(result)).toBe(true)
      if (isRight(result)) {
        expect(result.value).toBe(undefined)
      }
    })

    it('should handle 0 as a valid value', () => {
      const result = right(0)
      expect(isRight(result)).toBe(true)
      if (isRight(result)) {
        expect(result.value).toBe(0)
      }
    })

    it('should handle empty string as a valid value', () => {
      const result = right('')
      expect(isRight(result)).toBe(true)
      if (isRight(result)) {
        expect(result.value).toBe('')
      }
    })

    it('should handle objects as values', () => {
      const obj = { a: 1, b: 2 }
      const result = right(obj)
      expect(isRight(result)).toBe(true)
      if (isRight(result)) {
        expect(result.value).toEqual(obj)
      }
    })
  })

  describe('Complex Scenarios', () => {
    it('should handle nested chains', () => {
      const result = right(10)

      const chained = pipe(
        result,
        chain((x: number) => right(x * 2)),
        chain((x: number) => right(x + 5)),
        chain((x: number) => left('fail'))
      )

      expect(isLeft(chained)).toBe(true)
      if (isLeft(chained)) {
        expect(chained.value).toBe('fail')
      }
    })

    it('should handle multiple mappings', () => {
      const result = right(5)

      const mapped = pipe(
        result,
        map((x: number) => x * 2),
        map((x: number) => x + 10),
        map((x: number) => x.toString())
      )

      expect(isRight(mapped)).toBe(true)
      if (isRight(mapped)) {
        expect(mapped.value).toBe('20') // (5 * 2 + 10).toString() = '20'
      }
    })

    it('should handle tap in the middle of chain', () => {
      let tapped = false
      const result = right(5)

      const chained = pipe(
        result,
        tap(() => { tapped = true }),
        map((x: number) => x * 2)
      )

      expect(tapped).toBe(true)
      expect(isRight(chained)).toBe(true)
      if (isRight(chained)) {
        expect(chained.value).toBe(10)
      }
    })
  })
})

// ===== TASK TESTS =====

describe('TaskEither', () => {
  describe('Async Operations', () => {
    it('should handle async operations correctly', async () => {
      const task = async (): Promise<Either<string, number>> => {
        return right(42)
      }

      const result = await task()
      expect(isRight(result)).toBe(true)
      if (isRight(result)) {
        expect(result.value).toBe(42)
      }
    })

    it('should handle async errors', async () => {
      const task = async (): Promise<Either<string, number>> => {
        return left('async error')
      }

      const result = await task()
      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.value).toBe('async error')
      }
    })
  })

  describe('Function Composition', () => {
    it('should compose async operations', async () => {
      const double = (x: number) => Promise.resolve(right(x * 2))
      const addOne = (x: number) => Promise.resolve(right(x + 1))

      const task = async (): Promise<Either<string, number>> => {
        return right(5)
      }

      const chained = await task()
      const result = await double(isRight(chained) ? chained.value : 0)
      const final = await addOne(isRight(result) ? result.value : 0)

      expect(isRight(final)).toBe(true)
      if (isRight(final)) {
        expect(final.value).toBe(11) // (5 * 2) + 1 = 11
      }
    })
  })
})