import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import crypto from 'node:crypto'
import {
  CLUB_DAYS,
  CLUB_USD,
  checkoutConfig,
  clubPrice,
  clubRub,
  forgetCheckoutTablesForTests,
  forgetUsdRubForTests,
  usdRub,
  handleCheckout,
  paymentSignature,
  paymentSignatureBase,
  phpUrlencode,
  resultSignatureOk,
  type CheckoutDeps,
} from './src/agent/course-checkout'
import {
  forgetCourseTablesForTests,
  handleCourse,
  maskEmail,
} from './src/agent/course-access'

/**
 * THE CLUB, BOUGHT ON t27.ai IN ROUBLES BY A READER WITHOUT TELEGRAM.
 *
 * Owner, 2026-10-13: one 30-day period, paid once through Robokassa, the
 * same STEP_PAID key the bot mints; roubles only for Russian-language
 * readers. Pinned here, through the real handler:
 *  - the signature strings, against the two example strings printed on
 *    docs.robokassa.ru ("notifications-and-redirects");
 *  - the price: CLUB_STARS at STAR_PRICE_USD at the CBR rate, ceil to 10,
 *    cached 12 h, last good rate on failure, the bot's fallback otherwise;
 *  - the off switch: no Robokassa value or no key secret = off;
 *  - a non-Russian POST is refused (reason 'lang');
 *  - the return redirect goes only to t27.ai, never where a caller says;
 *  - the order poll hides the key until the order is paid;
 *  - a paid notification is claimed once: a replay mints nothing new;
 *  - a forged signature or a sum other than the one frozen on the order
 *    changes nothing;
 *  - the minted key is accepted by GET /api/course/key;
 *  - payments_v2 is never touched (the fake pool throws on it).
 */

const SIGNING = 'x'.repeat(40) // a test-only signing key, not a secret
const ENV = {
  ROBOKASSA_MERCHANT_LOGIN: 'shop',
  ROBOKASSA_PASSWORD_1: 'password1',
  ROBOKASSA_PASSWORD_2: 'password2',
  SESSION_SIGNING_KEY: SIGNING,
  PUBLIC_URL: 'https://render.example',
} as NodeJS.ProcessEnv

function fakePool() {
  const orders: Array<Record<string, any>> = []
  const learners: Array<Record<string, any>> = []
  let seq = 1_900_000_000
  return {
    orders,
    learners,
    async query(sql: string, params: unknown[] = []) {
      const s = sql.replace(/\s+/g, ' ').trim()
      if (/payments_v2/i.test(s)) throw new Error('payments_v2 is frozen')
      if (/^(CREATE|ALTER)/i.test(s)) return { rows: [] }
      if (/^INSERT INTO course_order/i.test(s)) {
        const o = {
          id: params[0],
          inv_id: seq++,
          email: params[1],
          route: params[2],
          lang: params[3],
          rub: params[4],
          status: 'pending',
          key: null,
          until: null,
          learner_id: null,
        }
        orders.push(o)
        return { rows: [{ inv_id: o.inv_id }] }
      }
      if (/^SELECT route FROM course_order WHERE id/i.test(s))
        return { rows: orders.filter(o => o.id === params[0]) }
      if (/^SELECT status, key, until FROM course_order WHERE id/i.test(s))
        return { rows: orders.filter(o => o.id === params[0]) }
      if (/^SELECT .* FROM course_order WHERE inv_id/i.test(s))
        return { rows: orders.filter(o => o.inv_id === params[0]) }
      if (/^UPDATE course_order SET status = 'paid'/i.test(s)) {
        const o = orders.find(
          x => x.inv_id === params[0] && x.status === 'pending'
        )
        if (!o) return { rows: [] }
        o.status = 'paid'
        return { rows: [o] }
      }
      if (/^INSERT INTO course_learner/i.test(s)) {
        learners.push({
          learner_id: params[0],
          telegram_id: null,
          email: params[1],
        })
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

/** The CBR answer of 2026-10-13 (USD 83.9153), as cbr-xml-daily.ru shapes it. */
const CBR_DAY = {
  Date: '2026-10-13T11:30:00+03:00',
  Valute: { USD: { CharCode: 'USD', Nominal: 1, Value: 83.9153 } },
}
function fakeFetch(answers: Array<unknown | Error>) {
  const calls: string[] = []
  const fn = (async (url: string) => {
    calls.push(String(url))
    const a = answers.length > 1 ? answers.shift() : answers[0]
    if (a instanceof Error) throw a
    return { ok: true, status: 200, json: async () => a } as Response
  }) as unknown as typeof fetch
  return { fn, calls }
}

function harness(env: NodeJS.ProcessEnv = ENV) {
  const pool = fakePool()
  const told: string[] = []
  let body = ''
  const deps: CheckoutDeps = {
    getPool: async () => pool,
    readBody: async () => body,
    tellOwner: async t => void told.push(t),
    now: () => new Date('2026-10-13T12:00:00Z'),
    env,
    fetchRate: fakeFetch([CBR_DAY]).fn,
  }
  const call = (
    method: string,
    url: string,
    b = '',
    ct = 'application/json'
  ) => {
    body = b
    return handleCheckout(
      { method, url, headers: { 'content-type': ct } },
      deps
    )
  }
  return { pool, told, call }
}

const md5 = (s: string) => crypto.createHash('md5').update(s).digest('hex')

beforeEach(() => {
  forgetCheckoutTablesForTests()
  forgetCourseTablesForTests()
  forgetUsdRubForTests()
})

describe('the rouble price is the club Stars price at the CBR rate', () => {
  it('160 dollars; 83.9153 gives 13 430 roubles (ceil to 10)', () => {
    expect(CLUB_USD).toBe(160)
    expect(clubRub(83.9153)).toBe(13430) // 13 426.45 -> 13 430
    expect(clubRub(80)).toBe(12800) // exact stays exact, no float step up
    expect(clubRub(80.0001)).toBe(12810)
    expect(clubRub(100)).toBe(16000)
  })

  it('fetches the CBR once, then serves the cache for 12 hours', async () => {
    const f = fakeFetch([CBR_DAY])
    const t = Date.parse('2026-10-13T12:00:00Z')
    expect(await usdRub(f.fn, t)).toEqual({
      rate: 83.9153,
      date: '2026-10-13',
      source: 'cbr',
    })
    expect((await usdRub(f.fn, t + 11 * 3600_000)).source).toBe('cache')
    expect(f.calls).toEqual(['https://www.cbr-xml-daily.ru/daily_json.js'])
    expect((await usdRub(f.fn, t + 13 * 3600_000)).source).toBe('cbr')
    expect(f.calls).toHaveLength(2)
  })

  it('a failed fetch keeps the last good rate', async () => {
    const t = Date.parse('2026-10-13T12:00:00Z')
    await usdRub(fakeFetch([CBR_DAY]).fn, t)
    const down = fakeFetch([new Error('cbr down')])
    expect(await usdRub(down.fn, t + 13 * 3600_000)).toEqual({
      rate: 83.9153,
      date: '2026-10-13',
      source: 'last-good',
    })
    const junk = fakeFetch([{ Valute: {} }])
    expect((await usdRub(junk.fn, t + 14 * 3600_000)).source).toBe('last-good')
  })

  it('with no rate ever fetched, the bot fallback rate (100)', async () => {
    const down = fakeFetch([new Error('cbr down')])
    expect(await usdRub(down.fn)).toEqual({
      rate: 100,
      date: null,
      source: 'fallback',
    })
    expect((await clubPrice(ENV, down.fn)).rub).toBe(16000)
  })

  it('CLUB_RUB_PRICE is only an override of the computed amount', async () => {
    const f = fakeFetch([CBR_DAY])
    expect((await clubPrice(ENV, f.fn)).rub).toBe(13430)
    expect(
      (await clubPrice({ ...ENV, CLUB_RUB_PRICE: '1500' }, f.fn)).rub
    ).toBe(1500)
    expect((await clubPrice({ ...ENV, CLUB_RUB_PRICE: '9.5' }, f.fn)).rub).toBe(
      13430
    )
  })
})

describe('the signature strings Robokassa documents', () => {
  it('ResultUrl2 example: the URL is URL-encoded in the base string', () => {
    expect(
      paymentSignatureBase({
        login: 'robokassa',
        outSum: '10',
        invId: '1234829',
        resultUrl2: 'https://test.test/robokassa',
        pass1: 'password1',
      })
    ).toBe('robokassa:10:1234829:https%3A%2F%2Ftest.test%2Frobokassa:password1')
  })

  it('Receipt + SuccessUrl2 + FailUrl2 example, character for character', () => {
    const receipt =
      '{"items":[{"name":"\\u0422\\u0435\\u0441\\u0442\\u043e\\u0432\\u044b\\u0439 \\u0442\\u043e\\u0432\\u0430\\u0440","quantity":1,"cost":1,"tax":"vat0","payment_object":"commodity"}]}'
    const p = {
      login: 'robo-demo',
      outSum: '1',
      invId: '',
      receipt,
      successUrl2: 'https://robokassa.com/',
      successUrl2Method: 'GET',
      failUrl2: 'https://www.google.com/',
      failUrl2Method: 'GET',
      pass1: 'password1',
    }
    expect(paymentSignatureBase(p)).toBe(
      'robo-demo:1::%7B%22items%22%3A%5B%7B%22name%22%3A%22%5Cu0422%5Cu0435%5Cu0441%5Cu0442%5Cu043e%5Cu0432%5Cu044b%5Cu0439+%5Cu0442%5Cu043e%5Cu0432%5Cu0430%5Cu0440%22%2C%22quantity%22%3A1%2C%22cost%22%3A1%2C%22tax%22%3A%22vat0%22%2C%22payment_object%22%3A%22commodity%22%7D%5D%7D:https%3A%2F%2Frobokassa.com%2F:GET:https%3A%2F%2Fwww.google.com%2F:GET:password1'
    )
    // MD5 of that string, computed outside this code (macOS `md5`). The
    // docs print a different hash: their example password is a placeholder.
    expect(paymentSignature(p)).toBe('96EC31493BA03AD9D66A069F8519ED54')
  })

  it('phpUrlencode matches PHP for the characters that differ from JS', () => {
    expect(phpUrlencode("a b!'()*~")).toBe('a+b%21%27%28%29%2A%7E')
  })

  it('ResultURL: OutSum:InvId:Password#2 with Shp_ sorted, case-blind', () => {
    const form = {
      OutSum: '100.000000',
      InvId: '450009',
      Shp_oplata: '1',
      Shp_login: 'Vasya',
      SignatureValue: 'D48572ED7AABD3F676BB17A6E96F1DE1',
    }
    expect(
      md5('100.000000:450009:password2:Shp_login=Vasya:Shp_oplata=1')
    ).toBe('d48572ed7aabd3f676bb17a6e96f1de1')
    expect(resultSignatureOk(form, 'password2')).toBe(true)
    expect(
      resultSignatureOk(
        { ...form, SignatureValue: form.SignatureValue.toLowerCase() },
        'password2'
      )
    ).toBe(true)
    expect(resultSignatureOk(form, 'wrong')).toBe(false)
    expect(
      resultSignatureOk({ ...form, OutSum: '1.000000' }, 'password2')
    ).toBe(false)
  })
})

describe('the off switch', () => {
  it('on with every value; off when any one is missing', () => {
    expect(checkoutConfig(ENV).on).toBe(true)
    for (const k of [
      'ROBOKASSA_MERCHANT_LOGIN',
      'ROBOKASSA_PASSWORD_1',
      'ROBOKASSA_PASSWORD_2',
      'SESSION_SIGNING_KEY',
    ])
      expect(checkoutConfig({ ...ENV, [k]: '' }).on, k).toBe(false)
    expect(checkoutConfig({ ...ENV, SESSION_SIGNING_KEY: 'short' }).on).toBe(
      false
    )
  })

  it('MERCHANT_LOGIN is the fallback, as in the bot', () => {
    const env = { ...ENV, ROBOKASSA_MERCHANT_LOGIN: '', MERCHANT_LOGIN: 'old' }
    const c = checkoutConfig(env)
    expect(c.on && c.login).toBe('old')
  })

  it('GET says on/off; POST when off creates nothing', async () => {
    const on = harness()
    expect((await on.call('GET', '/api/course/checkout')).body).toEqual({
      on: true,
      rub: 13430,
      days: CLUB_DAYS,
      stars: 10000,
      usd: 160,
      rate: 83.9153,
      rateDate: '2026-10-13',
    })
    expect(CLUB_DAYS).toBe(30)
    const off = harness({ ...ENV, ROBOKASSA_PASSWORD_2: '' })
    expect((await off.call('GET', '/api/course/checkout')).body).toEqual({
      on: false,
    })
    const r = await off.call(
      'POST',
      '/api/course/checkout',
      JSON.stringify({ email: 'a@b.ru', route: 'intro', lang: 'ru' })
    )
    expect(r.body).toEqual({ ok: false, reason: 'off' })
    expect(off.pool.orders).toHaveLength(0)
  })
})

describe('making an order', () => {
  it('roubles only for a Russian-language reader', async () => {
    const h = harness()
    for (const lang of ['en', undefined, 'RU', 'ru-RU']) {
      const r = await h.call(
        'POST',
        '/api/course/checkout',
        JSON.stringify({ email: 'a@b.ru', route: 'intro', lang })
      )
      expect(r.body, String(lang)).toEqual({ ok: false, reason: 'lang' })
    }
    expect(h.pool.orders).toHaveLength(0)
  })

  it('refuses a bad e-mail and a bad route', async () => {
    const h = harness()
    const post = (b: object) =>
      h.call(
        'POST',
        '/api/course/checkout',
        JSON.stringify({ lang: 'ru', ...b })
      )
    expect((await post({ email: 'nope', route: 'intro' })).body).toEqual({
      ok: false,
      reason: 'bad_email',
    })
    for (const route of ['', 'Intro', '../x', 'a/b', 'x'.repeat(65)])
      expect((await post({ email: 'a@b.ru', route })).body).toEqual({
        ok: false,
        reason: 'bad_route',
      })
    expect(h.pool.orders).toHaveLength(0)
  })

  it('stores the order and returns a signed Robokassa URL', async () => {
    const h = harness()
    const r = await h.call(
      'POST',
      '/api/course/checkout',
      JSON.stringify({ email: ' Ann@Mail.RU ', route: 'intro', lang: 'ru' })
    )
    expect(r.body?.ok).toBe(true)
    const order = String(r.body?.order)
    expect(order).toMatch(/^[A-Za-z0-9_-]{32}$/)
    const u = new URL(String(r.body?.url))
    expect(u.origin + u.pathname).toBe(
      'https://auth.robokassa.ru/Merchant/Index.aspx'
    )
    const q = Object.fromEntries(u.searchParams)
    expect(q.MerchantLogin).toBe('shop')
    expect(q.OutSum).toBe('13430')
    expect(r.body?.rub).toBe(13430)
    expect(q.InvId).toBe('1900000000')
    expect(q.Email).toBe('ann@mail.ru')
    expect(q.Culture).toBe('ru')
    expect(q.IsTest).toBeUndefined()
    const back = `https://render.example/api/course/checkout/return?order=${order}`
    expect(q.SuccessUrl2).toBe(back)
    expect(q.FailUrl2).toBe(back)
    expect(q.SuccessUrl2Method).toBe('GET')
    expect(q.ResultUrl2).toBe(
      'https://render.example/api/course/checkout/result'
    )
    const enc = (s: string) => phpUrlencode(s)
    expect(q.SignatureValue).toBe(
      md5(
        `shop:13430:1900000000:${enc(q.ResultUrl2)}:${enc(back)}:GET:${enc(back)}:GET:password1`
      ).toUpperCase()
    )
    expect(h.pool.orders[0]).toMatchObject({
      rub: 13430,
      route: 'intro',
      status: 'pending',
    })
  })

  it('IsTest=1 only when ROBOKASSA_TEST_MODE is truthy', async () => {
    const h = harness({ ...ENV, ROBOKASSA_TEST_MODE: 'true' })
    const r = await h.call(
      'POST',
      '/api/course/checkout',
      JSON.stringify({ email: 'a@b.ru', route: 'intro', lang: 'ru' })
    )
    expect(new URL(String(r.body?.url)).searchParams.get('IsTest')).toBe('1')
  })
})

async function placed(h: ReturnType<typeof harness>) {
  const r = await h.call(
    'POST',
    '/api/course/checkout',
    JSON.stringify({ email: 'ann@mail.ru', route: 'intro', lang: 'ru' })
  )
  return { order: String(r.body?.order), invId: h.pool.orders.at(-1)!.inv_id }
}

const notice = (invId: number, outSum = '13430.000000', pass2 = 'password2') =>
  new URLSearchParams({
    OutSum: outSum,
    InvId: String(invId),
    SignatureValue: md5(`${outSum}:${invId}:${pass2}`).toUpperCase(),
  }).toString()

const FORM = 'application/x-www-form-urlencoded'

describe('the way back to t27.ai is never an open redirect', () => {
  it('goes to the order own course page', async () => {
    const h = harness()
    const { order } = await placed(h)
    const r = await h.call('GET', `/api/course/checkout/return?order=${order}`)
    expect(r.status).toBe(302)
    expect(r.location).toBe(`https://t27.ai/#/intro?order=${order}`)
  })

  it('an unknown or crafted order goes to the site root, nowhere else', async () => {
    const h = harness()
    for (const o of [
      '',
      'https://evil.example',
      'x'.repeat(40),
      '..%2F..%2Fevil',
    ])
      expect(
        (
          await h.call(
            'GET',
            `/api/course/checkout/return?order=${encodeURIComponent(o)}`
          )
        ).location
      ).toBe('https://t27.ai/')
  })
})

describe('paying: claimed once, key shown only when paid', () => {
  it('pending hides the key; the notification pays, mints, tells once', async () => {
    const h = harness()
    const { order, invId } = await placed(h)
    const poll = () => h.call('GET', `/api/course/checkout/order?id=${order}`)
    expect((await poll()).body).toEqual({ ok: true, status: 'pending' })

    const r = await h.call(
      'POST',
      '/api/course/checkout/result',
      notice(invId),
      FORM
    )
    expect(r.text).toBe(`OK${invId}`)
    const paid = (await poll()).body!
    expect(paid.status).toBe('paid')
    expect(String(paid.key)).toMatch(/\./)
    expect(paid.until).toBe('2026-11-12')
    expect(h.pool.learners).toEqual([
      {
        learner_id: expect.any(String),
        telegram_id: null,
        email: 'ann@mail.ru',
      },
    ])
    expect(h.told).toHaveLength(1)
    expect(h.told[0]).toContain('a***@mail.ru')
    expect(h.told[0]).toContain('13430 RUB')
    expect(h.told[0]).toContain('"intro"')
    expect(h.told[0]).not.toContain('ann@')

    // Robokassa repeats the notification: OK again, nothing minted, nobody told.
    const again = await h.call(
      'POST',
      '/api/course/checkout/result',
      notice(invId),
      FORM
    )
    expect(again.text).toBe(`OK${invId}`)
    expect(h.pool.learners).toHaveLength(1)
    expect(h.told).toHaveLength(1)
    expect((await poll()).body!.key).toBe(paid.key)
  })

  it('the key is the course key: GET /api/course/key accepts it', async () => {
    const h = harness()
    const { order, invId } = await placed(h)
    await h.call('POST', '/api/course/checkout/result', notice(invId), FORM)
    const key = String(
      (await h.call('GET', `/api/course/checkout/order?id=${order}`)).body!.key
    )
    const before = process.env.SESSION_SIGNING_KEY
    process.env.SESSION_SIGNING_KEY = SIGNING
    try {
      const r = await handleCourse(
        { method: 'GET', url: `/api/course/key?k=${encodeURIComponent(key)}` },
        {
          getPool: async () => h.pool,
          isServer: () => false,
          readBody: async () => '',
          club: async () => ({ active: false, daysLeft: 0 }),
        }
      )
      expect(r.body).toMatchObject({ ok: true, step: 2 })
    } finally {
      process.env.SESSION_SIGNING_KEY = before
    }
  })

  it('a forged signature, a wrong sum, an unknown order change nothing', async () => {
    const h = harness()
    const { order, invId } = await placed(h)
    const forged = await h.call(
      'POST',
      '/api/course/checkout/result',
      notice(invId, '13430.000000', 'guess'),
      FORM
    )
    expect(forged.status).toBe(400)
    const cheap = await h.call(
      'POST',
      '/api/course/checkout/result',
      notice(invId, '1.000000'),
      FORM
    )
    expect(cheap.status).toBe(400)
    expect(cheap.text).toBe('bad sum')
    // The rate moved after the order was made: the stored amount still rules,
    // so a correctly signed notice for today's price is refused.
    const moved = await h.call(
      'POST',
      '/api/course/checkout/result',
      notice(invId, '16000.000000'),
      FORM
    )
    expect(moved.status).toBe(400)
    expect(moved.text).toBe('bad sum')
    const unknown = await h.call(
      'POST',
      '/api/course/checkout/result',
      notice(invId + 7),
      FORM
    )
    expect(unknown.status).toBe(404)
    expect(
      (await h.call('GET', `/api/course/checkout/order?id=${order}`)).body
    ).toEqual({ ok: true, status: 'pending' })
    expect(h.told).toHaveLength(0)
    expect(h.pool.learners).toHaveLength(0)
  })

  it('an unknown order id polls as not_found, never as somebody else', async () => {
    const h = harness()
    await placed(h)
    const r = await h.call(
      'GET',
      `/api/course/checkout/order?id=${'A'.repeat(32)}`
    )
    expect(r.status).toBe(404)
    expect(r.body).toEqual({ ok: false, reason: 'not_found' })
  })
})

describe('the owner reads a masked e-mail', () => {
  it('a***@domain', () => {
    expect(maskEmail('ann@mail.ru')).toBe('a***@mail.ru')
    expect(maskEmail('nope')).toBe('***')
  })
})
