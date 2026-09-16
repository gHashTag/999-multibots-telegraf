/**
 * Shutdown neither pages the owner nor leaves bots half-stopped.
 *
 * From production 2026-09-16: "Unhandled promise rejection: Bot is not
 * running!" out of gracefulShutdown. telegraf.stop() throws synchronously when
 * a bot never came up, and `for (...) await bot.stop()` turned that into the
 * end of the whole shutdown.
 *
 * The fixture is exactly the mix that was in the container: one live bot, one
 * that never launched, and one more live bot AFTER it.
 */
import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { stopBotsQuietly, StoppableBot } from '@/utils/stopBotsQuietly'

const alive = (username: string): StoppableBot => ({
  botInfo: { username },
  stop: vi.fn(),
})

const neverLaunched = (): StoppableBot => ({
  stop: vi.fn(() => {
    // Verbatim from telegraf/lib/telegraf.js:218.
    throw new Error('Bot is not running!')
  }),
})

describe('stopping the bots on a signal', () => {
  it('a bot that never came up does not block the ones after it', async () => {
    const first = alive('neuro_blogger_bot')
    const broken = neverLaunched()
    const last = alive('t27ai_bot')

    const outcomes = await stopBotsQuietly([first, broken, last])

    // The point of the fix: the third bot MUST be stopped. It never was.
    expect(last.stop).toHaveBeenCalledTimes(1)
    expect(first.stop).toHaveBeenCalledTimes(1)
    expect(outcomes.map(o => o.result)).toEqual([
      'stopped',
      'not-running',
      'stopped',
    ])
  })

  it('"Bot is not running" is a state at shutdown, not a fault', async () => {
    const [only] = await stopBotsQuietly([neverLaunched()])
    // The distinction decides the route: `failed` goes to logger.error, which
    // is a push to the owner's phone on every routine restart.
    expect(only.result).toBe('not-running')
  })

  it('any other error stays a fault and is not swallowed', async () => {
    const angry: StoppableBot = {
      botInfo: { username: 'x_bot' },
      stop: vi.fn(() => {
        throw new Error('ECONNRESET')
      }),
    }
    const [only] = await stopBotsQuietly([angry])
    expect(only.result).toBe('failed')
    expect((only.error as Error).message).toBe('ECONNRESET')
  })

  it('throws nothing outward: shutdown is the last thing the process does', async () => {
    await expect(
      stopBotsQuietly([neverLaunched(), neverLaunched()])
    ).resolves.toHaveLength(2)
  })

  it("an unknown bot is not given another bot's name", async () => {
    const [only] = await stopBotsQuietly([neverLaunched()])
    // This used to read `|| 'neuro_blogger_bot'`: the diagnostic named a real,
    // specific bot in place of the one that has no botInfo.
    expect(only.name).not.toContain('neuro_blogger_bot')
    expect(only.name).toMatch(/unknown/)
  })
})

const REPO = path.join(__dirname, '..', '..', '..')
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('ratchet: shutdown lives in one place', () => {
  it('neither entrypoint calls bot.stop() in a bare loop', () => {
    for (const f of ['src/index.ts', 'src/bot.ts']) {
      const src = strip(fs.readFileSync(path.join(REPO, f), 'utf8'))
      expect(src, `${f} must use stopBotsQuietly`).toMatch(/stopBotsQuietly/)
      // The mutation this catches: putting `await bot.stop()` back in a loop.
      expect(src.match(/await\s+bot\.stop\s*\(/g) || []).toEqual([])
    }
  })
})
