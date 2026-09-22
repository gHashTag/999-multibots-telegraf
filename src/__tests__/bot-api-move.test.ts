import { describe, it, expect, vi, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

/**
 * MOVING ONE BOT, AND THE ORDER THAT KEEPS IT ALIVE.
 *
 * The script is driven with a fake fetch that plays both the cloud and our
 * server and records every call, against a real temporary working directory
 * standing in for the server's volume (the allow-list and the bot sessions
 * live there). What matters is not only that the calls happen, but which ones
 * do NOT: the dry run calls nothing, a wrong token stops before logOut, an
 * unreachable server stops before the cloud is touched, and --back with the
 * wrong token or for a bot this server does not hold calls NOTHING -- a getMe
 * here is exactly what would log that bot in here. And the token never
 * appears in anything printed or thrown.
 */
const require_ = createRequire(__filename)
const move = require_('../../scripts/bot-api-move.cjs')
const allowed = require_('../../deployment/telegram-bot-api/allowed-bots.cjs')

const MOVED = '900000011:ZZmovedmovedmovedmovedmovedmovedmoved'
const OTHER = '900000002:ZZotherotherotherotherotherotherother'
const ME = { id: 900000011, username: 'Moved_test_bot', is_bot: true }

type Reply = {
  ok: boolean
  result?: unknown
  description?: string
  status?: number
}

const dirs: string[] = []
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

/** A stand-in for the volume: optionally holding the bot, optionally listing it. */
function volume({ held = false, listed = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'bot-api-move-'))
  dirs.push(dir)
  if (held) mkdirSync(join(dir, MOVED))
  if (listed)
    allowed.writeAllowedBots(dir, new Map([['900000011', 'Moved_test_bot']]))
  return dir
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
    env: { BOT_API_MOVE_TOKEN: MOVED, ...env },
    fetchImpl: fn,
    print: (l: string) => out.push(l),
    ask: async () => MOVED,
  })
  return { p, out, calls }
}

const noSecret = (texts: string[]) => {
  for (const t of texts) expect(t).not.toContain('ZZmoved')
}

const listedIds = (dir: string) => [...allowed.readAllowedBots(dir).keys()]

describe('dry run (the default)', () => {
  it('prints both plans and calls nothing', async () => {
    const { p, out, calls } = run(['Moved_test_bot'], {})
    expect(await p).toBe('plan')
    expect(calls).toEqual([])
    const text = out.join('\n')
    expect(text).toContain('PLAN (--apply) for @moved_test_bot')
    expect(text).toContain('logOut on the CLOUD')
    expect(text).toContain('PLAN (--back)')
    expect(text).toContain('PLAN (--forget)')
    expect(text).toContain('BEFORE this: the entry is in BOT_API_LOCAL_BOTS')
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

  it('checks our server, checks the token, logs out of the cloud, lists the bot, logs in on ours -- in that order', async () => {
    const dir = volume()
    const { p, out, calls } = run(['Moved_test_bot', '--apply'], happy, {
      TELEGRAM_WORK_DIR: dir,
    })
    expect(await p).toBe('Moved_test_bot=900000011')
    expect(calls).toEqual([
      'ours /',
      'cloud getMe',
      'cloud logOut',
      'ours getMe',
    ])
    expect(listedIds(dir)).toEqual(['900000011'])
    expect(out.join('\n')).toContain('Moved_test_bot=900000011')
    noSecret(out)
  })

  it('talks to the server on loopback, behind the proxy that would refuse an unlisted bot', async () => {
    const dir = volume()
    const urls: string[] = []
    const out: string[] = []
    await move.main(['Moved_test_bot', '--apply'], {
      env: { BOT_API_MOVE_TOKEN: MOVED, TELEGRAM_WORK_DIR: dir },
      fetchImpl: async (url: string) => {
        urls.push(new URL(url).origin)
        return {
          status: 200,
          json: async () => ({ ok: true, result: ME }),
        }
      },
      print: (l: string) => out.push(l),
    })
    expect(urls[0]).toBe('http://127.0.0.1:8083')
  })

  it('a token of ANOTHER bot: stops before logOut, lists nothing', async () => {
    const dir = volume()
    const { p, calls } = run(['someone_else_bot', '--apply'], happy, {
      TELEGRAM_WORK_DIR: dir,
    })
    const err = await p.catch((e: Error) => e)
    expect(String(err.message)).toContain('nothing was changed')
    expect(calls).not.toContain('cloud logOut')
    expect(listedIds(dir)).toEqual([])
    noSecret([String(err.message)])
  })

  it("an id that is not the token's: stops before any call", async () => {
    const dir = volume()
    const { p, calls } = run(['Moved_test_bot=900000002', '--apply'], happy, {
      TELEGRAM_WORK_DIR: dir,
    })
    await expect(p).rejects.toThrow('nothing was called')
    expect(calls).toEqual([])
  })

  it('our server down: stops before the cloud is touched', async () => {
    const dir = volume()
    const { p, calls } = run(
      ['Moved_test_bot', '--apply'],
      { ...happy, 'ours down': 'down' },
      { TELEGRAM_WORK_DIR: dir }
    )
    const err = await p.catch((e: Error) => e)
    expect(String(err.message)).toContain('does not answer')
    expect(calls.filter(c => c.startsWith('cloud'))).toEqual([])
    expect(listedIds(dir)).toEqual([])
    noSecret([String(err.message)])
  })

  it('our server fails after logOut: listed anyway (the bot service retries through the proxy), says so, forbids a second --apply', async () => {
    const dir = volume()
    const { p } = run(
      ['Moved_test_bot', '--apply'],
      {
        ...happy,
        'ours getMe': {
          ok: false,
          description: 'Internal Server Error',
          status: 500,
        },
      },
      { TELEGRAM_WORK_DIR: dir }
    )
    const err = await p.catch((e: Error) => e)
    expect(String(err.message)).toContain('OFF the cloud')
    expect(String(err.message)).toContain('Do NOT run --apply again')
    expect(String(err.message)).toContain('Moved_test_bot=900000011')
    expect(listedIds(dir)).toEqual(['900000011'])
    noSecret([String(err.message)])
  })

  it('outside the container (no volume): refused before any call', async () => {
    const { p, calls } = run(['Moved_test_bot', '--apply'], happy, {
      TELEGRAM_WORK_DIR: '/nonexistent/telegram-bot-api',
    })
    await expect(p).rejects.toThrow('inside the Bot API container')
    expect(calls).toEqual([])
  })

  it('the local root may not be the cloud', async () => {
    const { p } = run(
      ['Moved_test_bot', '--apply', '--local-root', 'https://api.telegram.org'],
      happy
    )
    await expect(p).rejects.toThrow('OUR server')
  })
})

describe('--back', () => {
  const ours = {
    'ours getMe': { ok: true, result: ME },
    'ours close': { ok: true, result: true },
  }

  it('confirms the bot on our server, closes it there, takes it off the allow-list; the cloud is never called', async () => {
    const dir = volume({ held: true, listed: true })
    const { p, out, calls } = run(
      ['Moved_test_bot=900000011', '--back'],
      ours,
      {
        TELEGRAM_WORK_DIR: dir,
      }
    )
    expect(await p).toBe(true)
    expect(calls).toEqual(['ours getMe', 'ours close'])
    expect(listedIds(dir)).toEqual([])
    expect(out.join('\n')).toContain('10 minutes')
    noSecret(out)
  })

  it('the token of ANOTHER bot: not one call -- a getMe here would log that bot in here', async () => {
    const dir = volume({ held: true, listed: true })
    const { p, calls } = run(['Moved_test_bot=900000011', '--back'], ours, {
      TELEGRAM_WORK_DIR: dir,
      BOT_API_MOVE_TOKEN: OTHER,
    })
    const err = await p.catch((e: Error) => e)
    expect(String(err.message)).toContain('not 900000011')
    expect(String(err.message)).toContain('Nothing was called')
    expect(calls).toEqual([])
    expect(listedIds(dir)).toEqual(['900000011'])
    expect(String(err.message)).not.toContain('ZZother')
  })

  it('a username without the id: refused, not one call', async () => {
    const dir = volume({ held: true, listed: true })
    const { p, calls } = run(['Moved_test_bot', '--back'], ours, {
      TELEGRAM_WORK_DIR: dir,
    })
    await expect(p).rejects.toThrow("need the bot's id")
    expect(calls).toEqual([])
  })

  it('a bot never moved here, or --back run twice: not on the allow-list, not one call', async () => {
    const dir = volume({ held: true, listed: false })
    const { p, calls } = run(['Moved_test_bot=900000011', '--back'], ours, {
      TELEGRAM_WORK_DIR: dir,
    })
    await expect(p).rejects.toThrow("not on this server's allow-list")
    expect(calls).toEqual([])
  })

  it('refused before the token prompt, so a wrong target costs no typing', async () => {
    const dir = volume({ held: true, listed: false })
    const ask = vi.fn(async () => MOVED)
    const p = move.main(['Moved_test_bot=900000011', '--back'], {
      env: { TELEGRAM_WORK_DIR: dir },
      fetchImpl: vi.fn(),
      print: () => {},
      ask,
    })
    await expect(p).rejects.toThrow("not on this server's allow-list")
    expect(ask).not.toHaveBeenCalled()
  })

  it('listed but no session here: not one call', async () => {
    const dir = volume({ held: false, listed: true })
    const { p, calls } = run(['Moved_test_bot=900000011', '--back'], ours, {
      TELEGRAM_WORK_DIR: dir,
    })
    await expect(p).rejects.toThrow('holds no session')
    expect(calls).toEqual([])
  })

  it('too early after launch: says to wait, and the bot stays listed and working', async () => {
    const dir = volume({ held: true, listed: true })
    const { p } = run(
      ['Moved_test_bot=900000011', '--back'],
      {
        'ours getMe': { ok: true, result: ME },
        'ours close': {
          ok: false,
          description: 'Too Many Requests: retry after 600',
          status: 429,
        },
      },
      { TELEGRAM_WORK_DIR: dir }
    )
    await expect(p).rejects.toThrow('less than 10 minutes')
    expect(listedIds(dir)).toEqual(['900000011'])
  })
})

describe('--forget', () => {
  it('takes the bot off the allow-list and calls nothing, without a token', async () => {
    const dir = volume({ held: true, listed: true })
    const { p, calls } = run(
      ['Moved_test_bot=900000011', '--forget'],
      {},
      {
        TELEGRAM_WORK_DIR: dir,
        BOT_API_MOVE_TOKEN: '',
      }
    )
    expect(await p).toBe(true)
    expect(calls).toEqual([])
    expect(listedIds(dir)).toEqual([])
  })
})

describe('--cloud-logout (the move without a shell)', () => {
  const CASHIER = '900000003:ZZcashiercashiercashiercashiercashie'
  const happy = {
    'cloud getMe': { ok: true, result: ME },
    'cloud logOut': { ok: true, result: true },
  }
  // What `railway run --service vibee-render` puts in the env.
  const service: Record<string, string> = {
    BOT_API_MOVE_TOKEN: '',
    BOT_TOKEN_1: OTHER,
    BOT_TOKEN_7: MOVED,
    TOKENS_PAYMENT_BOT_TOKEN: CASHIER,
    BOT_API_LOCAL_BOTS: 'Moved_test_bot=900000011',
    TELEGRAM_WORK_DIR: '/nonexistent/volume',
  }
  const ARGV = ['Moved_test_bot=900000011', '--cloud-logout', '--pointed']

  /** Like run(), but a prompt is a failure: the token must come from the env. */
  function runCloud(
    argv: string[],
    replies: Record<string, Reply | 'down'>,
    env: Record<string, string>
  ) {
    const out: string[] = []
    const { fn, calls } = fakeFetch(replies)
    const p = move.main(argv, {
      env,
      fetchImpl: fn,
      print: (l: string) => out.push(l),
      ask: async () => {
        throw new Error('prompted for a token')
      },
    })
    return { p, out, calls }
  }

  it('finds the token by the bot id, checks it on the cloud, logs out -- and calls nothing else', async () => {
    const { p, out, calls } = runCloud(ARGV, happy, service)
    expect(await p).toBe('Moved_test_bot=900000011')
    expect(calls).toEqual(['cloud getMe', 'cloud logOut'])
    const said = out.join('\n')
    expect(said).toContain('BOT_API_ALLOWED_IDS=Moved_test_bot=900000011')
    expect(said).toContain('logged out of the cloud at')
    expect(said).toContain('Do NOT run --cloud-logout again')
    noSecret(out)
  })

  it('without --pointed: refused before any call, naming the boot lines to look for', async () => {
    const { p, calls } = runCloud(
      ['Moved_test_bot=900000011', '--cloud-logout'],
      happy,
      service
    )
    await expect(p).rejects.toThrow('--pointed')
    expect(calls).toEqual([])
  })

  it('refuses before any call unless BOT_API_LOCAL_BOTS already points the bot at our server', async () => {
    const { p, calls } = runCloud(ARGV, happy, {
      ...service,
      BOT_API_LOCAL_BOTS: 'Other_test_bot=900000002',
    })
    await expect(p).rejects.toThrow('Point first')
    expect(calls).toEqual([])
  })

  it('a BOT_API_LOCAL_BOTS the services would refuse at boot is a refusal here too', async () => {
    // The services refuse a bare username: the old processes keep polling the
    // cloud, and a logOut now would split the bot.
    for (const value of [
      'Some_bot,Moved_test_bot=900000011',
      `Moved_test_bot=900000011;${OTHER}`,
      'Moved_test_bot=900000011,Renamed_bot=900000011',
    ]) {
      const { p, calls } = runCloud(ARGV, happy, {
        ...service,
        BOT_API_LOCAL_BOTS: value,
      })
      const err = await p.catch((e: Error) => e)
      expect(String(err), value).toContain('Nothing was called')
      expect(String(err)).not.toContain('ZZother')
      expect(calls).toEqual([])
    }
  })

  it('never moves the admin bot or the default cashier', async () => {
    for (const name of ['BOT_TOKEN_1', 'TOKENS_PAYMENT_BOT_TOKEN']) {
      const { p, calls } = runCloud(ARGV, happy, { ...service, [name]: MOVED })
      await expect(p).rejects.toThrow('never moves')
      expect(calls).toEqual([])
    }
  })

  it('fails closed when either never-move token is absent -- the bot service has no cashier token', async () => {
    for (const name of ['BOT_TOKEN_1', 'TOKENS_PAYMENT_BOT_TOKEN']) {
      const env = { ...service }
      delete env[name]
      const { p, calls } = runCloud(ARGV, happy, env)
      await expect(p).rejects.toThrow('railway run --service vibee-render')
      expect(calls).toEqual([])
    }
  })

  it('needs username=id, like --back', async () => {
    const { p, calls } = runCloud(
      ['Moved_test_bot', '--cloud-logout', '--pointed'],
      happy,
      service
    )
    await expect(p).rejects.toThrow('username=id')
    expect(calls).toEqual([])
  })

  it('two different tokens for one id is a refusal, not a guess -- and neither is shown', async () => {
    const stale = '900000011:ZZmovedOLDmovedOLDmovedOLDmovedOLDmo'
    const { p, calls } = runCloud(ARGV, happy, {
      ...service,
      BOT_TOKEN_9: stale,
    })
    const err = await p.catch((e: Error) => e)
    expect(String(err)).toContain('2 different tokens')
    expect(String(err)).not.toContain('ZZmoved')
    expect(calls).toEqual([])
  })

  it('a token that is somebody else on the cloud stops before logOut', async () => {
    const { p, calls } = runCloud(
      ARGV,
      {
        'cloud getMe': {
          ok: true,
          result: { id: 900000011, username: 'Renamed_bot' },
        },
      },
      service
    )
    await expect(p).rejects.toThrow('not to Moved_test_bot')
    expect(calls).toEqual(['cloud getMe'])
  })

  it('a cloud it cannot reach, or a refused token, says STOP -- never "go on"', async () => {
    for (const reply of [
      'down' as const,
      { ok: false, description: 'Unauthorized', status: 401 },
      { ok: false, description: 'HTTP 403', status: 403 },
    ]) {
      const { p, calls } = runCloud(ARGV, { 'cloud getMe': reply }, service)
      const err = String(await p.catch((e: Error) => e))
      expect(err).toContain('STOP')
      expect(err).toContain('do NOT add it to BOT_API_ALLOWED_IDS')
      expect(err).not.toContain('Go on')
      expect(err).not.toContain('ZZmoved')
      expect(calls).toEqual(['cloud getMe'])
    }
  })

  it('a bot the cloud already logged out: go on with step 3, and do not run this again', async () => {
    const { p, calls } = runCloud(
      ARGV,
      {
        'cloud getMe': {
          ok: false,
          description: 'Bad Request: Logged out',
          status: 400,
        },
      },
      service
    )
    const err = String(await p.catch((e: Error) => e))
    expect(err).toContain('Go on with step 3')
    expect(err).toContain('Do NOT run --cloud-logout again')
    expect(calls).toEqual(['cloud getMe'])
  })

  it('a failed logOut says the bot is still on the cloud', async () => {
    const { p } = runCloud(
      ARGV,
      {
        'cloud getMe': { ok: true, result: ME },
        'cloud logOut': { ok: false, description: 'Too Many Requests' },
      },
      service
    )
    await expect(p).rejects.toThrow('still on the cloud')
  })

  it('the dry run finds the token and says whether the real run would be refused', async () => {
    const ok = runCloud(['Moved_test_bot=900000011'], {}, service)
    expect(await ok.p).toBe('plan')
    expect(ok.calls).toEqual([])
    expect(ok.out.join('\n')).toContain('token: found, for bot id 900000011')
    expect(ok.out.join('\n')).toContain('checks of step 0 pass')
    const refused = runCloud(
      ['Moved_test_bot=900000011'],
      {},
      {
        ...service,
        BOT_API_LOCAL_BOTS: '',
      }
    )
    await refused.p
    expect(refused.out.join('\n')).toContain('would be REFUSED')
    noSecret(ok.out)
  })

  it('a pasted token as the bot argument is never echoed', async () => {
    const { p, calls } = runCloud([MOVED, '--cloud-logout'], happy, service)
    const err = String(await p.catch((e: Error) => e))
    expect(err).toContain('not shown')
    expect(err).not.toContain('ZZmoved')
    expect(calls).toEqual([])
  })
})

describe('a bot let through by BOT_API_ALLOWED_IDS', () => {
  const both = {
    'ours getMe': { ok: true, result: ME },
    'ours close': { ok: true, result: true },
  }

  it('--back refuses and calls nothing, whether or not the file lists it too', async () => {
    for (const listed of [false, true]) {
      const dir = volume({ held: true, listed })
      const { p, calls } = run(['Moved_test_bot=900000011', '--back'], both, {
        TELEGRAM_WORK_DIR: dir,
        BOT_API_ALLOWED_IDS: 'Moved_test_bot=900000011',
      })
      await expect(p).rejects.toThrow('BOT_API_ALLOWED_IDS')
      expect(calls).toEqual([])
      expect(listedIds(dir)).toEqual(listed ? ['900000011'] : [])
    }
  })

  it('--forget clears the file and says the proxy still lets it through', async () => {
    const dir = volume({ held: true, listed: true })
    const { p, out, calls } = run(
      ['Moved_test_bot=900000011', '--forget'],
      {},
      {
        TELEGRAM_WORK_DIR: dir,
        BOT_API_MOVE_TOKEN: '',
        BOT_API_ALLOWED_IDS: 'Moved_test_bot=900000011',
      }
    )
    expect(await p).toBe(true)
    expect(calls).toEqual([])
    expect(listedIds(dir)).toEqual([])
    expect(out.join('\n')).toContain('STILL lets it through')
  })

  it('--forget on a bot only the variable names refuses and names the variable', async () => {
    const dir = volume({ held: true })
    const { p, calls } = run(
      ['Moved_test_bot=900000011', '--forget'],
      {},
      {
        TELEGRAM_WORK_DIR: dir,
        BOT_API_MOVE_TOKEN: '',
        BOT_API_ALLOWED_IDS: 'Moved_test_bot=900000011',
      }
    )
    await expect(p).rejects.toThrow('BOT_API_ALLOWED_IDS')
    expect(calls).toEqual([])
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
