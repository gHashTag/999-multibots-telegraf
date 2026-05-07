/**
 * Tests for delay.ts
 *
 * Async delay utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { delay } from '@/helpers/delay'

describe('delay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('basic functionality', () => {
    it('should return a promise', () => {
      const result = delay(1000)
      expect(result).toBeInstanceOf(Promise)
    })

    it('should resolve after specified time', async () => {
      const promise = delay(1000)
      vi.advanceTimersByTime(1000)
      await expect(promise).resolves.toBeUndefined()
    })

    it('should not resolve before specified time', async () => {
      let resolved = false
      delay(1000).then(() => {
        resolved = true
      })

      vi.advanceTimersByTime(500)
      expect(resolved).toBe(false)

      vi.advanceTimersByTime(500)
      await Promise.resolve() // flush microtasks
      expect(resolved).toBe(true)
    })
  })

  describe('different durations', () => {
    it('should handle 0ms delay', async () => {
      const promise = delay(0)
      vi.advanceTimersByTime(0)
      await expect(promise).resolves.toBeUndefined()
    })

    it('should handle 1ms delay', async () => {
      const promise = delay(1)
      vi.advanceTimersByTime(1)
      await expect(promise).resolves.toBeUndefined()
    })

    it('should handle 5000ms delay', async () => {
      const promise = delay(5000)
      vi.advanceTimersByTime(5000)
      await expect(promise).resolves.toBeUndefined()
    })

    it('should handle large delay', async () => {
      const promise = delay(60000)
      vi.advanceTimersByTime(60000)
      await expect(promise).resolves.toBeUndefined()
    })
  })

  describe('chaining', () => {
    it('should support chaining with then', async () => {
      let value = 0
      const promise = delay(100).then(() => {
        value = 1
        return value
      })

      vi.advanceTimersByTime(100)
      const result = await promise
      expect(result).toBe(1)
      expect(value).toBe(1)
    })

    it('should support async/await pattern', async () => {
      const start = Date.now()
      const promise = (async () => {
        await delay(100)
        return Date.now()
      })()

      vi.advanceTimersByTime(100)
      await promise
      // With fake timers, we just check it resolves
    })
  })

  describe('multiple delays', () => {
    it('should handle multiple sequential delays', async () => {
      let step = 0

      const run = async () => {
        step = 1
        await delay(100)
        step = 2
        await delay(100)
        step = 3
      }

      const promise = run()

      expect(step).toBe(1)
      vi.advanceTimersByTime(100)
      await Promise.resolve()
      expect(step).toBe(2)
      vi.advanceTimersByTime(100)
      await Promise.resolve()
      await promise
      expect(step).toBe(3)
    })

    it('should handle parallel delays', async () => {
      const p1 = delay(100)
      const p2 = delay(200)
      const p3 = delay(300)

      vi.advanceTimersByTime(300)

      await expect(Promise.all([p1, p2, p3])).resolves.toEqual([
        undefined,
        undefined,
        undefined,
      ])
    })
  })
})
