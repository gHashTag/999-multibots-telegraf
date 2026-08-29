/**
 * getUserLanguageFromDB throttles repeated error/not-found logs via a
 * module-scope Map keyed by telegram_id. That map is a PROCESS-WIDE singleton
 * shared by the language middleware across every bot; it used to only .get/.set
 * with no eviction, so every distinct id hitting an error/not-found branch (the
 * not-found branch fires for any drive-by user) left a permanent entry — a slow
 * unbounded memory leak over the process lifetime.
 *
 * The fix prunes entries older than the throttle window when a log fires, so the
 * live set is bounded by errors within one window. Behavioral test: the map
 * shrinks after a later fire, and the throttle behavior itself is preserved.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  shouldLogThrottled,
  errorThrottle,
} from '@/core/supabase/getUserLanguage'

const WINDOW = 60000

describe('getUserLanguage errorThrottle is bounded (no unbounded leak)', () => {
  beforeEach(() => errorThrottle.clear())

  it('prunes expired entries when a later log fires', () => {
    const t0 = 1_000_000
    for (let i = 0; i < 500; i++) shouldLogThrottled(`notfound:${i}`, t0)
    expect(errorThrottle.size).toBe(500)

    // a single fire two windows later must sweep every expired entry
    const later = t0 + WINDOW * 2
    expect(shouldLogThrottled('notfound:new', later)).toBe(true)
    expect(errorThrottle.size).toBe(1) // only the fresh key survives
  })

  it('still throttles within the window (behavior preserved)', () => {
    const t0 = 2_000_000
    expect(shouldLogThrottled('k', t0)).toBe(true) // first fire logs
    expect(shouldLogThrottled('k', t0 + 100)).toBe(false) // within window: throttled
    expect(shouldLogThrottled('k', t0 + WINDOW + 1)).toBe(true) // window passed: logs
  })
})
