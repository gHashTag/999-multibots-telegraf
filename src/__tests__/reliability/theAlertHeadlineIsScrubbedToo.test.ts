/**
 * THE MESSAGE IS THE HALF THAT IS ALWAYS SENT.
 *
 * `TelegramLogTransport` reads `info.message` and hands it to `logError` as the
 * alert headline. Every protection this file's neighbours test -- redactBotToken,
 * the API-key regexes, CONTENT_META_KEYS, the per-value cap -- used to live only
 * inside `detailsForAlert(meta)`, i.e. only on the meta half. The headline went
 * out verbatim, and winston's printf redaction does not cover it: printf writes
 * `info[MESSAGE]`, which is what the console and file transports render, while
 * this transport reads `info.message`.
 *
 * That is not a hypothetical half: 23 alert titles in this repository are
 * template literals built from an upstream error body, an Error.message carries
 * whatever the library put in it (a node-fetch failure quotes the whole URL),
 * and a 401 body habitually quotes back the credential it rejected. The owner's
 * alert group is an ordinary Telegram group with ordinary members in it.
 *
 * So the transport is driven here with SYNTHETIC WINSTON RECORDS -- the exact
 * shape winston hands a transport -- rather than by reading logger.ts for a
 * literal. A record goes in, the delivery service is watched, and the assertion
 * is on what the owner would actually have received.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const logError = vi.fn().mockResolvedValue(undefined)

vi.mock('@/services/telegram-log.service', () => ({
  telegramLogService: {
    isReady: () => true,
    logError,
    initializeOnce: vi.fn(),
    log: vi.fn(),
  },
}))

import { logger } from '@/utils/logger'
import { WINDOW_MS } from '@/utils/alertThrottle'
import { SYNTHETIC_OPENAI_KEY } from '../helpers/secretShapes'

/**
 * The transport is found the way production finds it -- on the logger -- so this
 * breaks if it is ever detached or renamed. Its reference to the delivery
 * service is primed by hand because under vitest the constructor's lazy
 * `import()` never settles and records would park in `pendingLogs` instead.
 */
const transport = (logger as unknown as { transports: any[] }).transports.find(
  t => t.constructor.name === 'TelegramLogTransport'
) as any

const settle = () => new Promise(resolve => setTimeout(resolve, 10))

/** The transport throttles by fingerprint; keep unrelated cases apart. */
let n = 0
const unique = () => `case-${(n += 1)}`

/** Exactly the shape winston hands `Transport.log`: level, message, meta inline. */
const record = (message: string, meta: Record<string, unknown> = {}) => ({
  level: 'error',
  message,
  timestamp: '2026-09-16 00:00:00',
  ...meta,
})

const feed = async (message: string, meta: Record<string, unknown> = {}) => {
  transport.log(record(message, meta), () => undefined)
  await settle()
}

/** What `logError` was actually asked to publish. */
const sent = () => logError.mock.calls.at(-1)![0] as Record<string, string>
const headline = () => sent().error

beforeEach(() => {
  logError.mockClear()
  transport.telegramLogService = { isReady: () => true, logError }
  transport.isInitialized = true
})

describe('a secret in the MESSAGE never reaches the owner', () => {
  const HASH = 'AAER-ThisIsABotTokenSecretHash1234567'
  const BOT_TOKEN = `7712345678:${HASH}`

  it('masks a bot token carried in a Telegram file URL', async () => {
    await feed(
      `❌ getFile failed [${unique()}]: https://api.telegram.org/file/bot${BOT_TOKEN}/photos/file_42.jpg`
    )
    expect(logError).toHaveBeenCalledTimes(1)
    expect(headline(), `the token survived: ${headline()}`).not.toContain(HASH)
    // The diagnosis survives the scrubbing, or one blindness has replaced
    // another: the operator still needs to know which call failed.
    expect(headline()).toContain('getFile failed')
    expect(headline()).toContain('/photos/file_42.jpg')
  })

  it('masks a bare bot token that never sat in a URL', async () => {
    await feed(`❌ getMe rejected [${unique()}] for ${BOT_TOKEN}`)
    expect(headline()).not.toContain(HASH)
    expect(headline()).toContain('<bot token>')
  })

  it.each([
    ['an OpenAI key', SYNTHETIC_OPENAI_KEY],
    ['an xAI key', 'xai-9ZyXwVuTsRqPoNmLkJiHgFeD'],
    ['a Replicate token', 'r8_QwErTyUiOpAsDfGhJkLzXcVbN'],
    ['a GitHub token', 'ghp_1234567890abcdefghijKLMNOP'],
    ['a GitLab token', 'glpat-1234567890abcdefghij'],
  ])('masks %s quoted back by a 401 body', async (_what, secret) => {
    await feed(
      `❌ Ошибка provider [${unique()}]: 401 - Incorrect API key provided: ${secret}`
    )
    expect(logError).toHaveBeenCalledTimes(1)
    expect(headline(), `the key survived: ${headline()}`).not.toContain(secret)
    expect(headline()).toContain('<key>')
    expect(headline()).toContain('Incorrect API key provided')
  })

  it('leaves an ordinary headline exactly as it was', async () => {
    // A scrubber that reshapes every alert is a scrubber that gets reverted.
    const plain = `❌ Ошибка Supabase [${unique()}]: connection refused after 3 attempts`
    await feed(plain)
    expect(headline()).toBe(plain)
  })

  it('still scrubs the meta half, and still summarises a customer prompt', async () => {
    // The two halves share one rule; this is the regression guard for the half
    // that already had one.
    await feed(`❌ FLUX Kontext editing failed [${unique()}]`, {
      providerError: 'unauthorized: r8_QwErTyUiOpAsDfGhJkLzXcVbN',
      prompt: 'a cyberpunk detective in the rain, neon reflections',
      status: 402,
    })
    const details = sent().details
    expect(details).not.toContain('r8_QwErTyUiOpAsDfGhJkLzXcVbN')
    expect(details).not.toContain('cyberpunk')
    expect(details).toMatch(/<prompt: \d+ chars>/)
    expect(details).toContain('402')
  })
})

describe('the headline is not cut here, because the cut downstream keeps the tally', () => {
  /*
   * DELIBERATELY NOT CAPPED IN THE TRANSPORT.
   *
   * The 300-character ceiling in logger.ts is a per-VALUE rule for meta, where
   * one long value used to push the status code and the model off the end of a
   * shared blob. The headline has no such problem and it must NOT get a head-cut
   * here: `withSuppressedCount` appends the throttle tally to the END of the
   * title, and telegram-log.service.ts caps it at 500 by eliding the MIDDLE
   * precisely so that tally survives. A head-cut in this file would amputate the
   * one thing that distinguishes "it happened once" from "it is a storm".
   */
  it('passes a long title through whole, and the tally reaches the owner', async () => {
    const long = `[cap-${unique()}] ` + 'x'.repeat(2000)
    const nowSpy = vi.spyOn(Date, 'now')
    try {
      nowSpy.mockReturnValue(1_700_000_000_000)
      await feed(long)
      expect(logError).toHaveBeenCalledTimes(1)
      expect(
        headline().length,
        'logger.ts truncated the title; the tail is where the count lives'
      ).toBeGreaterThan(2000)

      await feed(long)
      expect(
        logError,
        'a repeat inside the window must be counted, not resent'
      ).toHaveBeenCalledTimes(1)

      nowSpy.mockReturnValue(1_700_000_000_000 + WINDOW_MS + 1)
      await feed(long)
      expect(logError).toHaveBeenCalledTimes(2)
      expect(
        headline().endsWith('то же самое)'),
        'the suppressed count was cut off the end of a long title'
      ).toBe(true)
      expect(headline()).toContain('+1')
    } finally {
      nowSpy.mockRestore()
    }
  })
})
