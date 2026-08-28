import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { setupGlobalErrorHandlers } from '@/helpers/error/errorHandler'

/**
 * The process must have an unhandledRejection handler, and index.ts must arm it
 * once at startup — not inside the per-bot loop.
 *
 * WHY. bot.catch only covers the Telegraf update loop. A promise that rejects
 * outside it — a monitor, an interval callback, a fire-and-forget call — has no
 * handler, and on Node the default is to terminate the process. This process
 * serves every bot, so one stray rejection would drop them all. The handlers
 * were written in Foundation.ts but Foundation is never initialised in
 * production, so the net was never armed; this pins the wiring that arms it.
 *
 * The test never emits 'uncaughtException' — the handler calls process.exit(1),
 * which would kill the runner. It checks registration and idempotency instead.
 */

describe('global error handlers are armed', () => {
  it('registers an unhandledRejection listener and an uncaughtException one', () => {
    setupGlobalErrorHandlers()
    expect(process.listenerCount('unhandledRejection')).toBeGreaterThanOrEqual(
      1
    )
    expect(process.listenerCount('uncaughtException')).toBeGreaterThanOrEqual(1)
  })

  it('is idempotent — a second call does not stack listeners', () => {
    setupGlobalErrorHandlers()
    const before = {
      r: process.listenerCount('unhandledRejection'),
      e: process.listenerCount('uncaughtException'),
    }
    setupGlobalErrorHandlers()
    expect(process.listenerCount('unhandledRejection')).toBe(before.r)
    expect(process.listenerCount('uncaughtException')).toBe(before.e)
  })
})

describe('index.ts arms the handlers once, before the bot loop', () => {
  const src = fs.readFileSync(path.join('src', 'index.ts'), 'utf8')

  it('calls setupGlobalErrorHandlers()', () => {
    expect(src).toMatch(/setupGlobalErrorHandlers\(\)/)
  })

  it('arms them before the per-bot loop, so it runs once', () => {
    const call = src.indexOf('setupGlobalErrorHandlers()')
    const loop = src.search(/for\s*\(\s*let\s+i\s*=\s*0;\s*i\s*<\s*botTokens/)
    expect(call, 'setupGlobalErrorHandlers() not called').toBeGreaterThan(-1)
    expect(loop, 'per-bot loop not found').toBeGreaterThan(-1)
    expect(
      call,
      'handlers armed inside the per-bot loop would register once per bot'
    ).toBeLessThan(loop)
  })
})
