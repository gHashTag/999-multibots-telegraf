/**
 * A BOT ON OUR OWN BOT API SERVER IS NEVER ASKED ON THE CLOUD.
 *
 * On 2026-09-22 a stale copy of the bridge, which asked api.telegram.org for
 * every token, logged a freshly moved bot back into the cloud three minutes
 * after its logOut -- two servers holding one bot, updates split. The host is
 * now chosen per token, and from a laptop the private server is out of reach;
 * that must read as "on our server, not reachable from here", never as a red
 * failure and never as a retry on the cloud.
 *
 * Ids and tokens are invented (9000000xx).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { checkBot } = require('./bridge.cjs')

const MOVED = '900000011:ZZmovedmovedmovedmovedmovedmovedmoved'
const CLOUD = '900000012:ZZcloudcloudcloudcloudcloudcloudcloud'

const saved = { ...process.env }
afterEach(() => {
  process.env = { ...saved }
  vi.unstubAllGlobals()
})

function env() {
  process.env.BOT_API_LOCAL_BOTS = 'Moved_test_bot=900000011'
  process.env.TELEGRAM_API_ROOT =
    'http://telegram-bot-api.railway.internal:8081'
  process.env.TELEGRAM_API_FILES_ROOT =
    'http://telegram-bot-api.railway.internal:8082'
}

describe('checkBot', () => {
  it('a moved bot out of reach: reported by id, alive unknown, and the cloud never asked', async () => {
    env()
    const hosts: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      hosts.push(new URL(url).host)
      throw Object.assign(new TypeError('fetch failed'), {
        cause: { code: 'ENOTFOUND' },
      })
    })
    const b = await checkBot(MOVED)
    expect(b).toMatchObject({ name: 'id 900000011', alive: null, local: true })
    expect(b.why).toBe('ENOTFOUND')
    expect(hosts.length).toBeGreaterThan(0)
    expect(
      hosts.every(h => h === 'telegram-bot-api.railway.internal:8081')
    ).toBe(true)
    expect(JSON.stringify(b)).not.toContain('ZZmoved')
  })

  it('a bot still on the cloud is asked on the cloud, as before', async () => {
    env()
    const hosts: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      hosts.push(new URL(url).host)
      const method = new URL(url).pathname.split('/').pop()
      const result =
        method === 'getMe'
          ? { username: 'Cloud_test_bot' }
          : method === 'getMyCommands'
            ? [{ command: 'start' }]
            : { type: 'commands' }
      return { json: async () => ({ ok: true, result }) }
    })
    const b = await checkBot(CLOUD)
    expect(b.name).toBe('Cloud_test_bot')
    expect(b.local).toBeUndefined()
    expect(new Set(hosts)).toEqual(new Set(['api.telegram.org']))
  })
})
