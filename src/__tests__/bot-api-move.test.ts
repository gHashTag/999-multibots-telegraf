import { describe, it, expect, vi } from 'vitest'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

/**
 * MOVING ONE BOT, AND THE ORDER THAT KEEPS IT ALIVE.
 *
 * The script is driven with a fake fetch that plays both the cloud and our
 * server and records every call. What matters is not only that the calls
 * happen, but which ones do NOT: the dry run calls nothing, a wrong token
 * stops before logOut, an unreachable server stops before the cloud is
 * touched. And the token never appears in anything printed or thrown.
 */
const move = createRequire(__filename)('../../scripts/bot-api-move.cjs')

const MOVED = '900000011:ZZmovedmovedmovedmovedmovedmovedmoved'
const OURS = 'http://telegram-bot-api.railway.internal:8081'
const ME = { id: 900000011, username: 'Moved_test_bot', is_bot: true }

type Reply = {
  ok: boolean
  result?: unknown
  description?: string
  status?: number
}

function fakeFetch(replies: Record<string, Reply | 'down'>) {
  const calls: string[] = []
  const fn = vi.fn(async (url: string) => {
    const u = new URL(url)
    const where = u.origin === 'https://api.telegram.org' ? 'cloud' : 'ours'
    const method = u.pathname.split('/').pop() || '/'
    const key = `${where} ${method}`
    calls.push(key)
    const reply = replies[key]
    if (reply === 'down' || (where === 'ours' && replies['ours down'])) {
      throw new TypeError(`fetch failed ${url}`)
    }
    const r = reply ?? { ok: false, description: 'Not Found', status: 404 }
    return {
      status: r.status ?? (r.ok ? 200 : 400),
      json: async () => r,
    }
  })
  return { fn, calls }
}

function run(
  argv: string[],
  replies: Record<string, Reply | 'down'>,
  env: Record<string, string> = {}
) {
  const out: string[] = []
  const { fn, calls } = fakeFetch(replies)
  const p = move.main(argv, {
    env: { TELEGRAM_API_ROOT: OURS, BOT_API_MOVE_TOKEN: MOVED, ...env },
    fetchImpl: fn,
    print: (l: string) => out.push(l),
    ask: async () => MOVED,
  })
  return { p, out, calls }
}

const noSecret = (texts: string[]) => {
  for (const t of texts) expect(t).not.toContain('ZZmoved')
}

describe('dry run (the default)', () => {
  it('prints both plans and calls nothing', async () => {
    const { p, out, calls } = run(['Moved_test_bot'], {})
    expect(await p).toBe('plan')
    expect(calls).toEqual([])
    const text = out.join('\n')
    expect(text).toContain('PLAN (--apply) for @moved_test_bot')
    expect(text).toContain('logOut on the CLOUD')
    expect(text).toContain('PLAN (--back)')
    expect(text).toContain('nothing was called')
    expect(text).toContain('bot id 900000011')
    noSecret(out)
  })

  it('runs as a command without a token and without the network', () => {
    const script = resolve(__dirname, '..', '..', 'scripts', 'bot-api-move.cjs')
    const text = execFileSync(process.execPath, [script, '@Moved_test_bot'], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '' },
    })
    expect(text).toContain('dry run: nothing was called')
    expect(text).toContain('will be asked at a hidden prompt')
  })
})

describe('--apply', () => {
  const happy = {
    'cloud getMe': { ok: true, result: ME },
    'cloud logOut': { ok: true, result: true },
    'ours getMe': { ok: true, result: ME },
  }

  it('checks our server, checks the token, logs out of the cloud, logs in on ours -- in that order', async () => {
    const { p, out, calls } = run(['Moved_test_bot', '--apply'], happy)
    expect(await p).toBe('Moved_test_bot=900000011')
    expect(calls).toEqual([
      'ours /',
      'cloud getMe',
      'cloud logOut',
      'ours getMe',
    ])
    expect(out.join('\n')).toContain('Moved_test_bot=900000011')
    noSecret(out)
  })

  it('a token of ANOTHER bot: stops before logOut', async () => {
    const { p, calls } = run(['someone_else_bot', '--apply'], happy)
    const err = await p.catch((e: Error) => e)
    expect(String(err.message)).toContain('nothing was changed')
    expect(calls).not.toContain('cloud logOut')
    noSecret([String(err.message)])
  })

  it('our server down: stops before the cloud is touched', async () => {
    const { p, calls } = run(['Moved_test_bot', '--apply'], {
      ...happy,
      'ours down': 'down',
    })
    const err = await p.catch((e: Error) => e)
    expect(String(err.message)).toContain('does not answer')
    expect(calls.filter(c => c.startsWith('cloud'))).toEqual([])
    noSecret([String(err.message)])
  })

  it('our server fails after logOut: says so, gives the entry, forbids a second --apply', async () => {
    const { p } = run(['Moved_test_bot', '--apply'], {
      ...happy,
      'ours getMe': {
        ok: false,
        description: 'Internal Server Error',
        status: 500,
      },
    })
    const err = await p.catch((e: Error) => e)
    expect(String(err.message)).toContain('OFF the cloud')
    expect(String(err.message)).toContain('Do NOT run --apply again')
    expect(String(err.message)).toContain('Moved_test_bot=900000011')
    noSecret([String(err.message)])
  })

  it('the local root may not be the cloud', async () => {
    const { p } = run(['Moved_test_bot', '--apply'], happy, {
      TELEGRAM_API_ROOT: 'https://api.telegram.org',
    })
    await expect(p).rejects.toThrow('OUR server')
  })
})

describe('--back', () => {
  it('confirms the bot on our server, then closes it there; the cloud is never called', async () => {
    const { p, out, calls } = run(['900000011', '--back'], {
      'ours getMe': { ok: true, result: ME },
      'ours close': { ok: true, result: true },
    })
    expect(await p).toBe(true)
    expect(calls).toEqual(['ours getMe', 'ours close'])
    expect(out.join('\n')).toContain('10 minutes')
    noSecret(out)
  })

  it('too early after launch: says to wait, not "failed" alone', async () => {
    const { p } = run(['Moved_test_bot', '--back'], {
      'ours getMe': { ok: true, result: ME },
      'ours close': {
        ok: false,
        description: 'Too Many Requests: retry after 600',
        status: 429,
      },
    })
    await expect(p).rejects.toThrow('less than 10 minutes')
  })
})

describe('arguments', () => {
  it('one bot, known flags only, not both directions', () => {
    expect(() => move.parseArgs([])).toThrow('usage')
    expect(() => move.parseArgs(['a_bot', 'b_bot'])).toThrow(
      'one bot at a time'
    )
    expect(() => move.parseArgs(['a_bot', '--force'])).toThrow('unknown flag')
    expect(() => move.parseArgs(['a_bot', '--apply', '--back'])).toThrow(
      'no sense'
    )
  })
})
