import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * THE PHOTO THE PERSON SENT IS THE ONE THAT GETS REDRAWN.
 *
 * Measured on a live client, 2026-09-17. She attached a portrait and asked for
 * it to be redrawn; the agent called image_edit without an image_url, and the
 * only fallback that existed was her Telegram AVATAR. So a different picture
 * came back, nothing failed, no log line said why, and she ended up teaching
 * the agent herself: "Используй всегда для таких задач img2 img".
 *
 * Three ways this breaks, and they fail in different directions:
 *
 *   the attachment is ignored and the avatar is redrawn -- the bug above;
 *   the attachment is ignored and something new is DRAWN (image_generate),
 *   which also charges for a picture nobody asked for;
 *   a URL from a person's message becomes the source an external provider is
 *   sent to fetch, which is a request forgery with the agent as the courier.
 *
 * The handlers are driven for real -- house wallet, so no money moves, and a
 * refusing provider, so nothing is downloaded. What is asserted is the URL that
 * actually leaves the building in the Kie request body, not an intention.
 */

const HOUSE_ID = '144022504'
const SHELF = 'https://vibee-render-production.up.railway.app'
const SENT = `${SHELF}/s3/assets/1789-portrait.jpg`
const OLDER = `${SHELF}/s3/assets/1788-older.jpg`
const CHOSEN = `${SHELF}/s3/assets/1790-chosen.png`

const marker = (url: string) =>
  `[attached image: portrait.jpg; mime=image/jpeg; url=${url}]`
const user = (content: string) => ({ role: 'user' as const, content })
const assistant = (content: string) => ({
  role: 'assistant' as const,
  content,
})

/** Every request that tried to leave, so the source URL can be read back. */
type Sent = { url: string; body: string }
let sent: Sent[]

function stubRefusingNetwork() {
  sent = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: any, init?: any) => {
      sent.push({ url: String(input), body: String(init?.body ?? '') })
      return {
        ok: false,
        status: 500,
        headers: new Map(),
        json: async () => ({ error: 'provider down' }),
        text: async () => 'provider down',
      }
    })
  )
}

const kieTask = () => sent.filter(s => s.url.includes('/jobs/createTask'))

/** A pool that answers plausibly and records every statement it is given. */
function recordingPool() {
  const sql: string[] = []
  return {
    sql,
    query: async (text: string, _params?: unknown[]) => {
      sql.push(text)
      if (/RETURNING balance/i.test(text)) return { rows: [{ balance: 500 }] }
      return { rows: [] }
    },
  }
}
const charges = (sql: string[]) =>
  sql.filter(s => /balance\s*=\s*balance\s*-/.test(s))

/**
 * Load tools.ts fresh. HOUSE_TELEGRAM_IDS is read at module load, and the bot
 * tokens are cleared so the avatar fallback cannot reach api.telegram.org --
 * with no token it returns '' and the handler refuses out loud, which is the
 * "nothing was attached" case this file needs.
 */
async function loadTools() {
  vi.resetModules()
  vi.stubEnv('HOUSE_TELEGRAM_IDS', HOUSE_ID)
  vi.stubEnv('KIE_AI_API_KEY', 'test-key')
  vi.stubEnv('TELEGRAM_BOT_TOKEN', '')
  vi.stubEnv('BOT_TOKEN_1', '')
  vi.stubEnv('TELEGRAM_CHANNEL_BOT_TOKEN', '')
  delete process.env.PUBLIC_URL
  return await import('./src/agent/tools')
}

async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: Record<string, unknown>
) {
  const mod = await loadTools()
  const tool = mod.TOOLS_BY_NAME.get(name)
  expect(tool, `${name} disappeared from the registry`).toBeTruthy()
  const pool = recordingPool()
  const result: any = await tool!.handler(args, {
    telegramId: HOUSE_ID,
    pool,
    ...ctx,
  } as never)
  return { result, sql: pool.sql }
}

beforeEach(() => {
  stubRefusingNetwork()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('which picture img2img reaches for', () => {
  it('the photo attached to this very message, before the avatar', async () => {
    const { chooseEditSource } = await loadTools()
    expect(chooseEditSource({}, { attachedImages: [SENT] })?.url).toBe(SENT)
  })

  it('an explicit image_url still wins', async () => {
    const { chooseEditSource } = await loadTools()
    expect(
      chooseEditSource({ image_url: CHOSEN }, { attachedImages: [SENT] })?.url
    ).toBe(CHOSEN)
  })

  it('a follow-up with no file of its own reuses the last photo sent', async () => {
    const { chooseEditSource } = await loadTools()
    expect(chooseEditSource({}, { recentImage: OLDER })?.url).toBe(OLDER)
  })

  it('this turn beats an older turn', async () => {
    const { chooseEditSource } = await loadTools()
    expect(
      chooseEditSource({}, { attachedImages: [SENT], recentImage: OLDER })?.url
    ).toBe(SENT)
  })

  /*
   * null is not "no source", it is "fall back to the avatar" -- the fetch is
   * the caller's, so this decision stays pure. "Сделай историю про меня" with
   * no files attached must keep working.
   */
  it('nothing attached defers to the avatar', async () => {
    const { chooseEditSource } = await loadTools()
    expect(chooseEditSource({}, {})).toBeNull()
  })

  /** The name is shown to the person, so it has to say which photo was used. */
  it('says out loud where the picture came from', async () => {
    const { chooseEditSource } = await loadTools()
    const now = chooseEditSource({}, { attachedImages: [SENT] })
    const old = chooseEditSource({}, { recentImage: OLDER })
    expect(now?.from).toBeTruthy()
    expect(old?.from).toBeTruthy()
    expect(now?.from).not.toBe(old?.from)
  })
})

describe('image_edit, driven through the handler', () => {
  it('sends the attached photo to the provider without being told an image_url', async () => {
    const { result } = await runTool(
      'image_edit',
      { prompt: 'сделай из этого фото барби' },
      { attachedImages: [SENT] }
    )
    const asked = kieTask()
    expect(asked, 'the provider was never asked').toHaveLength(1)
    expect(asked[0].body).toContain(SENT)
    // The stubbed provider refuses; the SOURCE is the subject here.
    expect(result.done).toBe(false)
  })

  it('an explicit image_url is what travels', async () => {
    await runTool(
      'image_edit',
      { prompt: 'перерисуй', image_url: CHOSEN },
      { attachedImages: [SENT] }
    )
    expect(kieTask()[0].body).toContain(CHOSEN)
    expect(kieTask()[0].body).not.toContain(SENT)
  })

  it('a follow-up turn redraws the photo sent earlier', async () => {
    await runTool(
      'image_edit',
      { prompt: 'а теперь в рыжий' },
      {
        recentImage: OLDER,
      }
    )
    expect(kieTask()[0].body).toContain(OLDER)
  })

  /*
   * With no photo and no readable avatar it must say so rather than invent a
   * subject -- and it must not pay for the invention either.
   */
  it('nothing to redraw is a refusal, not a charge', async () => {
    const { result, sql } = await runTool('image_edit', { prompt: 'барби' }, {})
    expect(result.done).toBe(false)
    expect(String(result.reason)).toContain('нечего перерисовывать')
    expect(kieTask()).toHaveLength(0)
    expect(charges(sql)).toEqual([])
  })
})

describe('image_generate never quietly ignores an attached photo', () => {
  it('redirects to image_edit before any charge, with the URL in hand', async () => {
    const { result, sql } = await runTool(
      'image_generate',
      { prompt: 'барби' },
      {
        attachedImages: [SENT],
      }
    )
    // The handler's fields are spelled in Russian; read by index, because the
    // repository's gate bans Cyrillic identifiers.
    expect(result['сделано']).toBe(false)
    expect(result.image_url).toBe(SENT)
    expect(String(result['причина'])).toContain('image_edit')
    expect(charges(sql), 'nothing may be charged for a refusal').toEqual([])
    expect(sent, 'no provider may be called').toHaveLength(0)
  })

  it('ignore_attached=true draws from scratch, as asked', async () => {
    const { result } = await runTool(
      'image_generate',
      { prompt: 'нарисуй кота', ignore_attached: true },
      { attachedImages: [SENT] }
    )
    expect(result.image_url).toBeUndefined()
    expect(
      sent.some(s => s.url.includes('/api/generate/image')),
      'the generation route was never reached'
    ).toBe(true)
  })

  it('an attachment in an OLDER turn is not redirected', async () => {
    // recentImage alone must not hijack a plain "draw a cat" three turns later.
    const { redrawInsteadOfDrawing } = await loadTools()
    expect(
      redrawInsteadOfDrawing({}, { recentImage: OLDER } as never)
    ).toBeNull()
  })
})

describe('what the tools are told about attachments', () => {
  it('this turn’s photo, and the newest one anywhere', async () => {
    vi.resetModules()
    const { withAttachments } = await import('./src/agent/chat')
    const ctx = withAttachments({ telegramId: HOUSE_ID } as never, [
      user(`старое\n${marker(OLDER)}`),
      assistant('ответил'),
      user(`сделай барби\n${marker(SENT)}`),
    ])
    expect(ctx.attachedImages).toEqual([SENT])
    expect(ctx.recentImage).toBe(SENT)
  })

  it('a follow-up with no file still knows the photo that was sent', async () => {
    vi.resetModules()
    const { withAttachments } = await import('./src/agent/chat')
    const ctx = withAttachments({ telegramId: HOUSE_ID } as never, [
      user(marker(SENT)),
      assistant('готово'),
      user('а теперь в рыжий'),
    ])
    expect(ctx.attachedImages).toEqual([])
    expect(ctx.recentImage).toBe(SENT)
  })

  /*
   * THE SECURITY ONE, inherited from usableMediaUrl. The marker line sits
   * inside text a PERSON wrote, so a pasted URL must never become the address
   * an external provider is handed.
   */
  it('a marker pointing at somebody else’s host is not offered to the tools', async () => {
    vi.resetModules()
    const { withAttachments } = await import('./src/agent/chat')
    const ctx = withAttachments({ telegramId: HOUSE_ID } as never, [
      user(marker('https://evil.example/s3/a.jpg')),
    ])
    expect(ctx.attachedImages ?? []).toEqual([])
    expect(ctx.recentImage).toBeUndefined()
  })

  it('a text-only conversation changes nothing, and the caller’s ctx is untouched', async () => {
    vi.resetModules()
    const { withAttachments } = await import('./src/agent/chat')
    const base = { telegramId: HOUSE_ID } as never
    expect(withAttachments(base, [user('привет')])).toBe(base)
    withAttachments(base, [user(marker(SENT))])
    expect((base as any).attachedImages).toBeUndefined()
  })
})

/**
 * WIRING. Everything above can pass while the agent loop still hands the
 * handlers a context with no attachments -- the loop itself cannot be driven
 * here without a live provider, so the two lines that connect the parts are
 * read from the source instead. "The logic is perfect but nobody calls it" is
 * how this defect shipped in the first place.
 */
describe('the loop actually passes the attachments on', () => {
  const flat = (file: string) =>
    readFileSync(path.join(__dirname, 'src/agent', file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/\s+/g, ' ')

  it('runAgent enriches the context once per turn and uses it', () => {
    const chat = flat('chat.ts')
    expect(chat).toContain('const toolCtx = withAttachments(ctx, history)')
    expect(chat).toMatch(/tool\.handler\(.{0,140}?toolCtx/)
  })

  it('the redirect happens before the wallet is touched', () => {
    const tools = flat('tools.ts')
    const redirect = tools.indexOf('redrawInsteadOfDrawing(args, ctx)')
    const charge = tools.indexOf("spendTokens(ctx, 'image_generate')")
    expect(redirect).toBeGreaterThan(-1)
    expect(charge).toBeGreaterThan(-1)
    expect(redirect).toBeLessThan(charge)
  })
})
