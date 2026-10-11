/**
 * Owner, 2026-10-09 (#3958): every new t27.ai blog article goes to X,
 * Telegram and the other networks by itself, and a schedule publishes what
 * was never published (spec automation/blog-share v6, src/agent/blog-autopost.ts).
 *
 * One fake database holds every table the tick reads and writes, and keeps
 * its rows across a "restart" (vi.resetModules + a fresh import), as Postgres
 * does across a deploy. The clock is the database's now() as well.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as SPEC from './src/spec/blog-share.gen'

const HOUR = 3_600_000
/* 2026-10-10 00:00 UTC. Slots: 06:00 and 14:00 UTC, an hour wide (spec v6). */
const DAY = Date.UTC(2026, 9, 10)
const BETWEEN = DAY + 3 * HOUR
const SLOT_1 = DAY + 6 * HOUR
const SLOT_2 = DAY + 14 * HOUR

const VIA = 'опубликовано через API · id 1' // cyrillic-ok: meta-connect.ts VIA_API, as the desk writes it

function feed(...slugs: string[]): string {
  return slugs
    .map(
      s =>
        `<item><title>Title ${s}</title><link>https://t27.ai/#/blog/${s}</link>` +
        `<guid isPermaLink="false">${s}</guid><description>x</description></item>`
    )
    .join('')
}

interface Pass {
  slug: string
  kind: string
  slot: string | null
  at_ms: number
}

function world() {
  let now = BETWEEN
  let rss = feed()
  let cutoffMs: number | null = null
  const seen = new Map<string, number>()
  const passes: Pass[] = []
  const ledger = new Map<
    string,
    {
      slug: string
      network: string
      state: string
      line: string
      message_id: number | null
    }
  >()
  const shares = new Map<
    string,
    { slug: string; state: string; detail: unknown }
  >()
  const published: Array<{ slug: string; skip: string[] }> = []
  const sent: string[] = []
  const told: string[] = []
  let telegramConfigured = true
  let telegramAnswer: { messageId: number } | { error: string } = {
    messageId: 4242,
  }
  let queueText = ''
  /* A read that has not seen another container's claim yet (a race). */
  let hidePasses = false
  const sec = (ms: number) => Math.floor(ms / 1000)

  const pool = {
    async query(sql: string, p: unknown[] = []) {
      const s = sql.replace(/\s+/g, ' ').trim()
      if (s.startsWith('CREATE TABLE')) return { rows: [] }
      if (s.startsWith('INSERT INTO blog_feed_seen')) {
        for (const slug of p[0] as string[])
          if (!seen.has(slug)) seen.set(slug, now)
        return { rows: [] }
      }
      if (s.startsWith('INSERT INTO blog_autopost ')) {
        if (cutoffMs === null) cutoffMs = now
        return { rows: [] }
      }
      if (s.startsWith('SELECT floor(extract(epoch from cutoff_at))'))
        return { rows: cutoffMs === null ? [] : [{ s: sec(cutoffMs) }] }
      if (s === 'DELETE FROM blog_autopost') {
        cutoffMs = null
        return { rows: [] }
      }
      if (s.startsWith('SELECT slug, floor(extract(epoch from seen_at))'))
        return {
          rows: (p[0] as string[])
            .filter(slug => seen.has(slug))
            .map(slug => ({ slug, s: sec(seen.get(slug)!) })),
        }
      if (s.startsWith('SELECT slug, kind, slot'))
        return { rows: hidePasses ? [] : passes.map(x => ({ ...x })) }
      if (s.startsWith('SELECT slug, network, state FROM blog_share_posts'))
        return { rows: [...ledger.values()].map(r => ({ ...r })) }
      if (s.startsWith('SELECT slug, state, detail FROM blog_shares'))
        return { rows: [...shares.values()].map(r => ({ ...r })) }
      if (s.startsWith('INSERT INTO blog_autopost_passes')) {
        const [slug, kind, slot] = p as [string, string, string | null]
        if (
          passes.some(x => x.slug === slug) ||
          (slot !== null && passes.some(x => x.slot === slot))
        )
          return { rows: [] }
        passes.push({ slug, kind, slot, at_ms: now })
        return { rows: [{ slug }] }
      }
      if (s.startsWith('INSERT INTO blog_share_posts')) {
        const [slug, network, state, line, message_id] = p as [
          string,
          string,
          string,
          string,
          number | null,
        ]
        const old = ledger.get(`${slug}|${network}`)
        if (old && ['posted', 'unconfirmed'].includes(old.state))
          return { rows: [] }
        ledger.set(`${slug}|${network}`, {
          slug,
          network,
          state,
          line,
          message_id,
        })
        return { rows: [] }
      }
      if (
        s.startsWith('INSERT INTO blog_shares (slug, state, detail, done_at)')
      ) {
        const slug = String(p[0])
        const old = shares.get(slug)
        if (old)
          old.detail = {
            ...(old.detail as object),
            autopost: JSON.parse(String(p[3])),
          }
        else
          shares.set(slug, {
            slug,
            state: String(p[1]),
            detail: JSON.parse(String(p[2])),
          })
        return { rows: [] }
      }
      throw new Error('unmodelled: ' + s)
    },
  }

  const deps = () => ({
    pool: pool as never,
    now: () => now,
    fetchRss: async () => rss,
    queue: async () => queueText,
    publish: async (a: { slug: string }, skip: ReadonlySet<string>) => {
      published.push({ slug: a.slug, skip: [...skip].sort() })
      const out: Record<string, string> = {}
      for (const net of ['X', 'LinkedIn', 'Threads', 'Facebook', 'Instagram'])
        if (!skip.has(net)) out[net] = VIA
      return out
    },
    telegram: {
      configured: telegramConfigured,
      send: async (a: { slug: string }) => {
        sent.push(a.slug)
        return telegramAnswer
      },
    },
    tell: async (t: string) => void told.push(t),
  })

  /** One tick of a freshly started process: the database is what it was. */
  const tick = async () => {
    vi.resetModules()
    const { blogAutopostTick } = await import('./src/agent/blog-autopost')
    return await blogAutopostTick(deps())
  }

  return {
    tick,
    deps,
    pool,
    seen,
    passes,
    ledger,
    shares,
    published,
    sent,
    told,
    at: (ms: number) => (now = ms),
    advance: (ms: number) => (now += ms),
    setFeed: (...slugs: string[]) => (rss = feed(...slugs)),
    setTelegram: (configured: boolean) => (telegramConfigured = configured),
    setTelegramAnswer: (a: { messageId: number } | { error: string }) =>
      (telegramAnswer = a),
    setQueue: (t: string) => (queueText = t),
    hidePasses: (h: boolean) => (hidePasses = h),
    cutoff: () => cutoffMs,
  }
}

let w: ReturnType<typeof world>
beforeEach(() => {
  w = world()
})

describe('every blog post goes out by itself (spec blog-share v6)', () => {
  it('a new article goes to X, Telegram and the rest, once each, and is recorded', async () => {
    w.setFeed('old-a', 'old-b')
    expect(await w.tick()).toMatch(/^autopost: nothing due/)
    expect(w.cutoff()).toBe(BETWEEN)
    expect(w.published).toHaveLength(0)

    w.advance(SPEC.TICK_MS)
    w.setFeed('fresh', 'old-a', 'old-b')
    expect(await w.tick()).toBe('autopost: fresh (new): posted')
    expect(w.published).toEqual([{ slug: 'fresh', skip: [] }])
    expect(w.sent).toEqual(['fresh'])
    for (const net of ['X', 'LinkedIn', 'Threads', 'Facebook', 'Instagram'])
      expect(w.ledger.get(`fresh|${net}`)?.state).toBe('posted')
    expect(w.ledger.get(`fresh|${SPEC.TELEGRAM}`)).toMatchObject({
      state: 'posted',
      message_id: 4242,
    })
    /* One receipt, not a question; it names every network. */
    expect(w.told).toHaveLength(1)
    expect(w.told[0]).toContain('«Title fresh»')
    expect(w.told[0]).toContain(
      'Telegram: опубликовано через API · Telegram, message_id 4242'
    ) // cyrillic-ok: the receipt's words
    expect(w.told[0]).toContain(`X: ${VIA}`)
    /* The yes path knows it: its row is there, with no approval. */
    expect(w.shares.get('fresh')?.state).toBe('posted')
  })

  it('an article already in the feed when autopost came on is not posted outside a slot', async () => {
    w.setFeed('old-a')
    await w.tick()
    for (let i = 0; i < 6; i++) {
      w.advance(SPEC.TICK_MS)
      expect(await w.tick()).toMatch(
        /^autopost: nothing due \(1 in the backlog, slot none\)/
      )
    }
    expect(w.published).toHaveLength(0)
    expect(w.sent).toHaveLength(0)
    expect(w.told).toHaveLength(0)
  })

  it('a second tick after a restart does not post the same article again', async () => {
    w.setFeed('old-a')
    await w.tick()
    w.advance(SPEC.TICK_MS)
    w.setFeed('fresh', 'old-a')
    await w.tick()
    for (let i = 0; i < 3; i++) {
      w.advance(SPEC.TICK_MS)
      await w.tick()
    }
    expect(w.published.map(p => p.slug)).toEqual(['fresh'])
    expect(w.sent).toEqual(['fresh'])
    expect(w.told).toHaveLength(1)
  })

  it('the day cap holds: cap - 1 posts, cap does not, the next day goes on', async () => {
    w.at(DAY + 15 * 60_000)
    w.setFeed('old')
    await w.tick()
    const fresh = Array.from(
      { length: SPEC.AUTO_PER_DAY + 1 },
      (_, i) => `n${i}`
    )
    w.setFeed(...fresh, 'old')
    for (let i = 0; i < SPEC.AUTO_PER_DAY; i++) {
      w.advance(SPEC.TICK_MS)
      expect(await w.tick()).toMatch(/\(new\): posted$/)
    }
    /* Newest first (the feed's order, v4). */
    expect(w.published.map(p => p.slug)).toEqual(
      fresh.slice(0, SPEC.AUTO_PER_DAY)
    )
    w.advance(SPEC.TICK_MS)
    expect(await w.tick()).toBe(
      `autopost: day cap reached (${SPEC.AUTO_PER_DAY}), 1 new waiting`
    )
    expect(w.published).toHaveLength(SPEC.AUTO_PER_DAY)
    /* 24 h after the first of them, the window has room again. */
    w.at(DAY + 15 * 60_000 + SPEC.AUTO_DAY_MS + SPEC.TICK_MS + 1000)
    expect(await w.tick()).toBe(`autopost: n${SPEC.AUTO_PER_DAY} (new): posted`)
  })

  it('without the channel, Telegram says "not configured" and the others still post', async () => {
    w.setTelegram(false)
    w.setFeed('old')
    await w.tick()
    w.advance(SPEC.TICK_MS)
    w.setFeed('fresh', 'old')
    expect(await w.tick()).toBe('autopost: fresh (new): posted')
    expect(w.sent).toHaveLength(0)
    expect(w.ledger.get(`fresh|${SPEC.TELEGRAM}`)?.state).toBe('not-configured')
    expect(w.ledger.get('fresh|X')?.state).toBe('posted')
    expect(w.told[0]).toContain(
      'Telegram: не настроено: нет TELEGRAM_CHANNEL_BOT_TOKEN / TELEGRAM_CHANNEL_ID' // cyrillic-ok: the receipt's words
    )
  })

  it('a Telegram answer without a message_id is a failure, not a post', async () => {
    w.setTelegramAnswer({ error: 'Bad Request: chat not found' })
    w.setFeed('old')
    await w.tick()
    w.advance(SPEC.TICK_MS)
    w.setFeed('fresh', 'old')
    await w.tick()
    expect(w.ledger.get(`fresh|${SPEC.TELEGRAM}`)?.state).toBe('failed')
    expect(w.told[0]).toContain('Telegram: ошибка: Bad Request: chat not found') // cyrillic-ok: the receipt's words
    w.setTelegramAnswer({ messageId: 0 })
    w.advance(SPEC.TICK_MS)
    w.setFeed('fresh2', 'fresh', 'old')
    await w.tick()
    expect(w.ledger.get(`fresh2|${SPEC.TELEGRAM}`)?.state).toBe('failed')
  })

  it('two backlog articles and one slot: one posted; the next slot, the second; a restart inside a slot, nothing', async () => {
    w.setFeed('newer', 'older')
    await w.tick()
    w.at(SLOT_1)
    expect(await w.tick()).toBe('autopost: newer (backlog): posted')
    expect(w.passes.at(-1)?.slot).toBe('2026-10-10#1')
    /* Still inside the slot, a restart between ticks: nothing more. */
    for (const t of [
      SLOT_1 + SPEC.TICK_MS,
      SLOT_1 + 30 * 60_000,
      SLOT_1 + HOUR - 1000,
    ]) {
      w.at(t)
      expect(await w.tick()).toMatch(/^autopost: nothing due/)
    }
    w.at(SLOT_2)
    expect(await w.tick()).toBe('autopost: older (backlog): posted')
    w.at(DAY + 24 * HOUR + 6 * HOUR)
    expect(await w.tick()).toBe(
      'autopost: nothing due (0 in the backlog, slot 1)'
    )
    expect(w.published.map(p => p.slug)).toEqual(['newer', 'older'])
    expect(w.told).toHaveLength(2)
  })

  it('a used slot is not used twice, even by a tick that raced for it', async () => {
    w.setFeed('a', 'b')
    await w.tick()
    w.at(SLOT_1)
    /* Another container claimed the slot for b; this tick's read missed it. */
    w.passes.push({
      slug: 'b',
      kind: 'backlog',
      slot: '2026-10-10#1',
      at_ms: SLOT_1,
    })
    w.hidePasses(true)
    expect(await w.tick()).toBe('autopost: a was claimed already')
    expect(w.published).toHaveLength(0)
    expect(w.sent).toHaveLength(0)
    expect(w.told).toHaveLength(0)
  })

  it("the backlog goes the owner's queue first, then the newest", async () => {
    w.setFeed('newest', 'middle', 'oldest')
    await w.tick()
    w.setQueue('the queue: oldest, then middle')
    w.at(SLOT_1)
    expect(await w.tick()).toBe('autopost: oldest (backlog): posted')
    w.at(SLOT_2)
    expect(await w.tick()).toBe('autopost: middle (backlog): posted')
    w.setQueue('')
    w.at(DAY + 24 * HOUR + 6 * HOUR)
    expect(await w.tick()).toBe('autopost: newest (backlog): posted')
  })

  it('a backlog article on X and not in Telegram gets only what it lacks', async () => {
    w.setFeed('on-x', 'everywhere', 'asked')
    /* The yes path posted on-x to X by its API; LinkedIn missed (v5 rows). */
    w.shares.set('on-x', {
      slug: 'on-x',
      state: 'posted',
      detail: {
        result: {
          X: VIA,
          LinkedIn: 'кнопка публикации не найдена — окно оставлено открытым', // cyrillic-ok: the words publishEverywhere writes
        },
      },
    })
    w.shares.set('asked', { slug: 'asked', state: 'asked', detail: {} })
    for (const net of [
      'X',
      'LinkedIn',
      'Threads',
      'Facebook',
      'Instagram',
      'Reddit',
      'telegram',
    ])
      w.ledger.set(`everywhere|${net}`, {
        slug: 'everywhere',
        network: net,
        state: net === 'Threads' ? 'unconfirmed' : 'posted',
        line: VIA,
        message_id: null,
      })
    await w.tick()
    w.at(SLOT_1)
    expect(await w.tick()).toBe('autopost: on-x (backlog): posted')
    expect(w.published).toEqual([{ slug: 'on-x', skip: ['X'] }])
    expect(w.sent).toEqual(['on-x'])
    expect(w.told[0]).toContain('X: уже опубликовано раньше — пропущено') // cyrillic-ok: the receipt's words
    /* Everywhere already (an unconfirmed press counts), or a question open: not offered. */
    w.at(SLOT_2)
    expect(await w.tick()).toBe(
      'autopost: nothing due (0 in the backlog, slot 2)'
    )
    expect(w.published).toHaveLength(1)
  })

  it('a backlog article on every desk network gets only Telegram; one in Telegram gets only the desk', async () => {
    const DESK = ['X', 'LinkedIn', 'Threads', 'Facebook', 'Instagram', 'Reddit']
    const carry = (slug: string, nets: string[]) => {
      for (const net of nets)
        w.ledger.set(`${slug}|${net}`, {
          slug,
          network: net,
          state: 'posted',
          line: VIA,
          message_id: null,
        })
    }
    w.setFeed('desk-done', 'in-tg')
    carry('desk-done', DESK)
    carry('in-tg', ['telegram'])
    await w.tick()
    w.at(SLOT_1)
    expect(await w.tick()).toBe('autopost: desk-done (backlog): posted')
    expect(w.published).toHaveLength(0)
    expect(w.sent).toEqual(['desk-done'])
    w.at(SLOT_2)
    expect(await w.tick()).toBe('autopost: in-tg (backlog): posted')
    expect(w.published).toEqual([{ slug: 'in-tg', skip: [] }])
    expect(w.sent).toEqual(['desk-done'])
    expect(w.told[1]).toContain('Telegram: уже опубликовано раньше — пропущено') // cyrillic-ok: the receipt's words
  })

  it('without the channel, an article every desk network carries is not in the backlog', async () => {
    w.setTelegram(false)
    w.setFeed('desk-done')
    for (const net of [
      'X',
      'LinkedIn',
      'Threads',
      'Facebook',
      'Instagram',
      'Reddit',
    ])
      w.ledger.set(`desk-done|${net}`, {
        slug: 'desk-done',
        network: net,
        state: 'posted',
        line: VIA,
        message_id: null,
      })
    await w.tick()
    w.at(SLOT_1)
    expect(await w.tick()).toBe(
      'autopost: nothing due (0 in the backlog, slot 1)'
    )
  })

  it("new articles do not use up the backlog's two a day", async () => {
    w.setFeed('old-a', 'old-b')
    await w.tick()
    w.setFeed('n1', 'n2', 'n3', 'old-a', 'old-b')
    for (let i = 0; i < 3; i++) {
      w.advance(SPEC.TICK_MS)
      expect(await w.tick()).toMatch(/\(new\): posted$/)
    }
    w.at(SLOT_1)
    expect(await w.tick()).toBe('autopost: old-a (backlog): posted')
    w.at(SLOT_2)
    expect(await w.tick()).toBe('autopost: old-b (backlog): posted')
  })

  it('a new article takes the tick before the backlog, and does not use its slot', async () => {
    w.setFeed('old')
    await w.tick()
    w.at(SLOT_1)
    w.setFeed('fresh', 'old')
    expect(await w.tick()).toBe('autopost: fresh (new): posted')
    w.advance(SPEC.TICK_MS)
    expect(await w.tick()).toBe('autopost: old (backlog): posted')
  })

  it('switched off, the cutoff is cleared; switched on again, the meantime is backlog', async () => {
    const { autopostOff } = await import('./src/agent/blog-autopost')
    w.setFeed('a')
    await w.tick()
    expect(w.cutoff()).not.toBe(null)
    await autopostOff(w.pool as never)
    expect(w.cutoff()).toBe(null)
    w.advance(HOUR)
    w.setFeed('meantime', 'a')
    expect(await w.tick()).toMatch(/^autopost: nothing due \(2 in the backlog/)
    expect(w.published).toHaveLength(0)
  })

  it('autopost asks no question about an article; a release keeps its yes', async () => {
    const { blogShareTick } = await import('./src/agent/blog-share')
    const asked: string[] = []
    const said = await blogShareTick({
      pool: { query: async () => ({ rows: [] }) } as never,
      owner: '1',
      now: () => SLOT_1,
      fetchRss: async () => feed('a', 'b'),
      ask: async what => (asked.push(what), 'q'),
      answerOf: async () => 'pending',
      publish: async () => ({}),
      tell: async () => undefined,
      autopost: true,
    })
    expect(said).toBe('autopost: articles are posted, not asked about')
    expect(asked).toHaveLength(0)
  })
})

describe('the Telegram channel as a network (blog-share-wiring.ts telegramChannel)', () => {
  const article = {
    slug: 'open-fpga',
    title: 'Open FPGA Ethernet, at last',
    link: 'https://t27.ai/#/blog/open-fpga',
    summary: 'x',
  }

  it('is configured only by both env names channel-delivery.ts reads', async () => {
    const { telegramChannel } = await import('./src/agent/blog-share-wiring')
    const { ENV_NAMES } = await import('./src/channel-delivery')
    expect(telegramChannel({}).configured).toBe(false)
    expect(telegramChannel({ [ENV_NAMES.token[0]]: 't' }).configured).toBe(
      false
    )
    expect(telegramChannel({ [ENV_NAMES.chatId[0]]: '@c' }).configured).toBe(
      false
    )
    expect(
      telegramChannel({
        [ENV_NAMES.token[0]]: 't',
        [ENV_NAMES.chatId[0]]: '@c',
      }).configured
    ).toBe(true)
    expect(
      telegramChannel({
        [ENV_NAMES.token[1]]: 't',
        [ENV_NAMES.chatId[1]]: '@c',
      }).configured
    ).toBe(true)
  })

  it('posts the title and the static article link with a preview, and returns message_id', async () => {
    const { telegramChannel } = await import('./src/agent/blog-share-wiring')
    const calls: Array<{ url: string; body: any }> = []
    const ch = telegramChannel(
      { TELEGRAM_CHANNEL_BOT_TOKEN: '123:abc', TELEGRAM_CHANNEL_ID: '@t27' },
      (async (url: string, init: { body: string }) => {
        calls.push({ url, body: JSON.parse(init.body) })
        return new Response(
          JSON.stringify({ ok: true, result: { message_id: 77 } })
        )
      }) as never
    )
    expect(await ch.send(article)).toEqual({ messageId: 77 })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toMatch(/\/bot123:abc\/sendMessage$/)
    expect(calls[0].body.chat_id).toBe('@t27')
    const text = String(calls[0].body.text)
    expect(
      text.startsWith(
        'Open FPGA Ethernet, at last\n\nhttps://t27.ai/blog/open-fpga/'
      )
    ).toBe(true)
    expect(text).not.toContain('#/')
    expect(calls[0].body.link_preview_options).toMatchObject({
      is_disabled: false,
    })
    expect(String(calls[0].body.link_preview_options.url)).toMatch(
      /^https:\/\/t27\.ai\/blog\/open-fpga\/\?utm_source=telegram/
    )
  })

  it("Telegram's refusal is an error, never a message_id", async () => {
    const { telegramChannel } = await import('./src/agent/blog-share-wiring')
    const ch = telegramChannel(
      { TELEGRAM_CHANNEL_BOT_TOKEN: '123:abc', TELEGRAM_CHANNEL_ID: '@t27' },
      (async () =>
        new Response(JSON.stringify({ ok: false, description: 'Forbidden' }), {
          status: 403,
        })) as never
    )
    expect(await ch.send(article)).toEqual({ error: 'Forbidden' })
    /* A 200 is not a receipt by itself: Telegram's ok and a message_id are. */
    for (const body of [
      { ok: false, description: 'Bad Request: chat not found' },
      { ok: true, result: {} },
    ]) {
      const odd = telegramChannel(
        { TELEGRAM_CHANNEL_BOT_TOKEN: '123:abc', TELEGRAM_CHANNEL_ID: '@t27' },
        (async () => new Response(JSON.stringify(body))) as never
      )
      expect('error' in (await odd.send(article))).toBe(true)
    }
    expect(await telegramChannel({}).send(article)).toEqual({
      error: 'the channel is not configured',
    })
  })
})

describe('the wiring of autopost (blog-share-wiring.ts)', () => {
  it('BLOG_AUTOPOST=1 runs the tick with the channel; anything else clears the cutoff', async () => {
    const { autopostStep } = await import('./src/agent/blog-share-wiring')
    const base = w.deps()
    w.setFeed('a')
    const off = await autopostStep({ ...base, env: { BLOG_AUTOPOST: 'true' } })
    expect(off).toEqual({ autopost: false, said: '' })
    expect(w.cutoff()).toBe(null)
    const on = await autopostStep({ ...base, env: { BLOG_AUTOPOST: '1' } })
    expect(on.autopost).toBe(true)
    expect(on.said).toMatch(/^autopost: nothing due/)
    expect(w.cutoff()).toBe(BETWEEN)
    await autopostStep({ ...base, env: {} })
    expect(w.cutoff()).toBe(null)
  })

  it('posts to the channel the env names, and a failure is said, not thrown', async () => {
    const { autopostStep } = await import('./src/agent/blog-share-wiring')
    const base = w.deps()
    const posted: string[] = []
    const env = {
      BLOG_AUTOPOST: '1',
      TELEGRAM_CHANNEL_BOT_TOKEN: '123:abc',
      TELEGRAM_CHANNEL_ID: '@t27',
    }
    const doFetch = (async (_url: string, init: { body: string }) => {
      posted.push(JSON.parse(init.body).text)
      return new Response(
        JSON.stringify({ ok: true, result: { message_id: 9 } })
      )
    }) as never
    w.setFeed('a')
    await autopostStep({ ...base, env, doFetch })
    w.advance(SPEC.TICK_MS)
    w.setFeed('fresh', 'a')
    expect((await autopostStep({ ...base, env, doFetch })).said).toBe(
      'autopost: fresh (new): posted'
    )
    expect(posted).toHaveLength(1)
    expect(w.ledger.get(`fresh|${SPEC.TELEGRAM}`)?.message_id).toBe(9)
    const failed = await autopostStep({
      ...base,
      env,
      doFetch,
      fetchRss: async () => {
        throw new Error('feed answered 503')
      },
    })
    expect(failed).toEqual({
      autopost: true,
      said: 'autopost failed: Error: feed answered 503',
    })
  })

  it('the API networks skip what carries the article; Instagram goes with Facebook', async () => {
    const { apiNetworksFor } = await import('./src/agent/blog-share-wiring')
    expect(apiNetworksFor(new Set())).toBe(undefined)
    expect(apiNetworksFor(new Set(['X']))).toEqual([
      'threads',
      'facebook',
      'linkedin',
    ])
    expect(apiNetworksFor(new Set(['Facebook', 'LinkedIn']))).toEqual([
      'threads',
      'x',
    ])
    expect(
      apiNetworksFor(new Set(['X', 'LinkedIn', 'Threads', 'Facebook']))
    ).toEqual([])
  })
})
