/**
 * A PICTURE OF A CLIENT IS THEIR FACE. ALWAYS.
 *
 * Owner, 2026-09-21: "he does not use the clients' face -- this is
 * mandatory", after a CRM portrait came out as somebody else. And before that:
 * "img2img gpt 2.5, from the user's avatar", "and 9:16". Three doors drew a
 * stranger, each reasonable alone: crm_deliver_photo fell back to
 * text-to-image when the avatar did not load; its paid mode was text-to-image
 * by design; image_edit without a file took the CALLER's avatar -- the
 * owner's own face in a duet.
 *
 * What this pins:
 *   - which photo is the client's face (client-face.ts): a sent photo that
 *     shows a face, else the avatar, else nobody -- and a URL the model offers
 *     only when it IS one of their sent photos;
 *   - crm_deliver_photo in every mode draws from that face; no_person is the
 *     only text-to-image door and it bans people; a paid portrait is priced as
 *     the edit it is;
 *   - the real image_edit, for a client turn, takes the client's face, never
 *     the caller's; image_generate for a client bans people;
 *   - a slow edit keeps its charge for the picture that is coming and gives it
 *     back only on a "no picture" verdict -- and nothing is ever refunded that
 *     was never taken (chargeLater);
 *   - the briefs: the portrait first, even for a client with a package.
 *
 * Ids are synthetic (9000000xx).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { owedDouble } from './crm-owed-double'
import {
  OWNER,
  LEAD,
  TASK,
  AVATAR,
  PROVIDER,
  flush,
  deliverySetup,
} from './crm-deliver-harness'

const SELFIE = 'https://s3.example/sent-selfie.jpg'
const SCREEN = 'https://s3.example/sent-screenshot.png'
const STRANGER = 'https://elsewhere.example/somebody.jpg'

// A cold re-import of the tool graph per case; see a-paid-portrait-is-never-lost.test.ts.
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  vi.resetModules()
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost'
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  for (const m of [
    './src/agent/crm-offer-tool',
    './src/agent/telegram-tools',
    './src/agent/crm-touch-tools',
    './src/agent/chat-memory',
    './src/kie-image',
    './src/token-ledger',
  ])
    vi.doUnmock(m)
})

// ─── which photo is the face ────────────────────────────────────────────────

describe('clientFace: theirs, or nobody', () => {
  const deps = (
    sent: Array<{ url: string; transcript: string | null }>,
    avatar = AVATAR
  ) => ({
    sentPhotos: async () => sent,
    avatar: async () => avatar,
  })

  it('a photo they sent that shows a face beats the avatar', async () => {
    const { clientFace } = await import('./src/agent/client-face')
    const face = await clientFace(
      {},
      { id: LEAD },
      deps([
        { url: SCREEN, transcript: 'Скриншот переписки с текстом' }, // cyrillic-ok: a vision description
        { url: SELFIE, transcript: 'Женщина улыбается, крупный план лица' }, // cyrillic-ok: a vision description
      ])
    )
    expect(face).toEqual({ url: SELFIE, from: 'sent' })
  })

  it('a screenshot is not a face: the avatar is', async () => {
    const { clientFace } = await import('./src/agent/client-face')
    const face = await clientFace(
      {},
      { id: LEAD },
      deps([{ url: SCREEN, transcript: 'Скриншот, на нём лицо в аватарке' }]) // cyrillic-ok: a vision description
    )
    expect(face).toEqual({ url: AVATAR, from: 'avatar' })
  })

  it('a URL the model offers is used only when it IS one of their photos', async () => {
    const { clientFace } = await import('./src/agent/client-face')
    const theirs = await clientFace(
      {},
      { id: LEAD },
      deps([{ url: SCREEN, transcript: null }]),
      { photoUrl: SCREEN }
    )
    expect(theirs).toEqual({ url: SCREEN, from: 'sent' })
    const not = await clientFace({}, { id: LEAD }, deps([]), {
      photoUrl: STRANGER,
    })
    expect(not && 'url' in not ? not.url : null).toBe(AVATAR)
    expect(not && 'ignored' in not ? not.ignored : '').toBeTruthy()
  })

  it('no photo and no avatar: nobody', async () => {
    const { clientFace } = await import('./src/agent/client-face')
    expect(await clientFace({}, { id: LEAD }, deps([], ''))).toBeNull()
  })

  it('the face words, and the words that are not a face', async () => {
    const { showsAFace } = await import('./src/agent/client-face')
    for (const t of [
      'Селфи девушки на фоне моря', // cyrillic-ok: a vision description
      'Портрет мужчины в очках', // cyrillic-ok: a vision description
      'A man smiling at the camera',
    ])
      expect(showsAFace(t), t).toBe(true)
    for (const t of [
      'Пейзаж без людей', // cyrillic-ok: a vision description
      'Скриншот таблицы', // cyrillic-ok: a vision description
      'A manual page with text',
      '',
      null,
    ])
      expect(showsAFace(t), String(t)).toBe(false)
  })
})

// ─── crm_deliver_photo, every mode ──────────────────────────────────────────

describe('crm_deliver_photo draws the person from their face in every mode', () => {
  it('the gift: GPT Image 2.5 img2img, 9:16, from the avatar by default', async () => {
    const s = await deliverySetup({ owed: owedDouble() })
    const r: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'sailor' },
      s.ctx
    )
    expect(s.draw.calls.length).toBe(1)
    expect(s.draw.calls[0].image_url).toBe(AVATAR)
    expect(s.draw.calls[0].model).toBe('gpt-image-2-5-flare-image-to-image')
    expect(s.draw.calls[0].aspect_ratio).toBe('9:16')
    expect(String(s.draw.calls[0].prompt)).toMatch(
      /^Keep the exact same person/
    )
    expect(s.gen.calls.length).toBe(0)
    expect(r.source).toBe('его аватарка')
  })

  it('a photo they sent with their face is preferred to the avatar', async () => {
    const s = await deliverySetup({
      owed: owedDouble(),
      sent: [{ url: SELFIE, transcript: 'Селфи, лицо крупно' }], // cyrillic-ok: a vision description
    })
    const r: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'sailor' },
      s.ctx
    )
    expect(s.draw.calls[0].image_url).toBe(SELFIE)
    expect(r.source).toBe('присланное им фото')
  })

  it("a stranger's URL is not drawn: their own face is", async () => {
    const s = await deliverySetup({ owed: owedDouble() })
    const r: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'sailor', photo_url: STRANGER },
      s.ctx
    )
    expect(s.draw.calls[0].image_url).toBe(AVATAR)
    expect(r.photo_url_ignored).toBeTruthy()
  })

  it('the retired from_photo=false no longer draws a person from a description', async () => {
    const s = await deliverySetup({ owed: owedDouble() })
    await s.deliver.handler(
      { chat: '@test_lead', prompt: 'sailor', from_photo: false },
      s.ctx
    )
    expect(s.gen.calls.length, 'a person was drawn from text').toBe(0)
    expect(s.draw.calls[0].image_url).toBe(AVATAR)
  })

  it('paid: the same face, drawn on the owner turn, charged to the recipient as the edit it is', async () => {
    const s = await deliverySetup({ owed: owedDouble(), ownClient: true })
    const r: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'sailor', gift: false },
      s.ctx
    )
    expect(s.gen.calls.length).toBe(0)
    expect(s.draw.calls[0].image_url).toBe(AVATAR)
    expect(
      s.draw.calls[0].chargeLater,
      'the owner paid for a paid delivery'
    ).toBe(true)
    expect(s.draw.ledger.charges).toBe(0)
    expect(r.price).toBe(12)
    expect(s.q.pendingFor(OWNER)!.charge).toEqual({
      telegramId: LEAD,
      op: 'gpt_image_edit',
      tokens: 12,
    })
  })

  it('no_person: the only text-to-image door, and it bans people', async () => {
    const s = await deliverySetup({ owed: owedDouble() })
    const r: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'a lighthouse at dawn', no_person: true },
      s.ctx
    )
    expect(s.draw.calls.length).toBe(0)
    expect(String(s.gen.calls[0].prompt)).toMatch(
      /^No people, no faces, no human figures/
    )
    expect(r.source).toBe('без людей, по описанию')
  })
})

// ─── the real image_edit and image_generate ─────────────────────────────────

/** The money chokepoint, recorded: every spend and every refund passes here. */
function ledger() {
  const moves: Array<{ tid: string; delta: number; kind: string }> = []
  return {
    moves,
    moveTokens: async (_pool: unknown, m: any) => {
      moves.push({ tid: String(m.telegramId), delta: m.delta, kind: m.kind })
      return { ok: true, balance: 50 }
    },
    grantWelcomeIfNew: async () => 50,
  }
}

/**
 * The tool's own tables, by shape: the daily cap, the gallery row, what the
 * client sent (scoped by owner AND lead -- a list that ignored either would
 * hand one client somebody else's selfie), the journal. Anything else throws.
 */
function toolPool(sent: Array<{ url: string; transcript: string | null }>) {
  const assets: unknown[][] = []
  return {
    assets,
    query: async (sql: string, p: unknown[] = []) => {
      const flat = sql.replace(/\s+/g, ' ').trim()
      if (/^SELECT COUNT\(\*\)::int AS n FROM assets/.test(flat))
        return { rows: [{ n: 0 }] }
      if (/^INSERT INTO assets/.test(flat)) {
        assets.push(p)
        return { rows: [{ id: assets.length }] }
      }
      if (
        /^CREATE (TABLE|INDEX) IF NOT EXISTS (user_media|hive_events)/.test(
          flat
        )
      )
        return { rows: [] }
      if (
        /^SELECT .+ FROM user_media WHERE owner_id = \$1 AND lead_id = \$2 AND kind = \$4/.test(
          flat
        )
      ) {
        const mine =
          String(p[0]) === OWNER && String(p[1]) === LEAD && p[3] === 'image'
        return {
          rows: mine
            ? sent.map((x, i) => ({
                id: i + 1,
                owner_id: OWNER,
                lead_id: LEAD,
                surface: 'business',
                msg_id: null,
                at: '2026-09-21T10:00:00Z',
                out: false,
                kind: 'image',
                name: 'photo.jpg',
                url: x.url,
                transcript: x.transcript,
              }))
            : [],
        }
      }
      if (/^INSERT INTO hive_events/.test(flat)) return { rows: [] }
      if (/tg_sessions/.test(flat)) return { rows: [] }
      throw new Error(`tool pool: statement not understood: ${flat}`)
    },
  }
}

async function realTools(o: {
  edit?: (opts: any) => Promise<any>
  state?: (id: string) => Promise<any>
}) {
  process.env.KIE_AI_API_KEY = 'test-key'
  process.env.HOUSE_TELEGRAM_IDS = ''
  delete process.env.TELEGRAM_BOT_TOKEN
  delete process.env.BOT_TOKEN_1
  delete process.env.TELEGRAM_CHANNEL_BOT_TOKEN
  const book = ledger()
  const edits: any[] = []
  vi.doMock('./src/token-ledger', async orig => ({
    ...((await orig()) as object),
    moveTokens: book.moveTokens,
    grantWelcomeIfNew: book.grantWelcomeIfNew,
  }))
  vi.doMock('./src/kie-image', async orig => ({
    ...((await orig()) as object),
    editImage: async (opts: any) => {
      edits.push(opts)
      return o.edit
        ? o.edit(opts)
        : { ok: true, url: PROVIDER, taskId: TASK, credits: 6 }
    },
    kieTaskState:
      o.state ?? (async (id: string) => ({ state: 'running', taskId: id })),
  }))
  const fetches: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: any) => {
      fetches.push(String(url))
      if (String(url) === PROVIDER)
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'image/png' }),
          arrayBuffer: async () => new ArrayBuffer(8),
        }
      if (/\/upload$/.test(String(url)))
        return {
          ok: true,
          status: 200,
          json: async () => ({ directUrl: 'https://s3.example/ours.png' }),
        }
      if (/\/api\/generate\/image$/.test(String(url)))
        return {
          ok: true,
          status: 200,
          json: async () => ({ url: '', sent: JSON.parse(init?.body ?? '{}') }),
        }
      return { ok: false, status: 404, json: async () => ({}) }
    })
  )
  const { TOOLS } = await import('./src/agent/tools')
  const byName = (n: string) => TOOLS.find(t => t.name === n)!
  return { byName, book, edits, fetches }
}

describe('the real image_edit, for a client, draws the client', () => {
  it("takes the client's own sent face -- never the caller's avatar, never the offered stranger", async () => {
    const t = await realTools({})
    const pool = toolPool([{ url: SELFIE, transcript: 'Селфи, лицо крупно' }]) // cyrillic-ok: a vision description
    const r: any = await t
      .byName('image_edit')
      .handler({ prompt: 'sailor', image_url: STRANGER }, {
        telegramId: OWNER,
        pool,
        faceOf: LEAD,
      } as never)
    expect(t.edits.length).toBe(1)
    expect(t.edits[0].imageUrl).toBe(SELFIE)
    expect(r.done).toBe(true)
    expect(r.source).toBe('присланное клиентом фото')
  })

  it('no face of the client at all: refused, and nothing is charged', async () => {
    const t = await realTools({})
    const pool = toolPool([])
    const r: any = await t.byName('image_edit').handler({ prompt: 'sailor' }, {
      telegramId: OWNER,
      pool,
      faceOf: LEAD,
    } as never)
    expect(r.done).toBe(false)
    expect(t.edits.length).toBe(0)
    expect(t.book.moves, 'charged for a picture nobody could draw').toEqual([])
  })

  it('image_generate for a client opens with the ban on people; for the owner it does not', async () => {
    const t = await realTools({})
    const gen = t.byName('image_generate')
    await gen.handler({ prompt: 'a lighthouse' }, {
      telegramId: OWNER,
      pool: toolPool([]),
      faceOf: LEAD,
    } as never)
    await gen.handler({ prompt: 'a lighthouse' }, {
      telegramId: OWNER,
      pool: toolPool([]),
    } as never)
    const bodies = (globalThis.fetch as any).mock.calls
      .filter((c: any[]) => /\/api\/generate\/image$/.test(String(c[0])))
      .map((c: any[]) => JSON.parse(c[1].body).prompt)
    expect(bodies.length).toBe(2)
    expect(bodies[0]).toMatch(/^No people, no faces/)
    expect(bodies[1]).toBe('a lighthouse')
  })
})

describe('a slow edit keeps its charge for the picture that is coming', () => {
  // The portrait's own model: GPT Image 2.5, priced as gpt_image_edit (12).
  const GPT = 'gpt-image-2-5-flare-image-to-image'
  const pending = async () => ({
    ok: false,
    pending: true,
    taskId: TASK,
    reason: 'still drawing',
  })

  it('pending: charged once, not refunded, and the picture is stored when it comes', async () => {
    vi.useFakeTimers()
    const states = ['running', 'success']
    const t = await realTools({
      edit: pending,
      state: async id =>
        states.shift() === 'success'
          ? { state: 'success', taskId: id, url: PROVIDER }
          : { state: 'running', taskId: id },
    })
    const pool = toolPool([])
    const r: any = await t
      .byName('image_edit')
      .handler({ prompt: 'sailor', image_url: SELFIE, model: GPT }, {
        telegramId: OWNER,
        pool,
        imageWaitMs: 60_000,
      } as never)
    expect(r.pending).toBe(true)
    expect(r.taskId).toBe(TASK)
    // The turn's wait is the one the caller set, not the provider default.
    expect(t.edits[0].timeoutMs).toBe(60_000)
    expect(t.book.moves).toEqual([{ tid: OWNER, delta: -12, kind: 'spend' }])
    await vi.advanceTimersByTimeAsync(30_000)
    await flush()
    expect(
      pool.assets.length,
      'the late picture never reached the gallery'
    ).toBe(1)
    expect(t.book.moves, 'a delivered picture was refunded').toEqual([
      { tid: OWNER, delta: -12, kind: 'spend' },
    ])
  })

  it('pending, then the provider says no: refunded exactly once', async () => {
    vi.useFakeTimers()
    const t = await realTools({
      edit: pending,
      state: async id => ({ state: 'fail', taskId: id, reason: 'refused' }),
    })
    const pool = toolPool([])
    await t
      .byName('image_edit')
      .handler({ prompt: 'sailor', image_url: SELFIE, model: GPT }, {
        telegramId: OWNER,
        pool,
      } as never)
    await vi.advanceTimersByTimeAsync(15_000)
    await flush()
    expect(t.book.moves).toEqual([
      { tid: OWNER, delta: -12, kind: 'spend' },
      { tid: OWNER, delta: 12, kind: 'refund' },
    ])
    expect(pool.assets.length).toBe(0)
  })

  it('nothing is refunded that was never taken (chargeLater)', async () => {
    const t = await realTools({
      edit: async () => ({ ok: false, reason: 'Kie refused' }),
    })
    const r: any = await t
      .byName('image_edit')
      .handler({ prompt: 'sailor', image_url: SELFIE, model: GPT }, {
        telegramId: OWNER,
        pool: toolPool([]),
        chargeLater: true,
      } as never)
    expect(r.done).toBe(false)
    expect(
      t.book.moves,
      'tokens minted for a charge that never happened'
    ).toEqual([])
  })
})

// ─── the briefs ─────────────────────────────────────────────────────────────

describe('the briefs: the portrait first, from the face, package or not', () => {
  it('the playbook puts the portrait before a package, and the face before anything', async () => {
    const { salesPlaybook } = await import('./src/agent/crm-playbook')
    const p = salesPlaybook({ seller: true, telegramId: OWNER })
    expect(p).toContain('Портрет — ПЕРВЫЙ подарок и клиенту с пакетом') // cyrillic-ok: the brief under test
    expect(p).toContain('рилс и остальное — после портрета') // cyrillic-ok: the brief under test
    expect(p).toContain('ЛИЦО ОБЯЗАТЕЛЬНО') // cyrillic-ok: the brief under test
    expect(p).toContain('не image_generate и не image_edit без его фото') // cyrillic-ok: the brief under test
  })

  it('the duet brief offers her portrait before her reel, and image_edit is no longer off-brand', async () => {
    const { sellerBrief, OFF_BRAND_FOR_CLIENT } = await import(
      './src/agent/crm-duet-tool'
    )
    const b = sellerBrief(LEAD, { reel_template: { composition: 'TestReel' } })
    const portrait = b.indexOf('Первый подарок — её портрет 9:16 из ЕЁ лица') // cyrillic-ok: the brief under test
    const reel = b.indexOf('Рилс — после портрета') // cyrillic-ok: the brief under test
    expect(portrait).toBeGreaterThanOrEqual(0)
    expect(reel).toBeGreaterThan(portrait)
    expect(OFF_BRAND_FOR_CLIENT.has('image_generate')).toBe(true)
    expect(OFF_BRAND_FOR_CLIENT.has('image_edit')).toBe(false)
  })

  it("the duet's seller works for the buyer's face; sending still acts as the owner", async () => {
    const { runDuet } = await import('./src/agent/crm-duet-tool')
    const seen: any[] = []
    const sentBy: any[] = []
    const run = {
      id: 'duet-test',
      buyer: LEAD,
      owner: OWNER,
      turns: 1,
      dry_run: false,
      state: 'running' as const,
      started_at: 't',
      transcript: [],
      coverage: {},
      paid_calls: 0,
      media_sent: 0,
      violations: [],
      voice_flags: [],
    }
    await runDuet(
      run as never,
      { telegramId: OWNER, pool: {} } as never,
      {
        agent: async function* (_h: unknown, ctx: any) {
          seen.push(ctx)
          yield {
            kind: 'text',
            text: 'Здравствуйте. Где живёт ваша аудитория?',
          } // cyrillic-ok: a seller line
        },
        buyerModel: async () => 'В канале.', // cyrillic-ok: a buyer line
        sendText: async (ctx: any) => {
          sentBy.push(ctx)
        },
        sendMedia: async () => undefined,
        clientProfile: async () => ({ has_profile: false }),
      } as never
    )
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every(c => c.faceOf === LEAD && c.telegramId === OWNER)).toBe(
      true
    )
    expect(sentBy.every(c => c.faceOf === undefined)).toBe(true)
  })

  it('crm_client_profile says whether the portrait is due', async () => {
    const { portraitOf } = await import('./src/agent/crm-deliver-tool')
    const { SELLER_NOTE_PREFIXES } = await import('./src/agent/crm-notes')
    const { forgetOwedTableForTests } = await import('./src/agent/crm-owed')
    const owed = owedDouble()
    const gifts = new Set<string>()
    const pool = {
      query: async (sql: string, p: unknown[] = []) => {
        const flat = sql.replace(/\s+/g, ' ').trim()
        if (/\bcrm_owed\b/.test(flat)) return owed.query(sql, p)
        if (
          /^SELECT 1 FROM crm_touches WHERE owner_id = \$1 AND lead_id = \$2 AND note LIKE \$3 LIMIT 1$/.test(
            flat
          )
        ) {
          // The note prefix is what makes a touch a gift; any other note is not.
          const isGift = p[2] === SELLER_NOTE_PREFIXES.gift + '%'
          return {
            rows:
              isGift && gifts.has(`${p[0]}|${p[1]}`) ? [{ '?column?': 1 }] : [],
          }
        }
        throw new Error(`profile pool: ${flat}`)
      },
    }
    forgetOwedTableForTests()
    const due = await portraitOf(pool, OWNER, LEAD)
    expect(due.given).toBe(false)
    expect(due.first).toMatch(/^сначала портрет из его лица/) // cyrillic-ok: the answer under test
    gifts.add(`${OWNER}|${LEAD}`)
    const done = await portraitOf(pool, OWNER, LEAD)
    expect(done.given).toBe(true)
    expect(done.first).toMatch(/^портрет уже подарен/) // cyrillic-ok: the answer under test
    // Another owner's gift to the same person is not this owner's.
    expect((await portraitOf(pool, '900000299', LEAD)).given).toBe(false)
  })
})
