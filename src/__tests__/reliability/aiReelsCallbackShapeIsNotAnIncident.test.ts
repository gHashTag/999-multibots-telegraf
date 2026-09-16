/**
 * A STRANGER'S MALFORMED POST IS NOT AN INCIDENT — OUR OWN RENDER SERVER'S IS.
 *
 * `utils/logger.ts` binds the Telegram transport at level 'error', so every
 * `logger.error` in this process is a push notification to the owner. The AI
 * Reels callback is mounted with no auth (api_server/index.ts), so anyone who
 * can reach the host reaches its shape checks. Whatever decides their level
 * decides who can wake the owner at 3am.
 *
 * THE DISCRIMINATOR HAS TO BE VERIFIED, NOT NOTICED. This suite used to assert
 * the opposite: it posted `?cb=deadbeefdeadbeef` — sixteen characters anyone can
 * type — and demanded a page. That is the attack, not the defence: three shape
 * sentences, each its own fingerprint in utils/alertThrottle.ts, on demand from
 * a stranger. The route now gates the level on verifyCallbackToken, the way the
 * sibling webhook already did (kie-ai-webhook.routes.ts), so only a mark WE
 * built with buildCallbackToken and bound to that recipient turns the volume up.
 *
 * Every quiet case below is therefore paired with a noisy one driven by a
 * genuine token, because silencing a scanner is only correct if our own broken
 * contract still shouts — a callback we asked for whose shape we cannot parse is
 * a paid render about to be lost.
 *
 * The second subject is what those alerts CARRY. `payload` is not one of the
 * CONTENT_META_KEYS redacted in utils/logger.ts, so a small body went into the
 * owner's Telegram group verbatim -- an unauthenticated write of attacker-chosen
 * text into the operator's own chat. The keys are the diagnosis; the values are
 * not.
 *
 * This drives the real handler off the real router. Nothing is asserted about
 * the source text.
 */
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/core/bot', () => ({
  defaultBot: { telegram: { sendMessage: vi.fn(), sendVideo: vi.fn() } },
  getBotByName: vi.fn(async () => ({ bot: null })),
}))

vi.mock('@/core/supabase', () => ({
  supabase: { from: vi.fn() },
  getUserLanguageFromDB: vi.fn(async () => 'ru'),
}))

vi.mock('axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), head: vi.fn() },
}))

/**
 * THE TOKEN IS REAL HERE, ONLY THE SECRET IS FAKE.
 *
 * The level now depends on the HMAC actually verifying, so a stubbed
 * verifyCallbackToken would test the stub. `utils/callbackToken.ts` reads
 * exactly one thing from `@/config` — SECRET_API_KEY — and nothing else in this
 * import graph touches that module, so handing it a fixed secret is enough to
 * run the genuine build-and-verify pair the render server runs.
 */
// Spelled out rather than referenced: vi.mock is hoisted above every import, so
// a const declared here would still be in its temporal dead zone when the
// factory runs.
vi.mock('@/config', () => ({ SECRET_API_KEY: 'test-secret-key-value' })) // secret-guard-ok: invented fixture, never issued
const TEST_SECRET = 'test-secret-key-value' // secret-guard-ok: invented fixture, never issued

import { buildCallbackToken } from '@/utils/callbackToken'
import { logger } from '@/utils/logger'
import router from '@/api_server/routes/ai-reels-callback.routes'

/** The real handler express would call for POST /telegram/ai-reels-callback. */
function callbackHandler(): (req: any, res: any) => Promise<void> {
  const layer = (router as any).stack.find(
    (l: any) =>
      l.route?.path === '/telegram/ai-reels-callback' && l.route?.methods?.post
  )
  if (!layer) throw new Error('POST /telegram/ai-reels-callback is not mounted')
  const stack = layer.route.stack
  return stack[stack.length - 1].handle
}

/** A response that accepts the 202 and records nothing. */
const okRes = () => ({ status: () => ({ json: () => undefined }) })

/** The first argument of every call: the sentence the owner would read. */
const messages = (spy: unknown) =>
  (spy as Mock).mock.calls.map(c => String(c[0]))

/** Everything a level was handed, flattened, so a leaked value is findable. */
const everythingLogged = (spy: unknown) =>
  JSON.stringify((spy as Mock).mock.calls)

/** A value no diagnosis needs and an attacker would love the owner to read. */
const PLANTED = 'ACCOUNT-LOCKED-CALL-555-0199'

/** The customer every signed body below belongs to. */
const CUSTOMER = '424242'

/**
 * The query the render server really sends: inngest_app/render-server-client.ts
 * appends `?cb=${buildCallbackToken(telegramId) ?? ''}`.
 */
const signedQuery = (telegramId: string = CUSTOMER) => ({
  cb: buildCallbackToken(telegramId),
})

/** Sixteen characters of the right shape and nobody's signature. */
const FORGED = 'deadbeefdeadbeef'

const post = async (body: unknown, query: Record<string, unknown> = {}) => {
  await callbackHandler()(
    { body, query, headers: { 'content-type': 'application/json' } },
    okRes()
  )
}

describe('POST /telegram/ai-reels-callback (real handler)', () => {
  beforeEach(() => {
    vi.mocked(logger.error).mockClear()
    vi.mocked(logger.warn).mockClear()
    vi.mocked(logger.info).mockClear()
  })

  it('the forged mark is not the same string as the real one', () => {
    // If these ever collided the whole suite below would be vacuous.
    expect(buildCallbackToken(CUSTOMER)).toMatch(/^[a-f0-9]{16}$/)
    expect(buildCallbackToken(CUSTOMER)).not.toBe(FORGED)
  })

  it('does not page the owner when an anonymous body has no job id', async () => {
    await post({ hello: PLANTED })

    expect(
      messages(logger.error),
      'an unauthenticated POST reached the owner alert group'
    ).toEqual([])
    expect(messages(logger.warn)).toContain(
      '❌ [AI REELS CALLBACK] Cannot extract job_id'
    )
  })

  it('does not page a stranger who simply TYPED a ?cb', async () => {
    // The whole defect in one line: presence was the discriminator, so this
    // request used to page. Sixteen hex characters cost nothing to invent.
    await post({ hello: PLANTED }, { cb: FORGED })

    expect(
      messages(logger.error),
      'a made-up ?cb still buys a stranger a push to the owner phone'
    ).toEqual([])
    expect(messages(logger.warn)).toContain(
      '❌ [AI REELS CALLBACK] Cannot extract job_id'
    )
  })

  it('stays quiet on an unparseable body even when the mark is genuine', async () => {
    // Deliberate and load-bearing: a body with no job id is the one shape that
    // precedes every id the mark could be keyed on, so in the traffic we really
    // get (sendCallback posts { download_url } and nothing else) the sender is
    // unknowable there. Unknown is not a diagnosis in either direction.
    await post({ metadata: { telegram_id: CUSTOMER } }, signedQuery())

    expect(messages(logger.error)).toEqual([])
    expect(messages(logger.warn)).toContain(
      '❌ [AI REELS CALLBACK] Cannot extract job_id'
    )
  })

  it('does not page on an anonymous body with a job id but no video', async () => {
    await post({ job_id: `telegram-${CUSTOMER}-1700000000`, note: PLANTED })

    expect(messages(logger.error)).toEqual([])
    expect(messages(logger.warn)).toContain(
      '❌ [AI REELS CALLBACK] No video URL found'
    )
  })

  it('does not page when a job id is dressed up with a forged mark', async () => {
    await post(
      { job_id: `telegram-${CUSTOMER}-1700000001`, note: PLANTED },
      { cb: FORGED }
    )

    expect(
      messages(logger.error),
      'anyone could name one of our job ids and choose the level'
    ).toEqual([])
    expect(messages(logger.warn)).toContain(
      '❌ [AI REELS CALLBACK] No video URL found'
    )
  })

  it('does not page on a mark signed for somebody else', async () => {
    // The mark is bound to the recipient (utils/callbackToken.ts), so a token
    // seen once cannot be replayed to raise the volume on another customer.
    await post(
      { job_id: `telegram-${CUSTOMER}-1700000002`, note: PLANTED },
      signedQuery('999999999')
    )

    expect(messages(logger.error)).toEqual([])
    expect(messages(logger.warn)).toContain(
      '❌ [AI REELS CALLBACK] No video URL found'
    )
  })

  it('STILL pages when OUR OWN signed callback carries no video', async () => {
    // The other half. This is the request the render server actually makes:
    // the URL we built, the token we signed, and a body we cannot use — a paid
    // render about to be lost.
    await post(
      { job_id: `telegram-${CUSTOMER}-1700000003`, note: PLANTED },
      signedQuery()
    )

    expect(
      messages(logger.error),
      'our own render server broke the contract and nobody was told'
    ).toContain('❌ [AI REELS CALLBACK] No video URL found')
  })

  it('never puts the body of a signed request into the alert', async () => {
    await post(
      { job_id: `telegram-${CUSTOMER}-1700000004`, hello: PLANTED },
      signedQuery()
    )

    expect(
      messages(logger.error),
      'the paging case must be reached, or this asserts nothing'
    ).toContain('❌ [AI REELS CALLBACK] No video URL found')
    expect(
      everythingLogged(logger.error),
      'a stranger chose the text in the owner Telegram group'
    ).not.toContain(PLANTED)
    // The shape is what an operator actually needs.
    expect(everythingLogged(logger.error)).toContain('hello')
  })

  it('does not page, or echo metadata, when no telegram id can be found', async () => {
    const body = {
      job_id: 'render-abc-123',
      download_url: 'https://example.com/v.mp4',
      metadata: { note: PLANTED },
    }

    await post(body)
    expect(messages(logger.error)).toEqual([])
    expect(messages(logger.warn)).toContain(
      '❌ [AI REELS CALLBACK] Cannot extract Telegram ID'
    )

    // And it cannot be made loud by ANY mark, genuine or forged: the mark is
    // keyed on the very id this branch failed to derive, so nothing here is
    // provably ours. Fail closed.
    for (const query of [{ cb: FORGED }, signedQuery()]) {
      vi.mocked(logger.error).mockClear()
      vi.mocked(logger.warn).mockClear()
      await post({ ...body, job_id: 'render-abc-124' }, query)
      expect(messages(logger.error)).toEqual([])
      expect(messages(logger.warn)).toContain(
        '❌ [AI REELS CALLBACK] Cannot extract Telegram ID'
      )
      expect(
        everythingLogged(logger.warn),
        'metadata is an open map from the same untrusted body'
      ).not.toContain(PLANTED)
    }
  })

  it('wakes the owner ONCE per thrown exception, not twice', async () => {
    const boom = {
      status: () => {
        throw new Error('socket closed before the 202 went out')
      },
    }

    await callbackHandler()(
      { body: { job_id: 'telegram-1-2' }, query: {}, headers: {} },
      boom
    )

    expect(
      messages(logger.error),
      'one exception, two pushes: the throttle fingerprints on the text, so ' +
        'two titles can never collapse into one'
    ).toEqual(['❌ [AI REELS CALLBACK] Processing error'])
  })

  it('the surviving alert carries the diagnosis the deleted one lacked', async () => {
    const boom = {
      status: () => {
        throw new Error('socket closed before the 202 went out')
      },
    }

    await callbackHandler()(
      { body: { job_id: 'telegram-1-3' }, query: {}, headers: {} },
      boom
    )

    const [, meta] = vi.mocked(logger.error).mock.calls[0] as unknown as [
      string,
      any,
    ]
    expect(meta.error).toBe('socket closed before the 202 went out')
    expect(typeof meta.stack).toBe('string')
  })
})

/**
 * WITH NO SECRET, NOTHING IS PROVABLY OURS.
 *
 * buildCallbackToken returns null when SECRET_API_KEY is falsy and
 * render-server-client.ts interpolates that as `?cb=` — so in this configuration
 * the real render server's callbacks are indistinguishable from a stranger's and
 * stay quiet. That is the honest answer rather than a comfortable one: the same
 * missing key already makes the delivery check reject every callback, so there
 * is no delivery left to page about. Kept as a test so the next person who
 * removes the key learns it here instead of in production.
 */
describe('POST /telegram/ai-reels-callback without SECRET_API_KEY', () => {
  it('pages nobody, not even for a callback we asked for', async () => {
    vi.resetModules()
    vi.doMock('@/config', () => ({ SECRET_API_KEY: '' }))

    const { buildCallbackToken: freshBuild } = await import(
      '@/utils/callbackToken'
    )
    // The registry really swapped. Without this the test could pass for the
    // boring reason -- `cb: ''` never verifies under ANY secret -- and would
    // prove nothing about the keyless configuration.
    expect(freshBuild(CUSTOMER)).toBeNull()

    const { default: freshRouter } = await import(
      '@/api_server/routes/ai-reels-callback.routes'
    )
    // vitest reuses the result of a vi.mock factory across resetModules, so the
    // fresh route writes into the very spies the suite above used. Clear them.
    const { logger: freshLogger } = await import('@/utils/logger')
    vi.mocked(freshLogger.error).mockClear()
    vi.mocked(freshLogger.warn).mockClear()

    const layer = (freshRouter as any).stack.find(
      (l: any) =>
        l.route?.path === '/telegram/ai-reels-callback' &&
        l.route?.methods?.post
    )
    const handle = layer.route.stack[layer.route.stack.length - 1].handle
    // What the render server sends when the token could not be built.
    const keylessQuery = { cb: '' }

    await handle(
      {
        body: { job_id: `telegram-${CUSTOMER}-1700000005` },
        query: keylessQuery,
        headers: {},
      },
      okRes()
    )

    expect(messages(freshLogger.error)).toEqual([])
    expect(messages(freshLogger.warn)).toContain(
      '❌ [AI REELS CALLBACK] No video URL found'
    )

    // And the delivery this configuration would have paged about does not
    // happen either: a complete, well-formed callback is dropped at the mark.
    vi.mocked(freshLogger.warn).mockClear()
    await handle(
      {
        body: {
          download_url: `https://example.com/jobs/telegram-${CUSTOMER}-1700000006/results/v.mp4`,
        },
        query: keylessQuery,
        headers: {},
      },
      okRes()
    )

    expect(messages(freshLogger.error)).toEqual([])
    expect(messages(freshLogger.warn)).toContain(
      '⛔ [AI REELS CALLBACK] Отклонено: метка не совпала'
    )

    vi.doMock('@/config', () => ({ SECRET_API_KEY: TEST_SECRET }))
    vi.resetModules()
  })
})
