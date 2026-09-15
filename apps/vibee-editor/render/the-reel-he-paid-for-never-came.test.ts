import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * MEASURED ON A LIVE HUMAN, 2026-09-15, lead 1900592465.
 *
 * He asked for a reel. Then, from the production tables:
 *
 *   token_ledger  - three reel_render charges of 2 tokens (19:08, 19:10, 19:12);
 *   agent_renders - three starts (12:09:36Z, 12:10:43Z, 12:12:57Z);
 *   /render/...   - 45618346 failed: "No `src` was passed to <OffthreadVideo>.",
 *                   e0970f9a and 0eba498a completed;
 *   the two finished files are BYTE-IDENTICAL: sha256 79741cd2...,
 *                   1 426 269 bytes, 1080x1920, 30.000 s, 900 frames.
 *
 * Result: 12 tokens paid, zero files received - the last message in the
 * conversation is the bot apologising for the charges. Three separate defects
 * in one order:
 *
 *   1) a failed render did NOT refund (the only paid tool in tools.ts with no
 *      refund on a provider failure - every neighbour of it refunds);
 *   2) a repeat of the same work charged a second time for the same file;
 *   3) the finished video went only to the internal group: the /render/template
 *      route did not know the buyer, because reel_render never named him, and
 *      buyer delivery had been fixed on the NEIGHBOURING route only.
 *
 * The tests drive the real tool handler: the provider is stubbed, the database
 * is a recording journal of queries. Behaviour is under test, not file text,
 * except in the last group - there delivery sits inside the render loop with no
 * seam to call.
 *
 * The tool's result field names are Cyrillic: that is the agent-facing API, so
 * the lines reading them carry a cyrillic-ok marker.
 */

const CUSTOMER = '1900592465'
const PRICE = 2 // reel_render, from TOKEN_PRICES

/** A database that answers plausibly and remembers every query. */
function recordingPool(
  opts: {
    twin?: { render_id: string; output_url: string } | null
    owed?: number
  } = {}
) {
  const sql: string[] = []
  const params: unknown[][] = []
  const owed = opts.owed ?? PRICE
  return {
    sql,
    params,
    query: async (text: string, p?: unknown[]) => {
      sql.push(text)
      params.push(p ?? [])
      // The starting grant and the deduction both want the row back.
      if (/RETURNING balance/i.test(text)) return { rows: [{ balance: 500 }] }
      // The atomic settle on a render: how much is still owed back.
      if (/RETURNING owed_tokens AS owed/i.test(text))
        return { rows: owed > 0 ? [{ owed }] : [] }
      // The lookup for a finished file with the same fingerprint.
      if (/SELECT render_id, output_url/i.test(text))
        return { rows: opts.twin ? [opts.twin] : [] }
      return { rows: [] }
    },
  }
}

const charges = (sql: string[]) =>
  sql.filter(s => /balance\s*=\s*balance\s*-/.test(s))
const refunds = (sql: string[]) =>
  sql.filter(s => /balance\s*=\s*balance\s*\+/.test(s))

/** Requests sent to /render/template - so the buyer field can be read. */
let sentBodies: any[] = []

/**
 * The provider: start returns a renderId, polling returns the statuses in turn
 * (the last one repeats for as long as it is asked for).
 */
function stubRenderService(statuses: any[]) {
  sentBodies = []
  let i = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: any) => {
      const u = String(url)
      if (u.endsWith('/render/template')) {
        sentBodies.push(JSON.parse(String(init?.body ?? '{}')))
        return {
          ok: true,
          status: 202,
          json: async () => ({ success: true, renderId: 'r-1' }),
        }
      }
      const s = statuses[Math.min(i++, statuses.length - 1)]
      return { ok: true, status: 200, json: async () => s }
    })
  )
}

async function loadTools() {
  vi.resetModules()
  vi.stubEnv('HOUSE_TELEGRAM_IDS', '') // the buyer is an ordinary wallet
  return await import('./src/agent/tools')
}

/**
 * Run the tool on fake time: the wait loop sleeps four seconds at a stretch,
 * and without this the test itself would wait just as long.
 */
async function run(
  name: string,
  args: Record<string, unknown>,
  pool: ReturnType<typeof recordingPool>
) {
  const mod = await loadTools()
  const tool = mod.TOOLS_BY_NAME.get(name)
  expect(tool, `${name} исчез из реестра`).toBeTruthy()
  vi.useFakeTimers()
  try {
    const p = tool!.handler(args, { telegramId: CUSTOMER, pool } as never)
    // Two four-second polls - no test here needs more than that.
    await vi.advanceTimersByTimeAsync(9000)
    return (await p) as any
  } finally {
    vi.useRealTimers()
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('рилс, за который заплатили и не получили', () => {
  it('упавший рендер возвращает токены', async () => {
    // Exactly the failure the human got.
    stubRenderService([
      { status: 'rendering', progress: 40 },
      {
        status: 'failed',
        progress: 0,
        error: 'No `src` was passed to <OffthreadVideo>.',
      },
    ])
    const pool = recordingPool()
    const r = await run(
      'reel_render',
      { compositionId: 'TrinityBlogReel' },
      pool
    )

    expect(r.готово).toBe(false) // cyrillic-ok: result field, the tool's API
    expect(String(r.причина)).toContain('OffthreadVideo') // cyrillic-ok: same
    expect(
      refunds(pool.sql).length,
      'рендер стартовал и упал — деньги обязаны вернуться'
    ).toBe(1)
    expect(r.возвращено).toBe(PRICE) // cyrillic-ok: result field, the tool's API
  })

  it('возврат по рендеру нельзя провести дважды', async () => {
    stubRenderService([{ status: 'failed', error: 'boom' }])
    const pool = recordingPool()
    await run('reel_render', { compositionId: 'TrinityBlogReel' }, pool)

    const settle = pool.sql.filter(s =>
      /UPDATE agent_renders SET owed_tokens = 0/.test(s)
    )
    expect(settle.length, 'расчёт идёт одним UPDATE по строке рендера').toBe(1)
    // The decision to refund and the removal of the amount from the row are
    // indivisible: a second call finds no row and mints nothing out of air.
    expect(settle[0]).toMatch(/owed_tokens > 0/)
    expect(settle[0]).toMatch(/RETURNING owed_tokens/)
  })

  it('та же работа второй раз не списывает: файл побайтово тот же', async () => {
    const url =
      'https://bucket-production-8259.up.railway.app/vibee-assets/renders/1789474313203-e0970f9a.mp4'
    stubRenderService([{ status: 'completed', publicUrl: url }])
    const pool = recordingPool({
      twin: { render_id: 'r-old', output_url: url },
    })
    const r = await run(
      'reel_render',
      { compositionId: 'TrinityBlogReel', props: { title: 'Trinity' } },
      pool
    )

    expect(r.готово).toBe(true) // cyrillic-ok: result field, the tool's API
    expect(r.повтор).toBe(true) // cyrillic-ok: result field, the tool's API
    expect(r.url).toBe(url)
    expect(
      charges(pool.sql).length,
      'за уже собранный и оплаченный файл второй раз не берут'
    ).toBe(0)
    expect(sentBodies.length, 'повтор не запускает новый рендер').toBe(0)
  })

  it('отпечаток не зависит от порядка ключей в props', async () => {
    // {a,b} and {b,a} are one job. Otherwise the twin is never found.
    const url = 'https://bucket/x.mp4'
    stubRenderService([{ status: 'completed', publicUrl: url }])
    const first = recordingPool({ twin: null })
    await run(
      'reel_render',
      { compositionId: 'C', props: { a: 1, b: 2 } },
      first
    )
    const second = recordingPool({ twin: null })
    await run(
      'reel_render',
      { compositionId: 'C', props: { b: 2, a: 1 } },
      second
    )
    const fp = (p: ReturnType<typeof recordingPool>) =>
      p.params.find(
        x =>
          x.length === 2 &&
          typeof x[1] === 'string' &&
          /^[0-9a-f]{64}$/.test(String(x[1]))
      )?.[1]
    expect(fp(first)).toBeTruthy()
    expect(fp(second)).toBe(fp(first))
  })

  it('заявка на рендер называет заказчика', async () => {
    stubRenderService([
      { status: 'completed', publicUrl: 'https://bucket/y.mp4' },
    ])
    const pool = recordingPool()
    await run('reel_render', { compositionId: 'TrinityBlogReel' }, pool)

    expect(sentBodies.length).toBe(1)
    expect(
      String(sentBodies[0]?.userInfo?.telegram_id),
      'без адресата готовое видео уходит только во внутреннюю группу'
    ).toBe(CUSTOMER)
  })

  it('готовый рендер запоминает ссылку и отдаёт её человеку', async () => {
    const url = 'https://bucket/ready.mp4'
    stubRenderService([{ status: 'completed', publicUrl: url }])
    const pool = recordingPool()
    const r = await run(
      'reel_render',
      { compositionId: 'TrinityBlogReel' },
      pool
    )

    expect(r.готово).toBe(true) // cyrillic-ok: result field, the tool's API
    expect(r.url).toBe(url)
    // The link the agent is told in so many words to hand over: the file does
    // not appear in the conversation by itself.
    expect(r.отдать_человеку).toBe(url) // cyrillic-ok: result field, the API
    expect(
      pool.sql.some(s => /UPDATE agent_renders SET output_url/.test(s)),
      'без записи результата близнец не найдётся и работа оплатится дважды'
    ).toBe(true)
    expect(refunds(pool.sql).length, 'сделанная работа не возвращается').toBe(0)
  })

  it('не дождались за 6 минут — деньги остаются в долге, а не пропадают', async () => {
    stubRenderService([{ status: 'rendering', progress: 10 }])
    const mod = await loadTools()
    const pool = recordingPool()
    const tool = mod.TOOLS_BY_NAME.get('reel_render')!
    vi.useFakeTimers()
    let r: any
    try {
      const p = tool.handler({ compositionId: 'TrinityBlogReel' }, {
        telegramId: CUSTOMER,
        pool,
      } as never)
      await vi.advanceTimersByTimeAsync(7 * 60 * 1000)
      r = await p
    } finally {
      vi.useRealTimers()
    }

    expect(r.готово).toBe(false) // cyrillic-ok: result field, the tool's API
    expect(String(r.причина)).toContain('6 минут') // cyrillic-ok: same
    // No refund belongs here: the work may still finish.
    expect(refunds(pool.sql).length).toBe(0)
    // But the debt is recorded, and the person is told what closes it.
    const insert = pool.params.find(p => p.length === 5)
    expect(insert?.[4], 'в строке рендера записана сумма долга').toBe(PRICE)
    expect(String(r.подсказка)).toContain('render_status') // cyrillic-ok: same
  })

  it('render_status закрывает счёт по рендеру, который упал позже', async () => {
    // The outcome arrived after reel_render gave up. The only witness to it is
    // the status poll. Not settling here means keeping the money silently.
    stubRenderService([{ status: 'failed', error: 'renderer died' }])
    const pool = recordingPool()
    const r = await run('render_status', { renderId: 'r-1' }, pool)

    expect(refunds(pool.sql).length, 'упал — вернули').toBe(1)
    expect(r.возвращено).toBe(PRICE) // cyrillic-ok: result field, the tool's API
  })

  it('render_status по уже рассчитанному рендеру ничего не возвращает', async () => {
    stubRenderService([{ status: 'failed', error: 'renderer died' }])
    const pool = recordingPool({ owed: 0 }) // the debt is already closed
    const r = await run('render_status', { renderId: 'r-1' }, pool)

    expect(
      refunds(pool.sql).length,
      'второй возврат — это чеканка из воздуха'
    ).toBe(0)
    expect(r.возвращено).toBeUndefined() // cyrillic-ok: result field, the API
  })
})

/**
 * Delivery sits inside the render loop in the server file with nowhere to call
 * it from, so this check is structural. The property that broke is structural
 * too: WHO the video is addressed to, and in what order.
 */
describe('маршрут /render/template тоже отдаёт видео заказчику', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, 'render-server.ts'),
    'utf8'
  )

  function templateCompletionBlock(): string {
    const start = src.indexOf('THE TEMPLATE ROUTE HAS A BUYER TOO')
    expect(start, 'блок доставки шаблонного маршрута пропал').toBeGreaterThan(0)
    const end = src.indexOf('// Auto-publish to community feed', start)
    expect(end).toBeGreaterThan(start)
    return src.slice(start, end)
  }

  it('находит блок', () => {
    expect(templateCompletionBlock().length).toBeGreaterThan(200)
  })

  it('адресует видео заказчику, а не только внутренней группе', () => {
    const block = templateCompletionBlock()
    expect(block).toMatch(/userInfo\?\.telegram_id/)
    expect(block).toMatch(/sendTelegramVideo\(\s*buyerChatId/)
  })

  it('обслуживает заказчика раньше служебной копии', () => {
    const block = templateCompletionBlock()
    // Look for CALLS, not mentions: `TELEGRAM_RENDERS_GROUP` also stands in the
    // comment above the block - the first version of this check failed on it,
    // on its own anchor instead of on the code.
    const buyer = block.search(/sendTelegramVideo\(\s*buyerChatId/)
    const group = block.search(/sendTelegramVideo\(\s*TELEGRAM_RENDERS_GROUP/)
    expect(buyer).toBeGreaterThan(-1)
    expect(group).toBeGreaterThan(-1)
    expect(
      buyer,
      'внутреннюю группу нельзя обслуживать раньше того, кто заплатил'
    ).toBeLessThan(group)
  })

  it('недоставленное видео — это ошибка, а не заметка', () => {
    const block = templateCompletionBlock()
    expect(block).toMatch(/console\.error/)
    expect(block).toMatch(/did NOT receive/)
    expect(block).toMatch(/buyer=/)
    expect(block).toMatch(/group=/)
  })
})
