import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/**
 * WHICH BOTS SIGN THE initData THAT EVERY REQUEST PRESENTS.
 *
 * The Mini App sends initData on every API call, and two places verify it per
 * request: the guard's initData branch (authenticate) and verifiedTelegramId,
 * behind chatIdentity and resolveIdentity. The sign-in journal only sees
 * /api/auth/telegram and pair/start, so a bot whose users never sign in through
 * those would be missing from any allowlist built from the journal alone.
 *
 * So both places count accepted verifications per numeric bot id, in memory,
 * and log ONE aggregate line at most every ten minutes. Digits only: for a
 * token stored without its colon the "id" is the whole secret, so anything
 * that is not a plain run of digits is counted as `unknown`. No route exposes
 * the counts.
 */

const BOT_A = '4440005'
const BOT_B = '4440006'
const PRIVATE_PART = 'PrivatePartNeverLoggedAnywhere42'
const TOKEN_A = `${BOT_A}:${PRIVATE_PART}`
const TOKEN_B = `${BOT_B}:${PRIVATE_PART}B`
const COLONLESS = `4440007${PRIVATE_PART}C`
const TEN_MINUTES = 10 * 60_000

function launch(id: number, token: string): string {
  const fields = {
    user: JSON.stringify({ id, first_name: 'Test' }),
    auth_date: String(Math.floor(Date.now() / 1000)),
  }
  const checkString = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const secret = crypto
    .createHmac('sha256', 'WebAppData')
    .update(token)
    .digest()
  const p = new URLSearchParams(fields)
  p.set(
    'hash',
    crypto.createHmac('sha256', secret).update(checkString).digest('hex')
  )
  return p.toString()
}

const ENV = ['TELEGRAM_BOT_TOKEN', 'BOT_TOKEN_1', 'BOT_TOKEN_2'] as const
const saved: Record<string, string | undefined> = {}

describe('per-request initData bot counters', () => {
  let clock: number
  let lines: string[]

  beforeEach(() => {
    for (const k of ENV) saved[k] = process.env[k]
    process.env.TELEGRAM_BOT_TOKEN = TOKEN_A
    process.env.BOT_TOKEN_1 = TOKEN_B
    process.env.BOT_TOKEN_2 = COLONLESS
    clock = Date.UTC(2026, 8, 15, 12, 0, 0)
    vi.spyOn(Date, 'now').mockImplementation(() => clock)
    lines = []
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      lines.push(a.map(String).join(' '))
    })
    vi.resetModules()
  })

  afterEach(() => {
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
    vi.restoreAllMocks()
  })

  const botLines = () => lines.filter(l => l.startsWith('[initdata-bots]'))

  it('logs one aggregate line per ten minutes, digits only, counts reset', async () => {
    const { countInitDataBot } = await import('./src/auth/initdata-bot-counts')
    countInitDataBot(BOT_A)
    countInitDataBot(BOT_A)
    countInitDataBot(BOT_B)
    countInitDataBot(`4440007${PRIVATE_PART}`)
    countInitDataBot(undefined)
    clock += TEN_MINUTES - 1
    countInitDataBot(BOT_A)
    expect(botLines(), 'logged before ten minutes').toEqual([])

    clock += 1
    countInitDataBot(BOT_B)
    expect(botLines()).toHaveLength(1)
    const [line] = botLines()
    expect(line).toContain(`bot=${BOT_A} n=3`)
    expect(line).toContain(`bot=${BOT_B} n=2`)
    expect(line).toContain('bot=unknown n=2')
    expect(line).not.toContain(PRIVATE_PART)
    expect(line).not.toContain(':')

    // At most one line per window, and the next window starts from zero.
    clock += TEN_MINUTES - 1
    countInitDataBot(BOT_A)
    expect(botLines()).toHaveLength(1)
    clock += 1
    countInitDataBot(BOT_A)
    expect(botLines()).toHaveLength(2)
    expect(botLines()[1]).toContain(`bot=${BOT_A} n=2`)
    expect(botLines()[1]).not.toContain(BOT_B)
  })

  it("the guard's initData branch counts the verifying bot", async () => {
    const { authenticate } = await import('./auth')
    const guarded = (token: string) =>
      authenticate({
        url: '/render',
        method: 'POST',
        headers: { 'x-telegram-init-data': launch(7001, token) },
      } as any)
    expect(guarded(TOKEN_A).via).toBe('telegram')
    expect(guarded(TOKEN_B).via).toBe('telegram')
    clock += TEN_MINUTES
    expect(guarded(COLONLESS).via).toBe('telegram')

    expect(botLines()).toHaveLength(1)
    expect(botLines()[0]).toContain(`bot=${BOT_A} n=1`)
    expect(botLines()[0]).toContain(`bot=${BOT_B} n=1`)
    expect(botLines()[0]).toContain('bot=unknown n=1')
    expect(lines.join('\n')).not.toContain(PRIVATE_PART)
  })

  it('verifiedTelegramId counts the verifying bot', async () => {
    const { verifiedTelegramId } = await import('./auth')
    const idOf = (token: string) =>
      verifiedTelegramId({
        headers: { 'x-telegram-init-data': launch(7002, token) },
      } as any)
    expect(idOf(TOKEN_A)).toBe('7002')
    clock += TEN_MINUTES
    expect(idOf(TOKEN_A)).toBe('7002')

    expect(botLines()).toHaveLength(1)
    expect(botLines()[0]).toContain(`bot=${BOT_A} n=2`)
    expect(lines.join('\n')).not.toContain(PRIVATE_PART)
  })

  it('a refused initData is not counted', async () => {
    const { verifiedTelegramId } = await import('./auth')
    const forged = launch(7003, `${BOT_A}:NotTheConfiguredToken`)
    expect(
      verifiedTelegramId({ headers: { 'x-telegram-init-data': forged } } as any)
    ).toBeNull()
    clock += TEN_MINUTES
    verifiedTelegramId({
      headers: { 'x-telegram-init-data': launch(7003, TOKEN_B) },
    } as any)
    expect(botLines()).toHaveLength(1)
    expect(botLines()[0]).not.toContain(`bot=${BOT_A}`)
  })

  it('no route reads the counters: only auth.ts imports the module', () => {
    const render = __dirname
    const importers: string[] = []
    const walk = (dir: string) => {
      for (const name of fs.readdirSync(dir)) {
        if (['node_modules', 'dist'].includes(name) || name.startsWith('.'))
          continue
        const full = path.join(dir, name)
        if (fs.statSync(full).isDirectory()) walk(full)
        else if (
          name.endsWith('.ts') &&
          !name.endsWith('.test.ts') &&
          fs.readFileSync(full, 'utf8').includes('initdata-bot-counts')
        )
          importers.push(path.relative(render, full))
      }
    }
    walk(render)
    expect(importers.sort()).toEqual(['auth.ts'])
  })
})
