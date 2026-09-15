/**
 * WHAT THE DELIVERY ACTUALLY DOES, against a fake database and a fake Telegram.
 *
 * The three properties that decide whether this feature is safe to have in
 * production at all:
 *   - without credentials it sends NOTHING and completes normally (a channel is
 *     a deliberate act of the owner, never a precondition of the factory);
 *   - the cap holds, and what it did not send is SAID OUT LOUD (silent
 *     truncation reads as "we posted everything");
 *   - a reel already carried into the channel is never carried twice.
 *
 * THE FAKE IS DELIBERATELY STUPID. It dispatches on the text of the query and
 * enforces nothing: it hands back every row it was given -- including rows that
 * already carry tg_posted_at, and MORE rows than the LIMIT asked for. If the
 * fake applied the cap or the dedupe, these tests would be measuring the fake.
 * The invariants have to hold in the code under test, which is why the code
 * checks tg_posted_at and slices to the cap itself rather than trusting the
 * WHERE clause it cannot see from here.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  COUNT_TODAY,
  DEFAULT_MAX_PER_RUN,
  ENV_NAMES,
  HARD_MAX_PER_RUN,
  MARK_ATTEMPT,
  MARK_POSTED,
  MAX_ATTEMPTS,
  SELECT_PENDING,
  captionFor,
  deliverToChannel,
  isPresigned,
  readChannelConfig,
  resolveOwner,
  type Db,
  type PendingReel,
  type SendVideo,
} from './src/channel-delivery'

const OWNER = '144022504'

/** Credentials under the names the deploy actually defines. */
const LIVE_ENV = {
  TELEGRAM_CHANNEL_BOT_TOKEN: 'token-x',
  TELEGRAM_CHANNEL_ID: '-1003321307457',
  AGENT_KEYS: `k1:${OWNER}`,
  TG_POST_MAX_PER_DAY: '10', // the drain is off by default; these tests turn it on
}

function reel(over: Partial<PendingReel> = {}): PendingReel {
  return {
    id: 1,
    name: 'Рилс',
    video_url: 'https://bucket.example/renders/a.mp4',
    description: 'первая строка\nвторая',
    created_at: '2026-08-23 04:02:00+00',
    tg_posted_at: null,
    tg_post_attempts: 0,
    ...over,
  }
}

function fakeDb(opts: { pending?: PendingReel[]; today?: number } = {}) {
  const calls: { sql: string; params: unknown[] }[] = []
  const db: Db = {
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params })
      if (/count\(\*\)/i.test(sql) && /tg_posted_at'\s*>=/.test(sql))
        return { rows: [{ n: opts.today ?? 0 }] }
      if (/count\(\*\)/i.test(sql))
        return { rows: [{ n: (opts.pending ?? []).length }] }
      // No LIMIT, no WHERE: everything it was handed, in the order given.
      if (/^SELECT id/.test(sql.trim())) return { rows: opts.pending ?? [] }
      return { rows: [] }
    },
  }
  const sqlOf = (re: RegExp) => calls.filter(c => re.test(c.sql))
  return { db, calls, sqlOf }
}

/** A Telegram that always agrees, and remembers what it was asked to send. */
function sender(result: { ok: boolean; error?: string } = { ok: true }) {
  return vi.fn<SendVideo>(async () => result)
}

const lines: string[] = []
const log = (l: string) => {
  lines.push(l)
}
const linesFrom = (n: number) => lines.slice(n).join('\n')

describe('the delivery refuses to send when it should', () => {
  it('no credentials: nothing sent, no crash, and the queue length is stated', async () => {
    const { db } = fakeDb({ pending: [reel(), reel({ id: 2 })] })
    const send = sender()
    const at = lines.length
    const r = await deliverToChannel({
      db,
      log,
      send,
      env: { AGENT_KEYS: `k1:${OWNER}`, TG_POST_MAX_PER_DAY: '10' },
    })
    expect(send).not.toHaveBeenCalled()
    expect(r.dryRun).toBe(true)
    expect(r.sent).toBe(0)
    // "Nothing was sent" must not be reported as "everything is delivered".
    expect(r.pending).toBe(2)
    expect(r.skipped).toBe(2)
    expect(linesFrom(at)).toContain(ENV_NAMES.token[0])
  })

  it('no database: a stated dry run, not an exception', async () => {
    const send = sender()
    const at = lines.length
    const r = await deliverToChannel({ db: null, log, send, env: LIVE_ENV })
    expect(send).not.toHaveBeenCalled()
    expect(r.dryRun).toBe(true)
    expect(linesFrom(at)).toContain('DATABASE_URL')
  })

  it('an unresolved owner is loud, not an empty queue', async () => {
    // The old script fell back to a hardcoded id. Had it ever diverged, the
    // query would have returned zero rows and logged "all delivered" -- a false
    // green. Now it refuses, and it does not even ask the database.
    const { db, calls } = fakeDb({ pending: [reel()] })
    const send = sender()
    const at = lines.length
    const r = await deliverToChannel({
      db,
      log,
      send,
      env: { ...LIVE_ENV, AGENT_KEYS: '' },
    })
    expect(r.dryRun).toBe(true)
    expect(send).not.toHaveBeenCalled()
    expect(calls).toEqual([])
    expect(linesFrom(at)).toContain(ENV_NAMES.identity[0])
  })

  it('the day quota defaults to zero: full credentials still send nothing', async () => {
    // 26 unposted reels and 19 subscribers. Wiring the caller must not be the
    // same act as opening the tap.
    const { db } = fakeDb({ pending: [reel(), reel({ id: 2 })] })
    const send = sender()
    const at = lines.length
    const r = await deliverToChannel({
      db,
      log,
      send,
      env: {
        TELEGRAM_CHANNEL_BOT_TOKEN: 'token-x',
        TELEGRAM_CHANNEL_ID: '@chan',
        AGENT_KEYS: `k1:${OWNER}`,
      },
    })
    expect(send).not.toHaveBeenCalled()
    expect(r.dryRun).toBe(true)
    expect(r.pending).toBe(2)
    expect(linesFrom(at)).toContain(ENV_NAMES.perDay[0])
  })

  it('the day quota already spent: nothing goes out', async () => {
    const { db } = fakeDb({ pending: [reel(), reel({ id: 2 })], today: 2 })
    const send = sender()
    const r = await deliverToChannel({
      db,
      log,
      send,
      env: { ...LIVE_ENV, TG_POST_MAX_PER_DAY: '2' },
    })
    expect(send).not.toHaveBeenCalled()
    expect(r.sent).toBe(0)
    expect(r.skipped).toBe(2)
  })
})

describe('the cap on one run', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => reel({ id: i + 1, name: `r${i + 1}` }))

  it('sends exactly one by default, and says how many it did not', async () => {
    const { db } = fakeDb({ pending: many(4) })
    const send = sender()
    const at = lines.length
    const r = await deliverToChannel({ db, log, send, env: LIVE_ENV })
    expect(DEFAULT_MAX_PER_RUN).toBe(1)
    expect(send).toHaveBeenCalledTimes(1)
    expect(r.sent).toBe(1)
    expect(r.skipped).toBe(3)
    expect(linesFrom(at)).toContain('осталось в очереди 3')
  })

  it('the env override raises it', async () => {
    const { db } = fakeDb({ pending: many(4) })
    const send = sender()
    const r = await deliverToChannel({
      db,
      log,
      send,
      env: { ...LIVE_ENV, TG_POST_MAX_PER_RUN: '3' },
    })
    expect(send).toHaveBeenCalledTimes(3)
    expect(r.sent).toBe(3)
    expect(r.skipped).toBe(1)
  })

  it('an absurd override is clamped, not obeyed', async () => {
    // TG_POST_MAX_PER_RUN=99 is a typo, and the cost of honouring it is 99
    // messages nobody can recall.
    const { db } = fakeDb({ pending: many(9) })
    const send = sender()
    const r = await deliverToChannel({
      db,
      log,
      send,
      env: {
        ...LIVE_ENV,
        TG_POST_MAX_PER_RUN: '99',
        TG_POST_MAX_PER_DAY: '99',
      },
    })
    expect(send).toHaveBeenCalledTimes(HARD_MAX_PER_RUN)
    expect(r.sent).toBe(HARD_MAX_PER_RUN)
  })

  it('garbage in the override does not widen the cap', async () => {
    const { db } = fakeDb({ pending: many(4) })
    const send = sender()
    await deliverToChannel({
      db,
      log,
      send,
      env: { ...LIVE_ENV, TG_POST_MAX_PER_RUN: 'много' },
    })
    expect(send).toHaveBeenCalledTimes(DEFAULT_MAX_PER_RUN)
  })

  it('the remaining day quota wins over the per-run cap', async () => {
    const { db } = fakeDb({ pending: many(4), today: 1 })
    const send = sender()
    const r = await deliverToChannel({
      db,
      log,
      send,
      env: { ...LIVE_ENV, TG_POST_MAX_PER_RUN: '5', TG_POST_MAX_PER_DAY: '2' },
    })
    expect(send).toHaveBeenCalledTimes(1)
    expect(r.sent).toBe(1)
  })
})

describe('the ledger', () => {
  it('a reel already in the channel is not sent again', async () => {
    // The fake returns it exactly as a broken WHERE clause would. The refusal
    // has to come from the code.
    const { db, sqlOf } = fakeDb({
      pending: [reel({ id: 7, tg_posted_at: '2026-08-29T04:02:00Z' })],
    })
    const send = sender()
    const at = lines.length
    const r = await deliverToChannel({ db, log, send, env: LIVE_ENV })
    expect(send).not.toHaveBeenCalled()
    expect(r.sent).toBe(0)
    expect(sqlOf(/tg_posted_at', to_char/)).toEqual([])
    expect(linesFrom(at)).toContain('уже донесён')
  })

  it('the mark is written only after Telegram confirms', async () => {
    const { db, sqlOf } = fakeDb({ pending: [reel({ id: 11 })] })
    const send = sender({ ok: true })
    await deliverToChannel({ db, log, send, env: LIVE_ENV })
    const marks = sqlOf(/tg_posted_at', to_char/)
    expect(marks).toHaveLength(1)
    expect(marks[0].params).toEqual([11])
  })

  it('a refused send marks an attempt and NOT a delivery', async () => {
    // A stamp that survives a failed send drops the reel from the queue for
    // ever, silently. That is the one bug worth two tests.
    const { db, sqlOf } = fakeDb({ pending: [reel({ id: 12 })] })
    const send = sender({ ok: false, error: 'chat not found' })
    const at = lines.length
    const r = await deliverToChannel({ db, log, send, env: LIVE_ENV })
    expect(r.sent).toBe(0)
    expect(r.failed).toBe(1)
    expect(sqlOf(/tg_posted_at', to_char/)).toEqual([])
    expect(sqlOf(/tg_post_attempts'.*\+ 1/s)).toHaveLength(1)
    expect(linesFrom(at)).toContain('chat not found')
  })

  it('a row that has failed its allowance steps aside instead of blocking', async () => {
    // Oldest-first with no attempt counter is a head-of-line block: one
    // unsendable row stalls the drain and logs the same failure every 30
    // minutes, which reads as "the channel stopped". Same defect as 329e1458.
    const { db } = fakeDb({
      pending: [
        reel({ id: 20, tg_post_attempts: MAX_ATTEMPTS }),
        reel({ id: 21 }),
      ],
    })
    const send = sender()
    const r = await deliverToChannel({
      db,
      log,
      send,
      env: { ...LIVE_ENV, TG_POST_MAX_PER_RUN: '2' },
    })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].videoUrl).toContain('a.mp4')
    expect(r.sent).toBe(1)
  })

  it('a link with an expiry is skipped without burning an attempt', async () => {
    const { db, sqlOf } = fakeDb({
      pending: [
        reel({
          id: 30,
          video_url:
            'https://s3.example/renders/a.mp4?X-Amz-Signature=deadbeef&X-Amz-Expires=604800',
        }),
      ],
    })
    const send = sender()
    await deliverToChannel({ db, log, send, env: LIVE_ENV })
    expect(send).not.toHaveBeenCalled()
    expect(sqlOf(/tg_post_attempts'.*\+ 1/s)).toEqual([])
  })
})

describe('the names it reads and the shape of what it sends', () => {
  it('the deploy name wins, and the run says which one answered', () => {
    const cfg = readChannelConfig({
      TELEGRAM_CHANNEL_BOT_TOKEN: 'deploy',
      TG_POST_BOT_TOKEN: 'legacy',
      TELEGRAM_CHANNEL_ID: '-100',
      TG_POST_CHANNEL_ID: '@legacy',
    })
    expect(cfg.token).toBe('deploy')
    expect(cfg.tokenFrom).toBe('TELEGRAM_CHANNEL_BOT_TOKEN')
    expect(cfg.chatId).toBe('-100')
    expect(cfg.chatIdFrom).toBe('TELEGRAM_CHANNEL_ID')
  })

  it('the old names still work when they are all there is', () => {
    const cfg = readChannelConfig({
      TG_POST_BOT_TOKEN: 'legacy',
      TG_POST_CHANNEL_ID: '@legacy',
    })
    expect(cfg.token).toBe('legacy')
    expect(cfg.tokenFrom).toBe('TG_POST_BOT_TOKEN')
    expect(cfg.chatIdFrom).toBe('TG_POST_CHANNEL_ID')
  })

  it('the owner comes from the pairing, never from a literal', () => {
    expect(resolveOwner({ AGENT_KEYS: `k1:${OWNER},k2:1` })).toBe(OWNER)
    expect(resolveOwner({ OWNER_TELEGRAM_ID: '900000002' })).toBe('900000002')
    expect(resolveOwner({ AGENT_KEYS: 'k1:' })).toBe('')
    expect(resolveOwner({})).toBe('')
  })

  it('the caption carries the title, the body and the way back', () => {
    const c = captionFor(reel({ name: 'Заголовок' }))
    expect(c.startsWith('Заголовок')).toBe(true)
    expect(c).toContain('первая строка')
    expect(c).toContain('app.t27.ai/feed')
    // Telegram refuses a caption over 1024 characters outright.
    expect(
      captionFor(reel({ description: 'д'.repeat(4000) })).length
    ).toBeLessThanOrEqual(1024)
  })

  /*
   * THE FIXTURE ABOVE IS NOT WHAT THE PRODUCER EMITS, AND THAT IS HOW THE
   * DUPLICATION SHIPPED.
   *
   * `igText` in scripts/agent-autopilot.ts builds the description STARTING WITH
   * THE TITLE, then a blank line, then the body, the star CTA, the hashtags and
   * the AI disclosure. Against that real shape the old captionFor emitted the
   * headline, a blank line and the same headline again -- roughly 120 of the
   * 1024 characters Telegram allows, with the measurement and the CTA dropped.
   *
   * A fixture of the producer's actual shape is the whole point of this case.
   */
  const asProduced = (title: string) =>
    [
      title,
      '',
      'Прогон в 30 проходов показал слепое пятно в пороге отказов. Весь разбор — на t27.ai.',
      '',
      'Понравилось? Тапни ⭐ под роликом — звезда падает автору на баланс.',
      '',
      '#TrinityS3AI #t27 #блог',
      '',
      '🤖 Собрано агентом Trinity.',
    ].join('\n')

  it('does not print the title twice when the producer leads with it', () => {
    const title = 'Тридцать эпох'
    const c = captionFor(reel({ name: title, description: asProduced(title) }))
    // Once as the headline, and nowhere else.
    expect(c.split(title).length - 1).toBe(1)
  })

  it('keeps the body, the star CTA, the hashtags and the AI disclosure', () => {
    const title = 'Тридцать эпох'
    const c = captionFor(reel({ name: title, description: asProduced(title) }))
    expect(c).toContain('слепое пятно')
    expect(c).toContain('звезда падает автору')
    expect(c).toContain('#TrinityS3AI')
    expect(c).toContain('Собрано агентом Trinity')
    expect(c).toContain('app.t27.ai/feed')
    // Measured against the old behaviour, which shipped 121 characters.
    expect(c.length).toBeGreaterThan(200)
  })

  it('still works when the description does NOT repeat the title', () => {
    const c = captionFor(reel({ name: 'Заголовок', description: 'тело поста' }))
    expect(c).toContain('Заголовок')
    expect(c).toContain('тело поста')
  })

  it('it sends a URL with the resolved credentials', async () => {
    const { db } = fakeDb({ pending: [reel({ id: 5 })] })
    const send = sender()
    await deliverToChannel({ db, log, send, env: LIVE_ENV })
    expect(send.mock.calls[0][0]).toMatchObject({
      token: 'token-x',
      chatId: '-1003321307457',
      videoUrl: 'https://bucket.example/renders/a.mp4',
    })
  })

  it('isPresigned tells an expiring link from a durable one', () => {
    expect(isPresigned('https://b/a.mp4')).toBe(false)
    expect(isPresigned('https://b/a.mp4?X-Amz-Signature=1')).toBe(true)
  })
})

describe('the SQL says what the behaviour tests cannot see', () => {
  /**
   * The fake above answers by pattern and is blind to whether the query is
   * valid or even asks the right thing -- the lesson of autopilot-sql-shape.ts,
   * where renaming a column left the whole suite green. These assertions pin the
   * three clauses that make the drain safe.
   */
  it('the queue is filtered by the ledger, oldest first, and bounded', () => {
    expect(SELECT_PENDING).toMatch(/template_settings->>'tg_posted_at' IS NULL/)
    expect(SELECT_PENDING).toMatch(/ORDER BY created_at ASC/)
    expect(SELECT_PENDING).toMatch(/LIMIT \$3/)
    expect(SELECT_PENDING).toMatch(/deleted_at IS NULL/)
    expect(SELECT_PENDING).toMatch(/video_url IS NOT NULL/)
  })

  it('the day quota is counted from the database, not from a file', () => {
    // loop/state.json is wiped by every deploy: a file-based counter would
    // reset several times a day and the cap would be fiction.
    expect(COUNT_TODAY).toMatch(/count\(\*\)/)
    expect(COUNT_TODAY).toMatch(/tg_posted_at' >= \$2/)
  })

  it('the two marks write different fields', () => {
    expect(MARK_POSTED).toMatch(/'tg_posted_at'/)
    expect(MARK_POSTED).not.toMatch(/tg_post_attempts/)
    expect(MARK_ATTEMPT).toMatch(/'tg_post_attempts'/)
    expect(MARK_ATTEMPT).not.toMatch(/'tg_posted_at'/)
  })
})

describe('nothing escapes outward', () => {
  it('a database that throws is a logged outcome, not an exception', async () => {
    // The caller is a supervised daemon: an escaped error is a 60-second
    // respawn loop that looks like a deploy problem.
    const db: Db = {
      async query() {
        throw new Error('connection terminated')
      },
    }
    const at = lines.length
    const r = await deliverToChannel({ db, log, send: sender(), env: LIVE_ENV })
    expect(r.sent).toBe(0)
    expect(linesFrom(at)).toContain('connection terminated')
  })

  it('a sender that throws is caught by the same net', async () => {
    const { db } = fakeDb({ pending: [reel()] })
    const send = vi.fn<SendVideo>(async () => {
      throw new Error('fetch failed')
    })
    const r = await deliverToChannel({ db, log, send, env: LIVE_ENV })
    expect(r.sent).toBe(0)
  })
})
