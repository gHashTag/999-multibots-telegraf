/**
 * LOG_LEVEL=INFO must not silence the logger.
 *
 * 2026-10-06: a shell exporting LOG_LEVEL=INFO (upper case) handed winston a
 * level it does not know, and the logger wrote nothing. Every test that
 * captures the logger went red locally and the pre-push gate blamed main.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
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

  it('no live logger hands winston the raw LOG_LEVEL', () => {
    // enhancedLogger (imported by src/bot.ts) still did after #3669. Read by
    // fs, not git grep: the cloud gate runs on a tree with no .git.
    const src = join(__dirname, '..', '..')
    const raw = (readdirSync(src, { recursive: true }) as string[])
      .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .filter(f => !f.endsWith('logger-BROKEN.ts'))
      .filter(f =>
        /level:\s*process\.env\.LOG_LEVEL/.test(
          readFileSync(join(src, f), 'utf8')
        )
      )
    expect(raw).toEqual([])
  })
})
