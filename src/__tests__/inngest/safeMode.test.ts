import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  isSafeMode,
  safeRecipient,
  safeModeAdminChatId,
  skippedInSafeMode,
  isSafeModeSkip,
} from '@/inngest_app/safeMode'

const ENV_KEYS = ['INNGEST_SAFE_MODE', 'ADMIN_CHAT_ID'] as const
const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> =
  {}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('isSafeMode', () => {
  it('is off by default', () => {
    expect(isSafeMode({ data: { telegram_id: '1' } })).toBe(false)
    expect(isSafeMode(undefined)).toBe(false)
    expect(isSafeMode(null)).toBe(false)
  })

  it('is on when the event carries e2e_test === true', () => {
    expect(isSafeMode({ data: { e2e_test: true } })).toBe(true)
  })

  it('ignores truthy-but-not-true e2e_test values', () => {
    expect(isSafeMode({ data: { e2e_test: 'true' } })).toBe(false)
    expect(isSafeMode({ data: { e2e_test: 1 } })).toBe(false)
  })

  it('is on when INNGEST_SAFE_MODE=1 regardless of the event', () => {
    process.env.INNGEST_SAFE_MODE = '1'
    expect(isSafeMode({ data: {} })).toBe(true)
    expect(isSafeMode(undefined)).toBe(true)
  })

  it('accepts true/yes/on and rejects 0/false/empty', () => {
    for (const v of ['true', 'yes', 'on', ' TRUE ']) {
      process.env.INNGEST_SAFE_MODE = v
      expect(isSafeMode()).toBe(true)
    }
    for (const v of ['0', 'false', '', 'no']) {
      process.env.INNGEST_SAFE_MODE = v
      expect(isSafeMode()).toBe(false)
    }
  })
})

describe('safeRecipient', () => {
  it('returns the intended chat when not in safe mode', () => {
    expect(safeRecipient({ data: {} }, 123)).toBe('123')
    expect(safeRecipient({ data: {} }, '456')).toBe('456')
  })

  it('redirects to ADMIN_CHAT_ID in safe mode', () => {
    process.env.ADMIN_CHAT_ID = '144022504'
    expect(safeRecipient({ data: { e2e_test: true } }, 999)).toBe('144022504')
  })

  it('returns null in safe mode when ADMIN_CHAT_ID is missing (never the user)', () => {
    process.env.INNGEST_SAFE_MODE = '1'
    expect(safeModeAdminChatId()).toBeNull()
    expect(safeRecipient({ data: {} }, 999)).toBeNull()
  })
})

describe('skippedInSafeMode', () => {
  it('produces the canonical marker and the guard recognises it', () => {
    const m = skippedInSafeMode('processBalanceOperation')
    expect(m).toEqual({
      skipped: true,
      reason: 'safe-mode',
      what: 'processBalanceOperation',
    })
    expect(isSafeModeSkip(m)).toBe(true)
    expect(isSafeModeSkip({ skipped: true })).toBe(false)
    expect(isSafeModeSkip(null)).toBe(false)
  })
})
