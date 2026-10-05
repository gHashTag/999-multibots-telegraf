/**
 * LOG_LEVEL=INFO must not silence the logger.
 *
 * 2026-10-06: a shell exporting LOG_LEVEL=INFO (upper case) handed winston a
 * level it does not know, and the logger wrote nothing. Every test that
 * captures the logger went red locally and the pre-push gate blamed main.
 */
import { describe, expect, it } from 'vitest'
import { logLevelFrom } from '@/utils/logger'

describe('the logger level', () => {
  it('lower-cases a known level', () => {
    expect(logLevelFrom('INFO')).toBe('info')
    expect(logLevelFrom(' Debug ')).toBe('debug')
    expect(logLevelFrom('warn')).toBe('warn')
  })

  it('falls back to info when unset or unknown', () => {
    expect(logLevelFrom(undefined)).toBe('info')
    expect(logLevelFrom('')).toBe('info')
    expect(logLevelFrom('loud')).toBe('info')
  })
})
