/**
 * THE BOARD REFUSES BEFORE IT READS, AND A FILTER ONLY EVER NARROWS.
 *
 * `hive_board` puts two lanes in one answer: the Queen's public tasks, which
 * are the same board for everybody signed in, and the caller's own clients,
 * which come out of the one `users` table shared by sixteen bot owners. The
 * second lane is the one that can leak, so this file is about that lane.
 *
 * Written the way `crm-owner-gate.test.ts` is written, and for the same
 * reason: the pool handed to the tool THROWS on any query, and every fetch to
 * the people tables is recorded. A tool that read first and checked afterwards
 * would surface here as a database error or as a recorded read, not as a
 * refusal -- and the assertions tell the two apart.
 *
 * Nothing is mocked out of `hive/roles.ts`. The rule under test IS that rule,
 * and a test that stubs it would prove only that the stub agrees with itself.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const KEEPER = '100000001'
const OWNER = '200000002'
const BEE = '300000003'
const OTHER_PERSON = '900000042'

process.env.HIVE_KEEPERS = KEEPER
// keepers() falls back to this one, so a value left over from another file
// would quietly promote somebody here.
process.env.OWNER_TELEGRAM_ID = ''
process.env.SUPABASE_URL = 'https://db.example'
process.env.SUPABASE_SERVICE_KEY = 'service-key'

import { HIVE_BOARD_TOOLS } from './src/agent/hive-board-tool'

const tool = HIVE_BOARD_TOOLS.find(t => t.name === 'hive_board')!

/** Whose bots are whose, as `avatars` would answer. */
const OWNERSHIP: Record<string, string[]> = {
  [OWNER]: ['bot_mine', 'bot_also_mine'],
  [BEE]: [],
}

/** Somebody else's bot, and somebody else's person on it. */
const FOREIGN_BOT = 'bot_of_another_owner'

const BOARD = {
  repo: 'gHashTag/t27',
  columns: [
    { key: 'backlog', title: 'backlog', blurb: 'declared a boundary' },
    { key: 'review', title: 'in review', blurb: 'holds its boundary' },
  ],
  cards: [
    {
      number: 4489,
      title: 'Nothing builds the explorer',
      column: 'review',
      criteria: 3,
    },
    {
      number: 4490,
      title: 'A second card in review',
      column: 'review',
      criteria: 0,
    },
    {
      number: 4491,
      title: 'One in the backlog',
      column: 'backlog',
      criteria: 1,
    },
  ],
}

const PEOPLE = [
  {
    telegram_id: '500000001',
    username: 'mine_one',
    first_name: 'Первый',
    bot_name: 'bot_mine',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-19T00:00:00Z',
    language_code: 'ru',
  },
  {
    telegram_id: '500000002',
    username: 'mine_two',
    first_name: 'Второй',
    bot_name: 'bot_also_mine',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-10T00:00:00Z',
    language_code: 'ru',
  },
]

/*
 * The two refusals, built from strings rather than written as regex literals.
 *
 * The repository's guard allows Cyrillic inside string literals and nowhere
 * else, and a regex literal is not a string literal -- the same reason the
 * LEAK pattern in crm-owner-gate.test.ts is assembled with `new RegExp`.
 */
const NEEDS_IDENTITY = new RegExp('личности')
const NOT_YOURS = new RegExp('не числится')

let fetched: string[] = []

const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
})

/**
 * The outside world, recorded.
 *
 * `avatars` is the gate's OWN lookup -- keyed by the caller id that was
 * already proved, able to answer about nobody else -- so it is allowed and
 * not counted as a read of people, exactly as `tg_sessions` is allowed in
 * the CRM gate. `users` and `payments_v2` are the people; every hit on them
 * is a fact this test cares about.
 */
function stubFetch(
  opts: { avatarsStatus?: number; users?: unknown[]; payers?: string[] } = {}
) {
  vi.stubGlobal('fetch', async (input: unknown) => {
    const url = String(input)
    fetched.push(url)
    if (url.includes('/rest/v1/avatars')) {
      if (opts.avatarsStatus && opts.avatarsStatus !== 200) {
        return {
          ok: false,
          status: opts.avatarsStatus,
          json: async () => [],
          text: async () => 'avatars is down',
        }
      }
      const who = url.match(/telegram_id=eq\.(\d+)/)?.[1] ?? ''
      return ok((OWNERSHIP[who] ?? []).map(b => ({ bot_name: b })))
    }
    if (url.includes('/rest/v1/users')) return ok(opts.users ?? PEOPLE)
    if (url.includes('/rest/v1/payments_v2')) {
      return ok((opts.payers ?? []).map(id => ({ telegram_id: id })))
    }
    if (url.includes('/queen/public-board')) return ok(BOARD)
    throw new Error(`unexpected fetch: ${url}`)
  })
}

/** Every request that touched the people tables. */
const peopleReads = () =>
  fetched.filter(u => /rest\/v1\/(users|payments_v2)/.test(u))

let touched = 0
const hostilePool = {
  query: async () => {
    touched += 1
    throw new Error('THE POOL WAS TOUCHED BEFORE THE CALLER WAS CHECKED')
  },
  connect: async () => {
    touched += 1
    throw new Error('THE POOL WAS TOUCHED BEFORE THE CALLER WAS CHECKED')
  },
}

/** A pool that answers, for the cases that are supposed to get that far. */
const friendlyPool = {
  query: async (sql: string) => {
    touched += 1
    if (/FROM crm_touches/.test(String(sql))) {
      return {
        rows: [
          { lead_id: '500000001', kind: 'replied', at: '2026-09-18T00:00:00Z' },
        ],
      }
    }
    return { rows: [] }
  },
}

const call = (args: Record<string, unknown>, ctx: unknown) =>
  (tool as { handler: (a: any, c: any) => Promise<any> }).handler(args, ctx)

beforeEach(() => {
  touched = 0
  fetched = []
  stubFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('R5 -- the refusal comes before the read', () => {
  it('refuses a caller with no proved identity and touches nothing at all', async () => {
    let message = ''
    try {
      await call({}, { telegramId: '', pool: hostilePool as never })
      throw new Error('the board answered a caller with no identity')
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toMatch(NEEDS_IDENTITY)
    expect(touched, 'the database was queried before the refusal').toBe(0)
    expect(fetched, 'something was fetched before the refusal').toEqual([])
  })

  it('refuses a missing context the same way', async () => {
    await expect(call({}, undefined)).rejects.toThrow(NEEDS_IDENTITY)
    expect(touched).toBe(0)
    expect(fetched).toEqual([])
  })

  it('refuses a foreign bot without reading, even when the database works', async () => {
    // The gate must not depend on the database being healthy or broken: a
    // refusal that only happens when a query fails is not a refusal.
    await expect(
      call(
        { client: FOREIGN_BOT },
        { telegramId: OWNER, pool: friendlyPool as never }
      )
    ).rejects.toThrow(NOT_YOURS)
    expect(peopleReads()).toEqual([])
    expect(touched).toBe(0)
  })
})

describe('R1 -- a filter narrows, never widens', () => {
  it('refuses a bot the caller does not own', async () => {
    await expect(
      call(
        { client: FOREIGN_BOT },
        { telegramId: OWNER, pool: hostilePool as never }
      )
    ).rejects.toThrow(NOT_YOURS)
    expect(peopleReads(), 'a foreign bot reached the people tables').toEqual([])
    expect(touched).toBe(0)
  })

  it('refuses a bee who names any bot at all', async () => {
    await expect(
      call(
        { client: 'bot_mine' },
        { telegramId: BEE, pool: hostilePool as never }
      )
    ).rejects.toThrow(NOT_YOURS)
    expect(peopleReads()).toEqual([])
    expect(touched).toBe(0)
  })

  it('narrows an owner to one of their own bots, in the query itself', async () => {
    const out = await call(
      { client: 'bot_mine' },
      { telegramId: OWNER, pool: friendlyPool as never }
    )
    expect(out.scope.role).toBe('owner')
    expect(out.scope.bots).toEqual(['bot_mine'])
    expect(out.filter.applied).toBe('bot_mine')

    const users = peopleReads().filter(u => u.includes('/users'))
    expect(users.length).toBe(1)
    // The narrowing has to reach the database, not merely the answer: a
    // filter applied after the read is a read of everything.
    expect(decodeURIComponent(users[0])).toContain('bot_name=in.("bot_mine")')
    expect(decodeURIComponent(users[0])).not.toContain('bot_also_mine')
    expect(out.clients.cards.every((c: any) => c.bot === 'bot_mine')).toBe(true)
  })

  it('narrows a keeper too -- a filter never returns the farm', async () => {
    const out = await call(
      { client: FOREIGN_BOT },
      { telegramId: KEEPER, pool: friendlyPool as never }
    )
    expect(out.scope.role).toBe('keeper')
    // A keeper may look at any bot, but having named one they get THAT one.
    expect(out.scope.bots).toEqual([FOREIGN_BOT])
    const users = peopleReads().filter(u => u.includes('/users'))
    expect(decodeURIComponent(users[0])).toContain(
      `bot_name=in.("${FOREIGN_BOT}")`
    )
  })
})

describe('R2 -- a bee sees the shared lane and nothing of other people', () => {
  it('returns an empty clients lane with no count of anybody in it', async () => {
    const out = await call({}, { telegramId: BEE, pool: hostilePool as never })

    expect(out.scope.role).toBe('bee')
    expect(out.scope.bots).toEqual([])
    /*
     * Serialised whole rather than checked field by field: the rule is "not
     * even an aggregate", so the assertion has to fail if any total, any
     * zeroed column or any "2380 platform-wide" is ever added beside them.
     */
    expect(JSON.stringify(out.clients)).toBe('{"columns":[],"cards":[]}')
    expect(out.filter.available).toEqual([])
    expect(out.filter.applied).toBe(null)

    expect(peopleReads(), 'a bee reached the people tables').toEqual([])
    expect(touched, 'a bee reached the database').toBe(0)
  })

  it('still gets the shared tasks lane, because that half is public', async () => {
    const out = await call({}, { telegramId: BEE, pool: hostilePool as never })
    expect(out.tasks.reachable).toBe(true)
    expect(out.tasks.repo).toBe('gHashTag/t27')
    expect(out.tasks.columns.map((c: any) => c.key)).toEqual([
      'backlog',
      'review',
    ])
    // Her counts are over her whole board and name no person.
    expect(out.tasks.columns.find((c: any) => c.key === 'review').count).toBe(2)
    expect(out.tasks.cards.map((c: any) => c.number)).toEqual([
      4489, 4490, 4491,
    ])
    expect(out.tasks.cards[0].criteria).toBe(3)
  })
})

describe('R3 -- identity comes from the context and from nowhere else', () => {
  it('ignores an id in the arguments', async () => {
    const out = await call(
      {
        // None of these are parameters of the tool. They are passed anyway,
        // because the failure being tested is a handler that reads one.
        telegram_id: KEEPER,
        telegramId: KEEPER,
        who: KEEPER,
        role: 'keeper',
      },
      { telegramId: BEE, pool: hostilePool as never }
    )
    expect(out.scope.role).toBe('bee')
    expect(out.scope.bots).toEqual([])
    expect(JSON.stringify(out.clients)).toBe('{"columns":[],"cards":[]}')
    expect(peopleReads()).toEqual([])
    expect(touched).toBe(0)
  })

  it('does not let an argument turn an owner into the farm', async () => {
    const out = await call(
      { client: '', telegram_id: KEEPER },
      { telegramId: OWNER, pool: friendlyPool as never }
    )
    expect(out.scope.role).toBe('owner')
    expect(out.scope.bots).toEqual(['bot_mine', 'bot_also_mine'])
    const users = peopleReads().filter(u => u.includes('/users'))
    expect(decodeURIComponent(users[0])).toContain(
      'bot_name=in.("bot_mine","bot_also_mine")'
    )
  })
})

describe('R4 -- fail closed when ownership cannot be established', () => {
  it('treats a broken avatars lookup as "no bots", never as "everything"', async () => {
    vi.unstubAllGlobals()
    stubFetch({ avatarsStatus: 500 })

    const out = await call(
      {},
      { telegramId: OWNER, pool: hostilePool as never }
    )
    expect(out.scope.role).toBe('bee')
    expect(out.scope.bots).toEqual([])
    expect(JSON.stringify(out.clients)).toBe('{"columns":[],"cards":[]}')
    expect(out.filter.available).toEqual([])
    expect(
      peopleReads(),
      'a database hiccup became a read of everybody'
    ).toEqual([])
    expect(touched).toBe(0)
  })
})

describe('the owner sees their own board', () => {
  it('builds the clients lane out of the stages the CRM derives', async () => {
    const out = await call(
      {},
      { telegramId: OWNER, pool: friendlyPool as never }
    )

    /*
     * The column vocabulary is `crm-stages.ts`, not a list invented here: a
     * column nothing can ever derive is a column nobody will ever appear in.
     */
    expect(out.clients.columns.map((c: any) => c.key).sort()).toEqual(
      [
        'client',
        'later',
        'new',
        'refused',
        'talking',
        'winback',
        'written',
      ].sort()
    )

    const byId = Object.fromEntries(
      out.clients.cards.map((c: any) => [c.id, c])
    )
    // The one with a `replied` touch answered us, so the ball is ours.
    expect(byId['500000001'].stage).toBe('talking')
    expect(byId['500000001'].waiting_for_reply).toBe(true)
    expect(byId['500000001'].last_touch_at).toBe('2026-09-18T00:00:00Z')
    // The one with no touch and no payment has never been approached.
    expect(byId['500000002'].stage).toBe('new')
    expect(byId['500000002'].paid).toBe(false)

    expect(
      out.clients.columns.find((c: any) => c.key === 'talking').count
    ).toBe(1)
    expect(out.clients.columns.find((c: any) => c.key === 'new').count).toBe(1)

    // Their own bots are offered as filters, including one with nobody on it:
    // a zero about your own bot is a fact about your bot.
    expect(out.filter.available.map((f: any) => f.key)).toEqual([
      'bot_mine',
      'bot_also_mine',
    ])
    expect(out.filter.available.every((f: any) => f.count === 1)).toBe(true)
  })

  it('counts a payment as a client, and says so in the money column', async () => {
    vi.unstubAllGlobals()
    stubFetch({ payers: ['500000002'] })
    const out = await call(
      {},
      { telegramId: OWNER, pool: friendlyPool as never }
    )
    const byId = Object.fromEntries(
      out.clients.cards.map((c: any) => [c.id, c])
    )
    expect(byId['500000002'].stage).toBe('client')
    expect(byId['500000002'].paid).toBe(true)
    expect(out.clients.columns.find((c: any) => c.key === 'client').count).toBe(
      1
    )
    // A payer is served, not chased.
    expect(byId['500000002'].waiting_for_reply).toBe(false)
  })

  it('never carries another owner person into the answer', async () => {
    // The shared table really does hold other people; the query is what keeps
    // them out, so the fake answers with the scope it was asked for.
    vi.unstubAllGlobals()
    stubFetch({
      users: [
        ...PEOPLE,
        {
          telegram_id: OTHER_PERSON,
          username: 'not_yours',
          first_name: 'Чужой',
          bot_name: FOREIGN_BOT,
          created_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-01T00:00:00Z',
          language_code: 'ru',
        },
      ],
    })
    const out = await call(
      { client: 'bot_mine' },
      { telegramId: OWNER, pool: friendlyPool as never }
    )
    // Everything the tool shows is filtered to the asked-for bot even when the
    // database answers with more than it was asked for.
    expect(JSON.stringify(out)).not.toContain(OTHER_PERSON)
    expect(JSON.stringify(out)).not.toContain(FOREIGN_BOT)
  })
})

describe('the keeper, and only the keeper, gets the farm', () => {
  it('reads without a bot filter and says the scope is the whole farm', async () => {
    const out = await call(
      {},
      { telegramId: KEEPER, pool: friendlyPool as never }
    )
    expect(out.scope.role).toBe('keeper')
    expect(out.scope.bots).toBe(null)
    const users = peopleReads().filter(u => u.includes('/users'))
    expect(decodeURIComponent(users[0])).not.toContain('bot_name=in.')
    expect(out.clients.cards.length).toBe(2)
  })
})
