import { beforeEach, describe, expect, it } from 'vitest'
import * as SPEC from './connect-card.gen'
import {
  connectState,
  connectStates,
  handleConnectLink,
  hasButton,
  linkOk,
  mayStart,
  resetConnectLinksForTests,
  runConnectCard,
  shouldCard,
  type LinkDeps,
} from '../agent/connect-card'
import {
  resetSocialTablesForTests,
  seal,
  THREADS_SCOPES,
} from '../agent/meta-connect'
import { LINKEDIN_SCOPES } from '../agent/social-api'
import { handleMeta } from '../agent/meta-routes'

/**
 * THE CONNECT CARD IS WRITTEN IN t27 FIRST (skill t27-spec-first).
 *
 * specs/automation/connect-card.t27 is the spec of record; that the vendored
 * copy, its generated module and the host agree is held by
 * scripts/check-t27-specs.mjs. Here each `test` of the spec runs against the
 * HOST: the pure rules of src/agent/connect-card.ts, the card against a
 * recorder standing in for the Bot API (no real card is ever sent), and the
 * door the card's button opens.
 */

const OWNER = '1'
const T0 = 1_800_000_000_000
const H = 3_600_000
const DAY = 24 * H

const fullEnv = {
  THREADS_APP_ID: 'threads-app-id-0001',
  THREADS_APP_SECRET: 'threads-app-secret-0001', // secret-guard-ok: a fake fixture value, no real app
  LINKEDIN_CLIENT_ID: 'linkedin-client-id-0001',
  LINKEDIN_CLIENT_SECRET: 'linkedin-client-secret-0001', // secret-guard-ok: a fake fixture value, no real app
  META_TOKEN_KEY: 'k',
}

interface LinkRow {
  nonce: string
  owner: string
  network: string
  at: number
  used: boolean
  stale: boolean
}

/** The few statements the card and the door speak, held in memory. */
function fakePool(tokens: Array<{ network: string; expiresAt?: number }> = []) {
  const links: LinkRow[] = []
  const states: Array<{ owner: string; network: string }> = []
  const sql: string[] = []
  const pool = {
    links,
    states,
    sql,
    query: async (q: string, p: unknown[] = []) => {
      sql.push(q)
      if (/^\s*(CREATE|ALTER)/.test(q)) return { rows: [] }
      if (/FROM social_tokens/.test(q))
        return {
          rows: tokens.map(t => ({
            network: t.network,
            account_id: 'acc',
            token_sealed: seal('held-token-value-0001', fullEnv),
            expires_at: t.expiresAt
              ? new Date(t.expiresAt).toISOString()
              : null,
            refreshed_at: new Date(T0).toISOString(),
            meta: {},
          })),
        }
      if (/INSERT INTO social_oauth_states/.test(q)) {
        states.push({ owner: String(p[1]), network: String(p[2]) })
        return { rows: [] }
      }
      if (/INSERT INTO social_connect_links/.test(q)) {
        links.push({
          nonce: String(p[0]),
          owner: String(p[1]),
          network: String(p[2]),
          at: Number(p[3]),
          used: Boolean(p[4]),
          stale: false,
        })
        return { rows: [] }
      }
      if (/max\(created_at\)/.test(q)) {
        const last = new Map<string, number>()
        for (const l of links)
          if (l.owner === p[0] && !l.stale)
            last.set(l.network, Math.max(last.get(l.network) ?? 0, l.at))
        return {
          rows: [...last].map(([network, at]) => ({ network, last: at })),
        }
      }
      if (/nonce = ANY/.test(q)) {
        const ids = p[0] as string[]
        for (const l of links)
          if (ids.includes(l.nonce)) {
            l.stale = true
            l.used = true
          }
        return { rows: [] }
      }
      if (/SET used = true/.test(q)) {
        /* The guards are read from the statement itself, so a redeem that
         * dropped `AND used = false` would really take a used link here. */
        const onlyUnused = /AND used = false/.test(q)
        const ownerBound = /AND owner = \$2/.test(q)
        const l = links.find(
          x =>
            x.nonce === p[0] &&
            (!ownerBound || x.owner === p[1]) &&
            (!onlyUnused || !x.used)
        )
        if (!l) return { rows: [] }
        l.used = true
        return { rows: [{ network: l.network, at: l.at }] }
      }
      if (/SET stale = true/.test(q)) {
        const net = links.find(x => x.nonce === p[1])?.network
        for (const l of links)
          if (l.owner === p[0] && l.network === net) l.stale = true
        return { rows: [] }
      }
      throw new Error(`unexpected SQL: ${q}`)
    },
  }
  return pool
}

/** The Bot API, as a recorder: what would have been sent, never sent. */
function botApi() {
  const sent: Array<{ to: string; text: string; markup?: any }> = []
  return {
    sent,
    send: async (to: string, text: string, markup?: unknown) => {
      sent.push({ to, text, markup: markup as any })
    },
  }
}

const buttonsOf = (
  m?: any
): Array<{ text: string; web_app: { url: string } }> =>
  (m?.inline_keyboard || []).flat()
const nonceOf = (url: string) => url.split('/').pop() as string

function door(
  pool: ReturnType<typeof fakePool>,
  over: Partial<LinkDeps> = {},
  now = T0
): LinkDeps {
  return {
    getPool: async () => pool as never,
    identity: () => OWNER,
    actor: () => 'person',
    owner: OWNER,
    now: () => now,
    env: fullEnv,
    ...over,
  }
}

beforeEach(() => {
  resetConnectLinksForTests()
  resetSocialTablesForTests()
})

describe('connect-card.t27 against the host', () => {
  it('a link is good once and for an hour', async () => {
    expect(linkOk(0, false)).toBe(true)
    expect(linkOk(SPEC.LINK_TTL_MS - 1, false)).toBe(true)
    expect(linkOk(SPEC.LINK_TTL_MS, false)).toBe(false)
    expect(linkOk(0, true)).toBe(false)
    expect(SPEC.LINK_USES).toBe(1)

    /* Through the door: the first tap starts a consent, the second does not. */
    const pool = fakePool()
    const bot = botApi()
    await runConnectCard({
      pool: pool as never,
      owner: OWNER,
      send: bot.send,
      now: () => T0,
      env: fullEnv,
    })
    const [threads] = buttonsOf(bot.sent[0].markup)
    const path = new URL(threads.web_app.url).pathname
    const first = await handleConnectLink(
      { url: path, method: 'POST' },
      door(pool)
    )
    expect(first.status).toBe(200)
    expect((first as any).json.url).toMatch(
      /^https:\/\/threads\.net\/oauth\/authorize\?/
    )
    const again = await handleConnectLink(
      { url: path, method: 'POST' },
      door(pool)
    )
    expect(again.status).toBe(410)
    expect(pool.states).toHaveLength(1)

    /* Two taps at once on the LinkedIn button: one consent, one refusal. */
    const li0 = new URL(buttonsOf(bot.sent[0].markup)[1].web_app.url).pathname
    const both = await Promise.all([
      handleConnectLink({ url: li0, method: 'POST' }, door(pool)),
      handleConnectLink({ url: li0, method: 'POST' }, door(pool)),
    ])
    expect(both.map(r => r.status).sort()).toEqual([200, 410])
    expect(pool.states).toHaveLength(2)

    /* An hour old: refused, and the network goes back in the queue. */
    const late = fakePool()
    const bot2 = botApi()
    await runConnectCard({
      pool: late as never,
      owner: OWNER,
      send: bot2.send,
      now: () => T0,
      env: fullEnv,
    })
    const li = buttonsOf(bot2.sent[0].markup)[1]
    const dead = await handleConnectLink(
      { url: new URL(li.web_app.url).pathname, method: 'POST' },
      door(late, {}, T0 + SPEC.LINK_TTL_MS)
    )
    expect(dead.status).toBe(410)
    expect(late.states).toHaveLength(0)
    expect(
      late.links.filter(l => l.network === 'linkedin').every(l => l.stale)
    ).toBe(true)
    await runConnectCard({
      pool: late as never,
      owner: OWNER,
      send: bot2.send,
      now: () => T0 + H + 1,
      env: fullEnv,
    })
    expect(bot2.sent).toHaveLength(2)
    expect(buttonsOf(bot2.sent[1].markup).map(b => b.text)).toEqual([
      'Подключить LinkedIn', // cyrillic-ok: button label
    ])
  })

  it('a usable token is connected, else the missing piece is named', async () => {
    expect(connectState(true, true, true, true)).toBe('connected')
    expect(connectState(false, false, true, true)).toBe('connected')
    expect(connectState(false, true, false, false)).toBe('no-client-id')
    expect(connectState(false, true, true, false)).toBe('no-client-id')
    expect(connectState(true, false, false, false)).toBe('no-seal-key')
    expect(connectState(true, true, false, false)).toBe('needs-connect')
    expect(connectState(true, true, true, false)).toBe('needs-connect')

    const apps = { threads: true, facebook: true, linkedin: false, x: true }
    expect(
      connectStates(
        apps,
        [
          { network: 'x', usable: true },
          { network: 'threads', usable: false },
        ],
        true
      )
    ).toEqual({
      threads: 'needs-connect',
      facebook: 'needs-connect',
      linkedin: 'no-client-id',
      x: 'connected',
    })

    /* The status door says it too. */
    const view = await handleMeta(
      { url: '/api/social/meta/status', method: 'GET' },
      {
        getPool: async () => fakePool([{ network: 'x' }]) as never,
        identity: () => OWNER,
        actor: () => 'person',
        owner: OWNER,
        fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
        now: () => T0,
        titleOf: async () => null,
        drawCard: async () => Buffer.from(''),
      }
    )
    expect((view as any).json.connect).toHaveProperty('x')
    expect(Object.values((view as any).json.connect)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^(connected|needs-connect|no-client-id|no-seal-key)$/
        ),
      ])
    )
  })

  it('a network is carded once a week until it is connected', async () => {
    expect(shouldCard('needs-connect', false, 0)).toBe(true)
    expect(shouldCard('needs-connect', true, 604799999)).toBe(false)
    expect(shouldCard('needs-connect', true, 604800000)).toBe(true)
    expect(shouldCard('no-client-id', false, 0)).toBe(true)
    expect(shouldCard('connected', false, 0)).toBe(false)
    expect(shouldCard('connected', true, 4294967295)).toBe(false)

    const pool = fakePool()
    const bot = botApi()
    const tick = (at: number) =>
      runConnectCard({
        pool: pool as never,
        owner: OWNER,
        send: bot.send,
        now: () => at,
        env: fullEnv,
      })
    expect(await tick(T0)).toBe('carded threads, linkedin')
    expect(await tick(T0 + 5 * 60_000)).toBe('nothing due')
    expect(await tick(T0 + SPEC.CARD_EVERY_MS - 1)).toBe('nothing due')
    expect(await tick(T0 + SPEC.CARD_EVERY_MS)).toBe('carded threads, linkedin')
    expect(bot.sent).toHaveLength(2)
    expect(bot.sent.every(s => s.to === OWNER)).toBe(true)

    /* Connected: never again, a week later or a year later. */
    const done = fakePool([
      { network: 'threads' },
      { network: 'linkedin', expiresAt: T0 + 60 * DAY },
    ])
    const bot2 = botApi()
    expect(
      await runConnectCard({
        pool: done as never,
        owner: OWNER,
        send: bot2.send,
        now: () => T0,
        env: fullEnv,
      })
    ).toBe('nothing due')
    expect(bot2.sent).toHaveLength(0)

    /* A card Telegram refused was never carded: the next tick tries again,
     * and the links of the card that never arrived cannot be redeemed. */
    const lost = fakePool()
    let refuse = true
    const bot3 = botApi()
    const flaky = (at: number) =>
      runConnectCard({
        pool: lost as never,
        owner: OWNER,
        send: async (to, text, markup) => {
          if (refuse) throw new Error('Telegram 400')
          await bot3.send(to, text, markup)
        },
        now: () => at,
        env: fullEnv,
      })
    await expect(flaky(T0)).rejects.toThrow('Telegram 400')
    expect(lost.links.every(l => l.stale && l.used)).toBe(true)
    refuse = false
    expect(await flaky(T0 + 5 * 60_000)).toBe('carded threads, linkedin')
    expect(bot3.sent).toHaveLength(1)
  })

  it('only a network that can be connected gets a button', async () => {
    expect(hasButton('needs-connect')).toBe(true)
    expect(hasButton('no-client-id')).toBe(false)
    expect(hasButton('no-seal-key')).toBe(false)
    expect(hasButton('connected')).toBe(false)

    /* LinkedIn without its client id: a line naming the variables, no button. */
    const { LINKEDIN_CLIENT_ID: _id, ...noLinkedIn } = fullEnv
    const pool = fakePool()
    const bot = botApi()
    await runConnectCard({
      pool: pool as never,
      owner: OWNER,
      send: bot.send,
      now: () => T0,
      env: noLinkedIn,
    })
    const buttons = buttonsOf(bot.sent[0].markup)
    expect(buttons.map(b => b.text)).toEqual(['Подключить Threads']) // cyrillic-ok: button label
    expect(bot.sent[0].text).toContain(
      'LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET'
    )
    /* A web_app button: it opens inside Telegram, with the owner's signature. */
    expect(buttons[0]).not.toHaveProperty('url')
    expect(buttons[0].web_app.url).toMatch(
      /^https:\/\/vibee-render-production\.up\.railway\.app\/api\/social\/connect\/[A-Za-z0-9_-]{16,64}$/
    )
    /* The no-button row is born used: it can never be redeemed. */
    const li = pool.links.find(l => l.network === 'linkedin')!
    const out = await handleConnectLink(
      { url: `/api/social/connect/${li.nonce}`, method: 'POST' },
      door(pool, { env: noLinkedIn })
    )
    expect(out.status).toBe(410)

    /* No sealing key: no buttons at all, and nothing dead under the text. */
    const { META_TOKEN_KEY: _k, ...noKey } = fullEnv
    const bot2 = botApi()
    resetConnectLinksForTests()
    await runConnectCard({
      pool: fakePool() as never,
      owner: OWNER,
      send: bot2.send,
      now: () => T0,
      env: noKey,
    })
    expect(bot2.sent[0].markup).toBeUndefined()
    expect(bot2.sent[0].text).toContain('META_TOKEN_KEY')
  })

  it('the agent cannot start a consent', async () => {
    expect(mayStart('person')).toBe(true)
    expect(mayStart('agent')).toBe(false)
    expect(SPEC.AGENT_MAY_START).toBe(false)

    const pool = fakePool()
    const bot = botApi()
    await runConnectCard({
      pool: pool as never,
      owner: OWNER,
      send: bot.send,
      now: () => T0,
      env: fullEnv,
    })
    const path = new URL(buttonsOf(bot.sent[0].markup)[0].web_app.url).pathname
    /* The agent's key names the owner, and still: 403, nothing spent. */
    const agent = await handleConnectLink(
      { url: path, method: 'POST' },
      door(pool, { actor: () => 'agent' })
    )
    expect(agent.status).toBe(403)
    expect(pool.states).toHaveLength(0)
    expect(pool.links.find(l => l.nonce === nonceOf(path))!.used).toBe(false)
    /* No signature at all, and a stranger's signature. */
    expect(
      (
        await handleConnectLink(
          { url: path, method: 'POST' },
          door(pool, { identity: () => null })
        )
      ).status
    ).toBe(401)
    expect(
      (
        await handleConnectLink(
          { url: path, method: 'POST' },
          door(pool, { identity: () => '2' })
        )
      ).status
    ).toBe(403)
    expect(pool.states).toHaveLength(0)
    /* The owner himself, after all of that: the link still works. */
    expect(
      (await handleConnectLink({ url: path, method: 'POST' }, door(pool)))
        .status
    ).toBe(200)

    /* The meta start door refuses the agent the same way. */
    const meta = await handleMeta(
      { url: '/api/social/meta/start?network=linkedin', method: 'GET' },
      {
        getPool: async () => pool as never,
        identity: () => OWNER,
        actor: () => 'agent',
        owner: OWNER,
        fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
        now: () => T0,
        titleOf: async () => null,
        drawCard: async () => Buffer.from(''),
      }
    )
    expect(meta.status).toBe(403)
  })

  it('the consent asks only to read the profile and to post', async () => {
    expect(SPEC.THREADS_SCOPES).toBe('threads_basic,threads_content_publish')
    expect(SPEC.LINKEDIN_SCOPES).toBe('openid profile w_member_social')
    expect(SPEC.CARD_NETWORKS).toBe(2)
    expect(THREADS_SCOPES).toBe(SPEC.THREADS_SCOPES)
    expect(LINKEDIN_SCOPES).toBe(SPEC.LINKEDIN_SCOPES)

    const pool = fakePool()
    const bot = botApi()
    await runConnectCard({
      pool: pool as never,
      owner: OWNER,
      send: bot.send,
      now: () => T0,
      env: fullEnv,
    })
    const buttons = buttonsOf(bot.sent[0].markup)
    expect(buttons).toHaveLength(SPEC.CARD_NETWORKS)
    for (const b of buttons) {
      const out: any = await handleConnectLink(
        { url: new URL(b.web_app.url).pathname, method: 'POST' },
        door(pool)
      )
      const scope = new URL(out.json.url).searchParams.get('scope')
      expect([SPEC.THREADS_SCOPES, SPEC.LINKEDIN_SCOPES]).toContain(scope)
    }
  })

  it('the card carries no token and posts nothing', async () => {
    expect(SPEC.TOKEN_IN_CARD).toBe(false)
    expect(SPEC.CONNECT_POSTS).toBe(false)
    expect(SPEC.LINK_TTL_MS).toBeLessThan(SPEC.CARD_EVERY_MS)
    expect(linkOk(SPEC.CARD_EVERY_MS, false)).toBe(false)

    const pool = fakePool([{ network: 'x' }])
    const bot = botApi()
    await runConnectCard({
      pool: pool as never,
      owner: OWNER,
      send: bot.send,
      now: () => T0,
      env: fullEnv,
    })
    const said = JSON.stringify(bot.sent)
    for (const secret of [
      'held-token-value-0001',
      ...Object.values(fullEnv).filter(v => v.length > 1),
    ])
      expect(said).not.toContain(secret)
    /* Nothing but the card's own table and the token read: no post, no state. */
    expect(pool.sql.some(q => /social_posts|publish/i.test(q))).toBe(false)
    expect(pool.states).toHaveLength(0)
  })

  it('nothing has been connected by a card yet', () => {
    expect(SPEC.RUN_LIVE).toBe(false)
    expect(SPEC.VERSION).toBe(1)
    expect(connectState(true, true, false, false)).not.toBe('connected')
  })
})
