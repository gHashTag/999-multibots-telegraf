/**
 * tabs_status / tabs_setup: who may ask, what a bot with topics off answers,
 * that setup is idempotent and repairs a deleted tab, and that no token
 * leaves through an error. Every Bot API call goes to an in-memory fake; no
 * Telegram request is made.
 */
import { describe, expect, it } from 'vitest'
import {
  botApiOver,
  makeTabsTools,
  type TabsToolDeps,
} from './topic-tabs-tools'
import { COMPACT_TOOLS_EXCLUDED, DIRECT_CALL_ONLY, TOOLS } from './tools'

const OWNER = '900000001'
const PERSON = '900000002'
const OTHER = '900000003'

/** bot_topic_tabs in memory, enough for the engine's statements. */
function memoryPool() {
  const rows: any[] = []
  const mine = (r: any, p: any[]) => r.bot === p[0] && r.tid === p[1]
  return {
    rows,
    async query(sql: string, p: any[] = []) {
      const q = sql.trim()
      if (q.startsWith('CREATE')) return { rows: [] }
      if (q.startsWith('SELECT bot_username'))
        return {
          rows: rows
            .filter(r => r.tid === p[0])
            .map(r => ({ ...r, bot_username: r.bot })),
        }
      if (q.startsWith('SELECT')) return { rows: rows.filter(r => mine(r, p)) }
      if (q.startsWith('INSERT')) {
        const [bot, tid, thread_id, kind, title] = p
        if (
          rows.some(
            r =>
              r.bot === bot &&
              r.tid === tid &&
              (r.thread_id === thread_id ||
                (kind !== 'chat' && r.kind === kind))
          )
        )
          return { rows: [] }
        rows.push({ bot, tid, thread_id, kind, title, created_at: new Date() })
        return { rows: [{ thread_id }] }
      }
      if (q.startsWith('UPDATE')) {
        const r = rows.find(x => mine(x, p) && x.thread_id === p[2])
        if (r) {
          r.thread_id = p[3]
          r.title = p[4]
        }
        return { rows: r ? [{ thread_id: p[3] }] : [] }
      }
      if (q.startsWith('DELETE')) {
        for (let i = rows.length - 1; i >= 0; i--)
          if (mine(rows[i], p) && rows[i].thread_id === p[2]) rows.splice(i, 1)
        return { rows: [] }
      }
      throw new Error('unexpected sql ' + q)
    },
  }
}

function fakeBot(opts: { topics?: boolean; deleted?: number[] } = {}) {
  let next = 100
  const calls: any[] = []
  return {
    calls,
    made: () => calls.filter(c => c[0] === 'createForumTopic').length,
    async callApi(method: string, payload: any) {
      calls.push([method, payload])
      if (method === 'getMe')
        return {
          username: 't27ai_bot',
          has_topics_enabled: opts.topics !== false,
        }
      if (method === 'createForumTopic') return { message_thread_id: next++ }
      if (method === 'editForumTopic' && !('name' in payload)) {
        const gone = opts.deleted?.includes(payload.message_thread_id)
        const description = gone
          ? 'Bad Request: message thread not found'
          : 'Bad Request: TOPIC_NOT_MODIFIED'
        const e: any = new Error(description)
        e.response = { description }
        throw e
      }
      return true
    },
  }
}

function setup(bot = fakeBot()) {
  const pool = memoryPool()
  const asked: string[] = []
  const deps: TabsToolDeps = {
    async botApi(name) {
      asked.push(name)
      return name === 'nobody_bot' ? null : bot
    },
    async homeBot() {
      return null
    },
    isKeeper: id => id === OWNER,
  }
  const [status, make] = makeTabsTools(deps)
  const ctx = (telegramId: string) => ({ telegramId, pool }) as any
  return { status, make, ctx, pool, bot, asked }
}

describe('tabs_status and tabs_setup', () => {
  it('are in the registry, out of the compact set, and setup is direct-call only', () => {
    const names = TOOLS.map(t => t.name)
    expect(names).toContain('tabs_status')
    expect(names).toContain('tabs_setup')
    expect(DIRECT_CALL_ONLY.has('tabs_setup')).toBe(true)
    expect(DIRECT_CALL_ONLY.has('tabs_status')).toBe(false)
    // tabs_ is outside COMPACT_TOOLS' prefixes, so a 16k model never sees them
    expect(/^(crm_|tg_|soul_|browser_)/.test('tabs_setup')).toBe(false)
    expect(COMPACT_TOOLS_EXCLUDED.test('tabs_setup')).toBe(false)
  })

  it("a person sets up their own tabs; another person's only a keeper", async () => {
    const t = setup()
    const denied = await t.make.handler({ telegram_id: OTHER }, t.ctx(PERSON))
    expect(denied).toMatchObject({ ok: false, state: 'forbidden' })
    expect(t.bot.calls).toHaveLength(0)
    const deniedRead = await t.status.handler(
      { telegram_id: OTHER },
      t.ctx(PERSON)
    )
    expect(deniedRead).toMatchObject({ ok: false, state: 'forbidden' })

    const own = await t.make.handler({}, t.ctx(PERSON))
    expect(own).toMatchObject({ ok: true, state: 'ready', telegram_id: PERSON })
    const byKeeper = await t.make.handler({ telegram_id: OTHER }, t.ctx(OWNER))
    expect(byKeeper).toMatchObject({ ok: true, telegram_id: OTHER })
  })

  it('a telegram_id that is not a user id is refused before any call', async () => {
    const t = setup()
    const r = await t.make.handler({ telegram_id: '@someone' }, t.ctx(OWNER))
    expect(r).toMatchObject({ ok: false, state: 'bad_person' })
    expect(t.bot.calls).toHaveLength(0)
  })

  it('makes the six tabs once; a second call makes nothing', async () => {
    const t = setup()
    const first: any = await t.make.handler({}, t.ctx(PERSON))
    expect(first.made).toHaveLength(6)
    expect(first.missing).toEqual([])
    expect(t.bot.made()).toBe(6)
    const second: any = await t.make.handler({}, t.ctx(PERSON))
    expect(second.made).toEqual([])
    expect(t.bot.made()).toBe(6)
    // every first message is sent into its own tab
    const sends = t.bot.calls.filter(c => c[0] === 'sendMessage')
    expect(sends.every(([, p]) => p.chat_id === Number(PERSON))).toBe(true)
    expect(sends.every(([, p]) => p.message_thread_id >= 100)).toBe(true)
  })

  it('repair remakes a tab the person deleted', async () => {
    const bot = fakeBot({ deleted: [101] })
    const t = setup(bot)
    await t.make.handler({}, t.ctx(PERSON))
    const r: any = await t.make.handler({}, t.ctx(PERSON))
    expect(r.made).toEqual(['reels'])
    const without: any = await t.make.handler({ repair: false }, t.ctx(PERSON))
    expect(without.made).toEqual([])
  })

  it('a bot with topics off is said, and nothing is made', async () => {
    const t = setup(fakeBot({ topics: false }))
    const r = await t.make.handler({}, t.ctx(PERSON))
    expect(r).toMatchObject({ ok: false, state: 'topics_off' })
    expect(t.bot.made()).toBe(0)
  })

  it('a bot the render holds no token for is said', async () => {
    const t = setup()
    const r = await t.make.handler({ bot: 'nobody_bot' }, t.ctx(PERSON))
    expect(r).toMatchObject({ ok: false, state: 'bot_unavailable' })
  })

  it('the default bot is the farm bot when the person has none', async () => {
    const t = setup()
    await t.make.handler({}, t.ctx(PERSON))
    expect(t.asked).toEqual(['t27ai_bot'])
  })

  it('status reads the rows: present, being made, missing', async () => {
    const t = setup()
    const empty: any = await t.status.handler({}, t.ctx(PERSON))
    expect(empty).toMatchObject({ ok: true, bots: [] })
    await t.make.handler({}, t.ctx(PERSON))
    // a claim in flight on another tab
    t.pool.rows.find(r => r.kind === 'hive').thread_id = -5
    const r: any = await t.status.handler({}, t.ctx(PERSON))
    expect(r.bots).toHaveLength(1)
    const view = r.bots[0]
    expect(view.bot).toBe('t27ai_bot')
    expect(view.tabs.find((x: any) => x.kind === 'agent').state).toBe('present')
    expect(view.tabs.find((x: any) => x.kind === 'hive').state).toBe(
      'being_made'
    )
    expect(view.missing).toEqual(['hive'])
    const other: any = await t.status.handler({ bot: 'x_bot' }, t.ctx(PERSON))
    expect(other.bots).toEqual([])
  })

  it('a Bot API error never carries the token-bearing URL', async () => {
    const base = 'https://api.telegram.org/botTOKEN:SECRETSECRET'
    const down = botApiOver(base, (async () => {
      throw new Error(`fetch failed ${base}/getMe`)
    }) as any)
    await expect(down.callApi('getMe', {})).rejects.toThrow(/^network error$/)
    const refused = botApiOver(base, (async () => ({
      status: 403,
      json: async () => ({
        ok: false,
        description: 'Forbidden: bot was blocked',
      }),
    })) as any)
    const e: any = await refused.callApi('getMe', {}).catch(x => x)
    expect(e.message).toBe('Forbidden: bot was blocked')
    expect(e.response.description).toBe('Forbidden: bot was blocked')
    expect(String(e.message)).not.toContain('SECRET')
  })
})
