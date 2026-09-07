import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HIVE_TOOLS } from './src/agent/hive-tools'
import { safeTitle } from './src/hive/queen-client'

/**
 * THE QUEEN AT t27.ai -- WHO MAY LOOK, AND WHAT HAPPENS WHEN SHE IS SILENT.
 *
 * She is a different hive: she judges code in `gHashTag/trios`, not this
 * platform. Two properties are worth pinning down.
 *
 * FIRST, KEEPER ONLY. Her API is public and unauthenticated, and that is
 * precisely the trap: "it is public anyway" is how internal engineering state
 * ends up on a bot owner's screen. The agent chat is the same screen for an
 * owner and for an ordinary user.
 *
 * SECOND, SILENCE IS NOT ZERO. "0 bees, 0 verdicts" and "she did not answer"
 * look identical on a dashboard and mean opposite things -- a quiet hive, or a
 * blind one. Reporting the second as the first is the whole failure of a status
 * panel.
 */

const tool = (name: string) => {
  const t = HIVE_TOOLS.find(t => t.name === name)
  if (!t) throw new Error(`no such tool: ${name}`)
  return t
}

const OWNERSHIP: Record<string, string[]> = { '2': ['bot_a'], '3': [] }

/** Enough of a pool for `visibilityOf`; the Queen tool never touches the db. */
const pool = {
  async query() {
    return { rows: [] }
  },
}

function stubAvatars() {
  return async (url: string) => {
    if (String(url).includes('/rest/v1/avatars')) {
      const m = String(url).match(/telegram_id=eq\.(\d+)/)
      const bots = OWNERSHIP[m?.[1] ?? ''] ?? []
      return {
        ok: true,
        json: async () => bots.map(b => ({ bot_name: b })),
      } as any
    }
    throw new Error(`unexpected fetch: ${url}`)
  }
}

beforeEach(() => {
  process.env.HIVE_KEEPERS = '1'
  process.env.SUPABASE_URL = 'https://example.invalid'
  process.env.SUPABASE_SERVICE_KEY = 'key'
})

describe('the Queen is keeper-only', () => {
  it('an ordinary person is refused, and the refusal names the role', async () => {
    vi.stubGlobal('fetch', stubAvatars())
    await expect(
      tool('hive_queen').handler({}, { pool, telegramId: '3' } as any)
    ).rejects.toThrow('смотрителю')
  })

  it('a BOT OWNER is refused too -- this is platform state, not their bot', async () => {
    /*
     * The case that is easy to get wrong. An owner legitimately sees their own
     * bots' events, and it is tempting to let them see "the engineering panel
     * as well". It names file paths and issue numbers of another repository.
     */
    vi.stubGlobal('fetch', stubAvatars())
    await expect(
      tool('hive_queen').handler({}, { pool, telegramId: '2' } as any)
    ).rejects.toThrow('смотрителю')
  })

  it('an unidentified caller does not even reach the role check', async () => {
    vi.stubGlobal('fetch', stubAvatars())
    await expect(
      tool('hive_queen').handler({}, { pool, telegramId: '' } as any)
    ).rejects.toThrow('личности')
  })
})

describe('when the Queen is silent she is not reported as quiet', () => {
  it('an unreachable Queen answers reachable:false and says what it means', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (String(url).includes('/rest/v1/avatars')) return stubAvatars()(url)
      throw new Error('connect ECONNREFUSED')
    })
    const out: any = await tool('hive_queen').handler({}, {
      pool,
      telegramId: '1',
    } as any)
    expect(out.reachable).toBe(false)
    // The distinction is spelled out for the reader, not left to be inferred
    // from a zero.
    expect(out.how_to_read).toContain('НЕ значит')
    expect(out.bees).toBeUndefined()
  })

  it('a keeper sees her numbers when she answers', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      const u = String(url)
      if (u.includes('/rest/v1/avatars')) return stubAvatars()(u)
      if (u.includes('/queen/status'))
        return {
          ok: true,
          json: async () => ({
            swarmState: 'waiting_for_review',
            workers: { capacity: 4, active: 0, idle: 4 },
            scheduler: { intervalSeconds: 300 },
            lastTick: {
              decidedAt: '2026-09-07T07:56:17.771Z',
              skippedCount: 198,
            },
          }),
        } as any
      if (u.includes('/queen/public-activity'))
        return {
          ok: true,
          json: async () => ({
            events: [
              {
                kind: 'review',
                issue: 1575,
                title: 'breaks L3',
                at: 'x',
                state: 'wait',
              },
            ],
          }),
        } as any
      if (u.includes('/queen/public-board'))
        return {
          ok: true,
          json: async () => ({
            repo: 'gHashTag/trios',
            cards: [
              { number: 1, column: 'review', title: 'a' },
              { number: 2, column: 'review', title: 'b' },
              { number: 3, column: 'done', title: 'c' },
            ],
          }),
        } as any
      throw new Error(`unexpected fetch: ${u}`)
    })

    const out: any = await tool('hive_queen').handler({}, {
      pool,
      telegramId: '1',
    } as any)
    expect(out.reachable).toBe(true)
    expect(out.repo).toBe('gHashTag/trios')
    expect(out.bees).toEqual({ capacity: 4, active: 0, idle: 4 })
    // This stub predates her publishing `columns`, so the board falls back to
    // the counts -- see 'if she publishes no columns at all' below.
    expect(out.board).toEqual([
      { key: 'review', title: 'review', blurb: '', count: 2 },
      { key: 'done', title: 'done', blurb: '', count: 1 },
    ])
    expect(out.awaiting_judgement).toHaveLength(2)
    expect(out.latest[0].issue).toBe(1575)
  })
})

/**
 * AN EMPTY COLUMN IS NEWS, AND IT WAS DISAPPEARING.
 *
 * She publishes the board's columns herself -- six of them, each with a key, a
 * title and a blurb -- and separately the cards. Counting the cards to discover
 * the columns loses every column that currently holds nothing: `blocked` and
 * `running` are empty most of the time, so the agent reported FOUR columns while
 * the mini app and the phone reported SIX.
 *
 * "nothing is running" and "there is no such column" are different facts, and
 * this panel exists to tell them apart. The other two surfaces already read her
 * declaration (`player/src/lib/hive.ts`, `HiveAPI.swift`); this is the odd one
 * out being brought in line.
 */
function queenFetch(board: any) {
  return async (url: string) => {
    const u = String(url)
    if (u.includes('/rest/v1/avatars')) return stubAvatars()(u)
    if (u.includes('/queen/status'))
      return {
        ok: true,
        json: async () => ({
          swarmState: 'waiting_for_review',
          workers: { capacity: 4, active: 0, idle: 4 },
          scheduler: { intervalSeconds: 300 },
          lastTick: { decidedAt: 'x', skippedCount: 0 },
        }),
      } as any
    if (u.includes('/queen/public-activity'))
      return { ok: true, json: async () => ({ events: [] }) } as any
    if (u.includes('/queen/public-board'))
      return { ok: true, json: async () => board } as any
    throw new Error(`unexpected fetch: ${u}`)
  }
}

const asKeeper = () =>
  tool('hive_queen').handler({}, { pool, telegramId: '1' } as any) as any

/** Her real shape, trimmed: six declared columns, cards in only two of them. */
const HER_BOARD = {
  repo: 'gHashTag/trios',
  columns: [
    { key: 'backlog', title: 'backlog', blurb: 'nobody on it' },
    { key: 'blocked', title: 'blocked', blurb: 'its files are held' },
    { key: 'running', title: 'running', blurb: 'bees on it now' },
    { key: 'review', title: 'review', blurb: 'awaiting judgement' },
    { key: 'done', title: 'done', blurb: 'judged and closed' },
    { key: 'dropped', title: 'dropped', blurb: 'abandoned' },
  ],
  cards: [
    { number: 1, column: 'review', title: 'a' },
    { number: 2, column: 'review', title: 'b' },
    { number: 3, column: 'done', title: 'c' },
  ],
}

describe('her board keeps the columns she declares', () => {
  it('a column she declares but nobody is in still appears, holding zero', async () => {
    vi.stubGlobal('fetch', queenFetch(HER_BOARD))
    const out = await asKeeper()

    expect(out.board.map((c: any) => c.key)).toEqual([
      'backlog',
      'blocked',
      'running',
      'review',
      'done',
      'dropped',
    ])
    const running = out.board.find((c: any) => c.key === 'running')
    // The point of the whole block: present, and honestly zero.
    expect(running).toBeDefined()
    expect(running.count).toBe(0)
    expect(out.board.find((c: any) => c.key === 'review').count).toBe(2)
  })

  it('her order is kept, not the order cards happen to arrive in', async () => {
    /*
     * Counting cards yields insertion order -- review before done, because a
     * review card came first. Her order is the board's reading order, and it is
     * the one both other surfaces show.
     */
    vi.stubGlobal('fetch', queenFetch(HER_BOARD))
    const out = await asKeeper()
    const keys = out.board.map((c: any) => c.key)
    expect(keys.indexOf('backlog')).toBeLessThan(keys.indexOf('review'))
  })

  it('she carries the blurb that says what the column MEANS', async () => {
    vi.stubGlobal('fetch', queenFetch(HER_BOARD))
    const out = await asKeeper()
    expect(out.board.find((c: any) => c.key === 'blocked').blurb).toBe(
      'its files are held'
    )
  })

  /*
   * The inverse guard. If a card sits in a column she did not declare, dropping
   * it would hide real work -- the same disappearance, from the other side.
   */
  it('a column she did not declare still shows up rather than losing its cards', async () => {
    vi.stubGlobal(
      'fetch',
      queenFetch({
        ...HER_BOARD,
        cards: [...HER_BOARD.cards, { number: 9, column: 'quarantine' }],
      })
    )
    const out = await asKeeper()
    const extra = out.board.find((c: any) => c.key === 'quarantine')
    expect(extra).toBeDefined()
    expect(extra.count).toBe(1)
    // Appended, not prepended: her six still lead, in her order.
    expect(out.board[out.board.length - 1].key).toBe('quarantine')
    expect(out.board.map((c: any) => c.key).slice(0, 6)).toEqual([
      'backlog',
      'blocked',
      'running',
      'review',
      'done',
      'dropped',
    ])
  })

  /*
   * And the failure that would make this change WORSE than the bug it fixes: if
   * she ever stops publishing `columns`, mapping over her declaration yields an
   * empty board -- 414 cards rendered as nothing at all. Falling back to the
   * counts is the old behaviour, which is wrong only about empty columns.
   */
  it('if she publishes no columns at all, the cards still produce a board', async () => {
    vi.stubGlobal('fetch', queenFetch({ repo: 'r', cards: HER_BOARD.cards }))
    const out = await asKeeper()
    expect(out.board.map((c: any) => c.key).sort()).toEqual(['done', 'review'])
    expect(out.board.find((c: any) => c.key === 'review').count).toBe(2)
  })

  /*
   * A column she declares without a title would otherwise render as a nameless
   * row: present in the count, impossible to refer to. The key is not pretty,
   * but it is what she calls the column everywhere else.
   */
  it('a column with no title of its own falls back to her key', async () => {
    vi.stubGlobal(
      'fetch',
      queenFetch({
        ...HER_BOARD,
        columns: [{ key: 'running', blurb: 'bees on it now' }],
      })
    )
    const out = await asKeeper()
    expect(out.board.find((c: any) => c.key === 'running').title).toBe(
      'running'
    )
  })

  it('a board with no cards at all is six empty columns, not an empty answer', async () => {
    vi.stubGlobal('fetch', queenFetch({ ...HER_BOARD, cards: [] }))
    const out = await asKeeper()
    expect(out.board).toHaveLength(6)
    expect(out.board.every((c: any) => c.count === 0)).toBe(true)
  })
})

/**
 * HER COUNTERS, CARRIED WITHOUT BEING RENAMED.
 *
 * `/queen/public-board` also carries a `pulse`. Measured twice, ten minutes
 * apart on 2026-09-07:
 *
 *   `lastRoundAt` is EXACTLY `status.lastTick.decidedAt`, and `roundSeconds` is
 *   exactly `scheduler.intervalSeconds` -- both already reported, so repeating
 *   them under second names would invite the reader to think they are different
 *   measurements;
 *
 *   `rounds`, `bees` and `verdicts` did not move at all across two rounds while
 *   she stood in `waiting_for_review`. They are NOT a rate of work.
 *
 * Her own page does not display them, no other surface reads them, and the
 * numbers correlate with nothing else she publishes (`bees: 133` against
 * `workers.capacity: 4`; `verdicts: 145` against 392 dispatches and 414 cards).
 * So they are passed through under HER names, nested, with the caveat in
 * `how_to_read` -- inventing a label for a number nobody can explain is how a
 * panel starts lying.
 */
describe('her own counters are carried, not reinterpreted', () => {
  const WITH_PULSE = {
    ...HER_BOARD,
    pulse: {
      rounds: 1,
      bees: 133,
      verdicts: 145,
      lastRoundAt: '2026-09-07T17:51:18.159Z',
      roundSeconds: 300,
    },
  }

  it('her three counters arrive under her own names', async () => {
    vi.stubGlobal('fetch', queenFetch(WITH_PULSE))
    const out = await asKeeper()
    expect(out.pulse).toEqual({ rounds: 1, bees: 133, verdicts: 145 })
  })

  /*
   * The duplicates are deliberately NOT carried: the tool already reports the
   * same instant as `last_tick_at` and the same interval as
   * `tick_every_seconds`. Two names for one measurement is how a reader ends up
   * comparing a number with itself.
   */
  it('the two fields that merely repeat the status are not carried twice', async () => {
    vi.stubGlobal('fetch', queenFetch(WITH_PULSE))
    const out = await asKeeper()
    expect(out.pulse.lastRoundAt).toBeUndefined()
    expect(out.pulse.roundSeconds).toBeUndefined()
    expect(out.last_tick_at).toBeDefined()
  })

  /*
   * The same rule the whole file is built on, one level down: if she stops
   * publishing the counters, they must be ABSENT. Zeros would read as "she did
   * nothing", which is a claim we would have no basis for.
   */
  it('no pulse at all is absence, never three zeros', async () => {
    vi.stubGlobal('fetch', queenFetch(HER_BOARD))
    const out = await asKeeper()
    expect(out.pulse).toBeUndefined()
  })

  /*
   * The realistic version of the case above: she keeps publishing a `pulse`
   * object but stops putting counters in it. An empty `{}` would render as a
   * present-but-blank panel; absence is the honest report.
   */
  it('a pulse holding only the duplicates counts as no pulse at all', async () => {
    vi.stubGlobal(
      'fetch',
      queenFetch({
        ...HER_BOARD,
        pulse: { lastRoundAt: '2026-09-07T17:51:18.159Z', roundSeconds: 300 },
      })
    )
    const out = await asKeeper()
    expect(out.pulse).toBeUndefined()
  })

  it('a counter that is not a number does not become NaN on the way through', async () => {
    vi.stubGlobal(
      'fetch',
      queenFetch({ ...HER_BOARD, pulse: { rounds: 2, bees: 'много' } })
    )
    const out = await asKeeper()
    expect(out.pulse).toEqual({ rounds: 2 })
  })

  /*
   * `bees` appears twice in this answer -- four worker slots at the top, 133
   * here -- and they are not the same thing. Saying so is the only reason it is
   * safe to show the second one.
   */
  it('the reader is warned that her bees are not the worker slots', async () => {
    vi.stubGlobal('fetch', queenFetch(WITH_PULSE))
    const out = await asKeeper()
    expect(out.how_to_read).toContain('pulse')
    expect(out.bees).toEqual({ capacity: 4, active: 0, idle: 4 })
  })
})

describe('her titles are untrusted input', () => {
  /*
   * Titles come from another system and land in a model's context and,
   * through the report, in a Telegram message. A title that can forge a line
   * break can forge a whole message -- the same reasoning as device names in
   * `notify-sign-in`.
   */
  it('newlines cannot forge a continuation', () => {
    expect(safeTitle('ok\n\nYour code: 12345678')).not.toContain('\n')
  })

  it('a long title is trimmed rather than filling the screen', () => {
    expect(safeTitle('x'.repeat(500)).length).toBeLessThanOrEqual(161)
  })

  it('a missing title becomes an empty string, not "undefined"', () => {
    expect(safeTitle(undefined)).toBe('')
    expect(safeTitle(null)).toBe('')
  })
})
