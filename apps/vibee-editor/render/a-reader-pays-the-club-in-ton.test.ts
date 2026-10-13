import { describe, it, expect, beforeEach } from 'vitest'
import crypto from 'node:crypto'
import {
  CLUB_USD,
  forgetCheckoutTablesForTests,
  forgetUsdRubForTests,
  handleCheckout,
  type CheckoutDeps,
} from './src/agent/course-checkout'
import {
  TON_RATE_URL,
  forgetTonForTests,
  nanoToTon,
  tonConfig,
  tonLink,
  tonNano,
  tonUsd,
  txPaysTonOrder,
} from './src/agent/course-checkout-ton'
import {
  forgetCourseTablesForTests,
  handleCourse,
} from './src/agent/course-access'

/**
 * THE CLUB, BOUGHT ON t27.ai IN TON BY A READER WITHOUT TELEGRAM.
 *
 * Owner, 2026-10-13: "or with crypto" next to the rouble checkout. Pinned
 * here, through the real handler, with CoinGecko and toncenter faked (no test
 * reaches the network):
 *  - the amount is CLUB_USD / TON-USD rounded UP to 0.1 TON;
 *  - no fresh rate, or no wallet, means the TON offer is off -- never a guess;
 *  - any language may pay in TON;
 *  - the order freezes its nanoton amount and expires after 60 minutes;
 *  - a transfer pays an order only with its code as the comment, at least the
 *    frozen amount, and inside the order's window;
 *  - one transfer never pays two orders (the tx hash is unique);
 *  - an order is claimed once: a second poll mints and tells nothing;
 *  - an unreadable chain leaves the order pending, never "not paid";
 *  - the owner hears the paid-club notice with "TON" and the amount;
 *  - nothing involves any project token.
 */

// Obvious dummies built at runtime; none comes from any env or Railway.
const WALLET = ['UQ', 'T'.repeat(23), 'E'.repeat(23)].join('')
const PAYER = ['EQ', 'P'.repeat(23), 'Y'.repeat(23)].join('')
const SIGNING = 'x'.repeat(40) // a test-only signing key, not a secret
const ENV = {
  TON_WALLET_ADDRESS: WALLET,
  SESSION_SIGNING_KEY: SIGNING,
  PUBLIC_URL: 'https://render.example',
} as NodeJS.ProcessEnv

const T0 = new Date('2026-10-13T12:00:00Z')
const sec = (d: Date | number) =>
  Math.floor((typeof d === 'number' ? d : d.getTime()) / 1000)

/** CoinGecko's simple-price answer: 5.43 dollars per TON. */
const RATE = { 'the-open-network': { usd: 5.43, last_updated_at: sec(T0) } }
// 160 / 5.43 = 29.465... -> 29.5 TON
const NANO = 29_500_000_000n

function fakePool() {
  const orders: Array<Record<string, any>> = []
  const learners: Array<Record<string, any>> = []
  const ddl: string[] = []
  let seq = 1_900_000_000
  return {
    orders,
    learners,
    ddl,
    async query(sql: string, params: unknown[] = []) {
      const s = sql.replace(/\s+/g, ' ').trim()
      if (/payments_v2/i.test(s)) throw new Error('payments_v2 is frozen')
      if (/^(CREATE|ALTER)/i.test(s)) {
        ddl.push(s)
        return { rows: [] }
      }
      if (/^INSERT INTO course_order .*'ton'/i.test(s)) {
        if (orders.some(o => o.ton_code === params[6]))
          throw Object.assign(new Error('dup code'), { code: '23505' })
        orders.push({
          id: params[0],
          inv_id: seq++,
          email: params[1],
          route: params[2],
          lang: params[3],
          rub: 0,
          pay_via: 'ton',
          from_placement: params[4] ?? null,
          source: params[5] ?? null,
          ton_code: params[6],
          ton_nano: params[7],
          created_at: new Date(String(params[8])),
          expires_at: new Date(String(params[9])),
          ton_tx: null,
          status: 'pending',
          key: null,
          until: null,
          learner_id: null,
        })
        return { rows: [] }
      }
      if (/^SELECT .* FROM course_order WHERE inv_id/i.test(s))
        return { rows: orders.filter(o => o.inv_id === params[0]) }
      if (/^SELECT status, key, until\b.* FROM course_order WHERE id/i.test(s))
        return { rows: orders.filter(o => o.id === params[0]) }
      if (/^UPDATE course_order SET status = 'paid'.* ton_tx = \$2/i.test(s)) {
        const o = orders.find(
          x =>
            x.id === params[0] && x.status === 'pending' && x.pay_via === 'ton'
        )
        if (!o) return { rows: [] }
        // The unique index on ton_tx, as Postgres enforces it.
        if (orders.some(x => x !== o && x.ton_tx === params[1]))
          throw Object.assign(new Error('dup tx'), { code: '23505' })
        o.status = 'paid'
        o.ton_tx = params[1]
        return { rows: [o] }
      }
      if (/^INSERT INTO course_learner/i.test(s)) {
        learners.push({ learner_id: params[0], email: params[1] })
        return { rows: [] }
      }
      if (/^UPDATE course_order SET learner_id/i.test(s)) {
        const o = orders.find(x => x.inv_id === params[0] && x.key === null)
        if (!o) return { rows: [] }
        o.learner_id = params[1]
        o.key = params[2]
        o.until = params[3]
        return { rows: [{ inv_id: o.inv_id }] }
      }
      throw new Error(`unexpected SQL: ${s.slice(0, 80)}`)
    },
  }
}

/** A toncenter v2 transaction with an incoming native transfer. */
function chainTx(o: {
  hash: string
  utime: number
  nano: bigint
  comment: string
}) {
  return {
    utime: o.utime,
    transaction_id: { lt: '1', hash: o.hash },
    in_msg: {
      source: PAYER,
      destination: WALLET,
      value: o.nano.toString(),
      msg_data: {
        '@type': 'msg.dataText',
        text: Buffer.from(o.comment, 'utf8').toString('base64'),
      },
      message: o.comment,
    },
  }
}

interface World {
  rate: unknown | Error
  chain: unknown[] | Error
  calls: string[]
}

function fakeTonFetch(w: World): typeof fetch {
  return (async (url: string) => {
    w.calls.push(String(url))
    const answer = String(url).startsWith('https://api.coingecko.com/')
      ? w.rate
      : String(url).includes('toncenter.com/')
        ? w.chain instanceof Error
          ? w.chain
          : { ok: true, result: w.chain }
        : new Error(`unexpected url ${url}`)
    if (answer instanceof Error) throw answer
    return { ok: true, status: 200, json: async () => answer } as Response
  }) as unknown as typeof fetch
}

function harness(env: NodeJS.ProcessEnv = ENV) {
  const pool = fakePool()
  const told: string[] = []
  const world: World = { rate: RATE, chain: [], calls: [] }
  const clock = { now: T0 }
  let body = ''
  const deps: CheckoutDeps = {
    getPool: async () => pool,
    readBody: async () => body,
    tellOwner: async t => void told.push(t),
    now: () => clock.now,
    env,
    fetchRate: (async () => {
      throw new Error('the CBR is not asked on the TON rail')
    }) as unknown as typeof fetch,
    fetchTon: fakeTonFetch(world),
  }
  const call = (method: string, url: string, b = '') => {
    body = b
    return handleCheckout(
      { method, url, headers: { 'content-type': 'application/json' } },
      deps
    )
  }
  const order = async (over: Record<string, unknown> = {}) => {
    const r = await call(
      'POST',
      '/api/course/checkout',
      JSON.stringify({
        email: 'Reader@Example.org',
        route: 'intro',
        lang: 'en',
        pay: 'ton',
        ...over,
      })
    )
    return r.body as any
  }
  const poll = async (id: string) =>
    (await call('GET', `/api/course/checkout/order?id=${id}`)).body as any
  /** Move the clock and drop the shared wallet read, as time would. */
  const at = (d: Date) => {
    clock.now = d
    forgetTonForTests()
    world.rate = RATE
  }
  return { pool, told, world, clock, call, order, poll, at }
}

beforeEach(() => {
  forgetCheckoutTablesForTests()
  forgetCourseTablesForTests()
  forgetUsdRubForTests()
  forgetTonForTests()
})

describe('the TON amount is the club dollar price at the live rate', () => {
  it('rounds UP to 0.1 TON, and an exact amount stays exact', () => {
    expect(CLUB_USD).toBe(160)
    expect(tonNano(160, 5.43)).toBe(NANO) // 29.465 -> 29.5
    expect(tonNano(160, 3.2)).toBe(50_000_000_000n) // exactly 50.0
    expect(tonNano(160, 3.1999)).toBe(50_100_000_000n) // 50.0016 -> 50.1
    expect(tonNano(160, 1.6)).toBe(100_000_000_000n) // float noise never adds a step
    expect(nanoToTon(NANO)).toBe(29.5)
  })

  it('reads CoinGecko once, then serves the cache for 10 minutes', async () => {
    const w: World = { rate: RATE, chain: [], calls: [] }
    const f = fakeTonFetch(w)
    const t = T0.getTime()
    expect(await tonUsd(f, t)).toEqual({
      rate: 5.43,
      date: T0.toISOString(),
      source: 'coingecko',
    })
    expect((await tonUsd(f, t + 9 * 60_000))?.source).toBe('cache')
    expect(w.calls).toEqual([TON_RATE_URL])
    expect((await tonUsd(f, t + 11 * 60_000))?.source).toBe('coingecko')
    expect(w.calls).toHaveLength(2)
  })

  it('no rate means no rate: never a guess, and no stale one past 10 minutes', async () => {
    const t = T0.getTime()
    const down: World = { rate: new Error('down'), chain: [], calls: [] }
    expect(await tonUsd(fakeTonFetch(down), t)).toBeNull()
    await tonUsd(fakeTonFetch({ rate: RATE, chain: [], calls: [] }), t)
    expect(await tonUsd(fakeTonFetch(down), t + 11 * 60_000)).toBeNull()
    for (const bad of [{}, { 'the-open-network': { usd: 0 } }, { x: 1 }])
      expect(
        await tonUsd(
          fakeTonFetch({ rate: bad, chain: [], calls: [] }),
          t + 30 * 60_000
        )
      ).toBeNull()
  })
})

describe('GET /api/course/checkout carries the TON offer', () => {
  it('on with the wallet and a fresh rate', async () => {
    const h = harness()
    const r = await h.call('GET', '/api/course/checkout')
    // Robokassa is not configured here: the rouble side is off, TON is on.
    expect(r.body).toEqual({
      on: false,
      ton: {
        on: true,
        amount: 29.5,
        address: WALLET,
        rate: 5.43,
        rateDate: T0.toISOString(),
      },
    })
  })

  it('off with no rate', async () => {
    const h = harness()
    h.world.rate = new Error('coingecko down')
    expect((await h.call('GET', '/api/course/checkout')).body).toEqual({
      on: false,
      ton: { on: false },
    })
  })

  it('off with no wallet, or no key secret, and then asks no rate at all', async () => {
    for (const env of [
      { ...ENV, TON_WALLET_ADDRESS: '' },
      { ...ENV, TON_WALLET_ADDRESS: 'not-an-address' },
      { ...ENV, SESSION_SIGNING_KEY: '' },
    ]) {
      const h = harness(env)
      expect((await h.call('GET', '/api/course/checkout')).body).toEqual({
        on: false,
        ton: { on: false },
      })
      expect(h.world.calls).toEqual([])
    }
  })

  it('the wallet is the bot variable; testnet only when asked', () => {
    const c = tonConfig(ENV)
    expect(c.on && c.api).toBe('https://toncenter.com/api/v2')
    const t = tonConfig({ ...ENV, TON_NETWORK: 'testnet' })
    expect(t.on && t.api).toBe('https://testnet.toncenter.com/api/v2')
  })
})

describe("POST with pay:'ton' makes a TON order", () => {
  it('any language; the amount and the expiry are frozen on the row', async () => {
    const h = harness()
    for (const lang of ['en', 'ru', 'de', undefined]) {
      const b = await h.order({ lang })
      expect(b.ok, String(lang)).toBe(true)
    }
    const b = await h.order({ from: 'blog:club', source: 'x' })
    const o = h.pool.orders.find(x => x.id === b.order)!
    expect(b).toEqual({
      ok: true,
      order: o.id,
      ton: {
        address: WALLET,
        amount: 29.5,
        nano: '29500000000',
        comment: o.ton_code,
        link: `ton://transfer/${WALLET}?amount=29500000000&text=${o.ton_code}`,
        expiresAt: '2026-10-13T13:00:00.000Z',
      },
    })
    expect(o.ton_code).toMatch(/^T27-[A-HJKMNP-Z2-9]{8}$/)
    expect(o).toMatchObject({
      email: 'reader@example.org',
      route: 'intro',
      pay_via: 'ton',
      rub: 0,
      ton_nano: '29500000000',
      from_placement: 'blog:club',
      source: 'x',
      status: 'pending',
    })
    expect(o.expires_at.getTime() - o.created_at.getTime()).toBe(60 * 60_000)
    // Each order its own code.
    expect(new Set(h.pool.orders.map(x => x.ton_code)).size).toBe(5)
  })

  it('the deeplink encodes the comment', () => {
    expect(tonLink(WALLET, 1n, 'a b')).toBe(
      `ton://transfer/${WALLET}?amount=1&text=a%20b`
    )
  })

  it('no rate, no order; no wallet, no order; bad input, no order', async () => {
    const h = harness()
    h.world.rate = new Error('down')
    expect(await h.order()).toEqual({ ok: false, reason: 'no_rate' })
    const off = harness({ ...ENV, TON_WALLET_ADDRESS: '' })
    expect(await off.order()).toEqual({ ok: false, reason: 'off' })
    const ok = harness()
    expect(await ok.order({ email: 'nope' })).toEqual({
      ok: false,
      reason: 'bad_email',
    })
    expect(await ok.order({ route: '../x' })).toEqual({
      ok: false,
      reason: 'bad_route',
    })
    expect([...h.pool.orders, ...off.pool.orders, ...ok.pool.orders]).toEqual(
      []
    )
  })

  it('the code and the tx hash are each unique in the table', async () => {
    const h = harness()
    await h.order()
    const ddl = h.pool.ddl.join('\n')
    expect(ddl).toMatch(
      /UNIQUE INDEX IF NOT EXISTS \w+ ON course_order \(ton_code\)/
    )
    expect(ddl).toMatch(
      /UNIQUE INDEX IF NOT EXISTS \w+ ON course_order \(ton_tx\)/
    )
  })
})

describe('the poll reads the chain and claims a paid TON order once', () => {
  const after = (min: number) => new Date(T0.getTime() + min * 60_000)

  it('pending with nothing on the chain, and it re-shows the transfer', async () => {
    const h = harness()
    const b = await h.order()
    const p = await h.poll(b.order)
    expect(p).toEqual({ ok: true, status: 'pending', ton: b.ton })
    const read = h.world.calls.find(u => u.includes('toncenter'))!
    expect(read).toBe(
      `https://toncenter.com/api/v2/getTransactions?address=${WALLET}&limit=50&archival=true`
    )
  })

  it('pays on the right comment and amount: key minted, owner told with TON', async () => {
    const h = harness()
    const b = await h.order({ from: 'blog:club' })
    h.at(after(5))
    h.world.chain = [
      chainTx({
        hash: 'H1',
        utime: sec(after(4)),
        nano: NANO,
        comment: b.ton.comment,
      }),
    ]
    const p = await h.poll(b.order)
    expect(p.status).toBe('paid')
    expect(p.until).toBe('2026-11-12')
    expect(h.pool.orders[0].ton_tx).toBe('H1')
    expect(h.told).toEqual([
      `Course checkout: r***@example.org paid 29.5 TON on t27.ai for "intro" (via blog:club), paid key valid until 2026-11-12.`,
    ])
    // The key is the same paid key the site checks (step 2, STEP_PAID).
    const before = process.env.SESSION_SIGNING_KEY
    process.env.SESSION_SIGNING_KEY = SIGNING
    try {
      const k = await handleCourse(
        {
          method: 'GET',
          url: `/api/course/key?k=${encodeURIComponent(p.key)}`,
        },
        {
          getPool: async () => h.pool,
          isServer: () => false,
          readBody: async () => '',
          club: async () => ({ active: false, daysLeft: 0 }),
        }
      )
      expect(k.body).toMatchObject({ ok: true, step: 2 })
    } finally {
      process.env.SESSION_SIGNING_KEY = before
    }
  })

  it('a comment typed in lower case still matches; overpaying still pays', async () => {
    const h = harness()
    const b = await h.order()
    h.at(after(1))
    h.world.chain = [
      chainTx({
        hash: 'H2',
        utime: sec(after(1)),
        nano: NANO + 1n,
        comment: ` ${b.ton.comment.toLowerCase()} `,
      }),
    ]
    expect((await h.poll(b.order)).status).toBe('paid')
  })

  it('underpayment pays nothing', async () => {
    const h = harness()
    const b = await h.order()
    h.at(after(2))
    h.world.chain = [
      chainTx({
        hash: 'H3',
        utime: sec(after(1)),
        nano: NANO - 1n,
        comment: b.ton.comment,
      }),
    ]
    expect((await h.poll(b.order)).status).toBe('pending')
    expect(h.pool.learners).toEqual([])
    expect(h.told).toEqual([])
  })

  it('a wrong comment, or none, pays nothing', async () => {
    const h = harness()
    const b = await h.order()
    h.at(after(2))
    h.world.chain = [
      chainTx({
        hash: 'H4',
        utime: sec(after(1)),
        nano: NANO,
        comment: 'T27-AAAAAAAA',
      }),
      chainTx({ hash: 'H5', utime: sec(after(1)), nano: NANO, comment: '' }),
      chainTx({
        hash: 'H6',
        utime: sec(after(1)),
        nano: NANO,
        comment: b.order,
      }),
    ]
    expect((await h.poll(b.order)).status).toBe('pending')
    expect(h.pool.orders[0].key).toBeNull()
  })

  it('a transfer older than the order pays nothing', async () => {
    const h = harness()
    const b = await h.order()
    h.at(after(2))
    h.world.chain = [
      chainTx({
        hash: 'H7',
        utime: sec(T0) - 1,
        nano: NANO,
        comment: b.ton.comment,
      }),
    ]
    expect((await h.poll(b.order)).status).toBe('pending')
  })

  it('expired after 60 minutes with no paying transfer; a late one does not pay', async () => {
    const h = harness()
    const b = await h.order()
    h.at(after(61))
    expect(await h.poll(b.order)).toEqual({ ok: true, status: 'expired' })
    h.at(after(62))
    h.world.chain = [
      chainTx({
        hash: 'H8',
        utime: sec(after(61)),
        nano: NANO,
        comment: b.ton.comment,
      }),
    ]
    expect(await h.poll(b.order)).toEqual({ ok: true, status: 'expired' })
    expect(h.pool.orders[0].status).toBe('pending')
    expect(h.told).toEqual([])
    // Long past the window the chain is not even read.
    h.at(after(120))
    const before = h.world.calls.length
    expect(await h.poll(b.order)).toEqual({ ok: true, status: 'expired' })
    expect(h.world.calls.length).toBe(before)
  })

  it('a transfer sent inside the window and seen just after it still pays', async () => {
    const h = harness()
    const b = await h.order()
    h.at(after(63))
    h.world.chain = [
      chainTx({
        hash: 'H9',
        utime: sec(after(59)),
        nano: NANO,
        comment: b.ton.comment,
      }),
    ]
    expect((await h.poll(b.order)).status).toBe('paid')
  })

  it('one transfer never pays two orders: the tx hash is unique', async () => {
    const h = harness()
    const a = await h.order()
    const b = await h.order()
    h.at(after(3))
    h.world.chain = [
      chainTx({
        hash: 'SAME',
        utime: sec(after(2)),
        nano: NANO,
        comment: a.ton.comment,
      }),
    ]
    expect((await h.poll(a.order)).status).toBe('paid')
    // A forged replay: the same hash now carrying the second order's code.
    h.at(after(4))
    h.world.chain = [
      chainTx({
        hash: 'SAME',
        utime: sec(after(2)),
        nano: NANO,
        comment: b.ton.comment,
      }),
    ]
    expect((await h.poll(b.order)).status).toBe('pending')
    expect(h.pool.orders[1]).toMatchObject({
      status: 'pending',
      key: null,
      ton_tx: null,
    })
    expect(h.pool.learners).toHaveLength(1)
    expect(h.told).toHaveLength(1)
  })

  it('claimed once: repeated and concurrent polls mint one key and tell once', async () => {
    const h = harness()
    const b = await h.order()
    h.at(after(3))
    h.world.chain = [
      chainTx({
        hash: 'H10',
        utime: sec(after(2)),
        nano: NANO,
        comment: b.ton.comment,
      }),
    ]
    const [p1, p2] = await Promise.all([h.poll(b.order), h.poll(b.order)])
    const p3 = await h.poll(b.order)
    expect([p1.status, p2.status, p3.status]).toEqual(['paid', 'paid', 'paid'])
    expect(new Set([p1.key, p2.key, p3.key]).size).toBe(1)
    expect(h.pool.learners).toHaveLength(1)
    expect(h.told).toHaveLength(1)
  })

  it('an unreadable chain is not "nobody paid": the order stays pending', async () => {
    const h = harness()
    const b = await h.order()
    h.at(after(30))
    h.world.chain = new Error('HTTP 429 from toncenter')
    expect((await h.poll(b.order)).status).toBe('pending')
    h.at(after(31))
    h.world.chain = { ok: false, error: 'lt not in db' } as unknown as unknown[]
    expect((await h.poll(b.order)).status).toBe('pending')
  })

  it('the match rule on its own', () => {
    const order = {
      code: 'T27-ABCDEFGH',
      nano: NANO,
      createdMs: T0.getTime(),
      expiresMs: T0.getTime() + 3600_000,
    }
    const tx = {
      hash: 'h',
      utime: sec(T0),
      nano: NANO,
      comment: 'T27-ABCDEFGH',
    }
    expect(txPaysTonOrder(tx, order)).toBe(true)
    expect(txPaysTonOrder({ ...tx, utime: sec(T0) - 1 }, order)).toBe(false)
    expect(txPaysTonOrder({ ...tx, utime: sec(T0) + 3601 }, order)).toBe(false)
    expect(txPaysTonOrder({ ...tx, nano: NANO - 1n }, order)).toBe(false)
    expect(txPaysTonOrder({ ...tx, comment: 'T27-ABCDEFGX' }, order)).toBe(
      false
    )
  })
})

describe('the rails stay apart', () => {
  it('a signed Robokassa notice never settles a TON order', async () => {
    // Dummy Robokassa values built at runtime; never taken from any env.
    const P2 = ['test', 'only', 'p2'].join('-')
    const h = harness({
      ...ENV,
      ROBOKASSA_MERCHANT_LOGIN: 'shop',
      ROBOKASSA_PASSWORD_1: ['test', 'only', 'p1'].join('-'),
      ROBOKASSA_PASSWORD_2: P2,
    })
    await h.order()
    const o = h.pool.orders[0]
    const sig = crypto
      .createHash('md5')
      .update(`0:${o.inv_id}:${P2}`)
      .digest('hex')
    const r = await h.call(
      'GET',
      `/api/course/checkout/result?OutSum=0&InvId=${o.inv_id}&SignatureValue=${sig}`
    )
    expect(r.status).toBe(404)
    expect(o).toMatchObject({ status: 'pending', key: null })
    expect(h.told).toEqual([])
  })
})

describe('no project token is involved', () => {
  it('no TRI anywhere in the TON answers or the owner notice', async () => {
    const h = harness()
    const g = await h.call('GET', '/api/course/checkout')
    const b = await h.order()
    h.at(new Date(T0.getTime() + 60_000))
    h.world.chain = [
      chainTx({
        hash: 'H11',
        utime: sec(T0) + 30,
        nano: NANO,
        comment: b.ton.comment,
      }),
    ]
    const p = await h.poll(b.order)
    const all = JSON.stringify([g.body, b, { ...p, key: '' }, h.told])
    expect(all).not.toMatch(/\bTRI\b|\$TRI|jetton/i)
  })
})
