import { describe, expect, it } from 'vitest'
import {
  ATTEMPT_TTL_MS,
  clearAttempt,
  loadAttempt,
  remainingWait,
  saveAttempt,
} from './connectAttemptStore'
import type { SentCode } from './connectDelivery'

/**
 * GOING TO READ THE CODE MUST NOT KILL THE LOGIN.
 *
 * The code arrives in the chat named "Telegram", so the person has to leave
 * the code screen to read it. On a client that closes the Mini App when they
 * do, they used to come back to an empty phone form, ask again, and invalidate
 * the code they had just read. What is pinned here: a live attempt is resumed,
 * and nothing that is NOT plainly a live attempt ever is.
 */

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

const sent: SentCode = {
  delivery: 'app',
  canResend: true,
  resendAfter: 120,
  round: 1,
}
const attempt = { handle: 'HANDLE', phone: '+79991234567', sent }
const T0 = 1_800_000_000_000

describe('a live attempt is resumed', () => {
  it('comes back exactly as it was saved, with the time it was saved at', () => {
    const store = fakeStorage()
    saveAttempt(store, attempt, T0)
    expect(loadAttempt(store, T0 + 60_000)).toEqual({ ...attempt, savedAt: T0 })
  })

  it('lives as long as the server keeps its half, and not a millisecond more', () => {
    const store = fakeStorage()
    saveAttempt(store, attempt, T0)
    expect(loadAttempt(store, T0 + ATTEMPT_TTL_MS - 1)).not.toBeNull()
    // Exactly at the limit the server has already swept it.
    saveAttempt(store, attempt, T0)
    expect(loadAttempt(store, T0 + ATTEMPT_TTL_MS)).toBeNull()
  })

  it('a later code replaces the earlier one: one attempt, the newest', () => {
    const store = fakeStorage()
    saveAttempt(store, attempt, T0)
    saveAttempt(store, { ...attempt, handle: 'SECOND' }, T0 + 5_000)
    expect(store.map.size).toBe(1)
    expect(loadAttempt(store, T0 + 6_000)?.handle).toBe('SECOND')
  })
})

describe('anything else is dropped, and removed so it is not re-read', () => {
  it('an expired attempt', () => {
    const store = fakeStorage()
    saveAttempt(store, attempt, T0)
    expect(loadAttempt(store, T0 + ATTEMPT_TTL_MS + 1)).toBeNull()
    expect(store.map.size).toBe(0)
  })

  it('a time in the future: a jumped clock must not keep it alive for hours', () => {
    const store = fakeStorage()
    saveAttempt(store, attempt, T0 + 3_600_000)
    expect(loadAttempt(store, T0)).toBeNull()
    expect(store.map.size).toBe(0)
  })

  it('an entry that is not an attempt, in every way it can fail to be one', () => {
    const broken = [
      'not json at all',
      'null',
      '[]',
      JSON.stringify({ ...attempt, savedAt: T0, handle: '' }),
      JSON.stringify({ ...attempt, savedAt: T0, phone: undefined }),
      JSON.stringify({ ...attempt, savedAt: T0, sent: null }),
      JSON.stringify({ ...attempt, savedAt: T0, sent: { delivery: 7 } }),
      JSON.stringify({ ...attempt, savedAt: 'yesterday' }),
      JSON.stringify({ ...attempt }),
    ]
    for (const raw of broken) {
      const store = fakeStorage({ 'vibee:tg-connect-attempt': raw })
      expect(loadAttempt(store, T0 + 1_000), raw).toBeNull()
      expect(store.map.size, raw).toBe(0)
    }
  })

  it('an attempt without a handle is not saved in the first place', () => {
    const store = fakeStorage()
    saveAttempt(store, { ...attempt, handle: '' }, T0)
    expect(store.map.size).toBe(0)
  })

  it('clearing forgets it', () => {
    const store = fakeStorage()
    saveAttempt(store, attempt, T0)
    clearAttempt(store)
    expect(loadAttempt(store, T0 + 1)).toBeNull()
  })
})

describe('a storage that refuses costs the convenience, never the login', () => {
  const refusing = {
    getItem: () => {
      throw new Error('SecurityError')
    },
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
    removeItem: () => {
      throw new Error('SecurityError')
    },
  }

  it('saving, loading and clearing all stay silent', () => {
    expect(() => saveAttempt(refusing, attempt, T0)).not.toThrow()
    expect(loadAttempt(refusing, T0)).toBeNull()
    expect(() => clearAttempt(refusing)).not.toThrow()
  })

  it('no storage at all is the same as an empty one', () => {
    expect(() => saveAttempt(null, attempt, T0)).not.toThrow()
    expect(loadAttempt(null, T0)).toBeNull()
  })
})

describe('the wait still owed after time spent away', () => {
  const saved = { ...attempt, savedAt: T0 }

  it("is what is left of Telegram's wait, not the whole of it again", () => {
    expect(remainingWait(saved, T0 + 45_000)).toBe(75)
  })

  it('is zero once the wait is over, never negative', () => {
    expect(remainingWait(saved, T0 + 120_000)).toBe(0)
    expect(remainingWait(saved, T0 + 500_000)).toBe(0)
  })

  it('a clock that went backwards does not ADD to the wait', () => {
    expect(remainingWait(saved, T0 - 60_000)).toBe(120)
  })
})
