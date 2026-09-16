/**
 * "safety checker service unavailable" IS OUR MACHINERY, NOT SOMEBODY'S SELFIE.
 *
 * `utils/logger.ts` binds TelegramLogTransport at level 'error', which
 * theLevelIsTheRoutingDecision.test.ts pins by driving the real transport. So
 * the level a catch block picks is a ROUTING decision: `logger.error` rings the
 * owner's phone, `logger.warn` writes it down.
 *
 * Two files picked that level with the expression `isContentRefusal` was
 * written to abolish:
 *
 *     includes('e005') || includes('flagged as sensitive') ||
 *     includes('nsfw') || includes('safety')
 *
 * The last two words are bare. "safety checker service unavailable" and "NSFW
 * classifier unavailable" are a moderation hop of OURS dying, and each contains
 * the word that bought silence -- so every generation in the scene and every
 * FLUX Kontext edit could fail for hours with nothing reaching anybody.
 * generateSeeDream45.ts, handed the identical wording, pages: same class, two
 * files, opposite answers.
 *
 * WHAT IS DRIVEN AND WHAT IS READ. generateAdvancedFluxKontext is reachable
 * with the provider edges mocked, so its four cases below are DRIVEN and assert
 * on what the logger was actually asked to do. processSingleAiPhotoshopModel is
 * a module-private function inside a 5,000-line Telegraf wizard needing a
 * photo, a database and four providers, so its routing is asserted
 * STRUCTURALLY over an anchored region -- the same technique as
 * aRefusedPhotoIsNotAnIncident.test.ts -- and the predicate it now delegates to
 * is driven directly underneath.
 *
 * Every "goes quiet" case is paired with a "still pages" one. A demotion is
 * only a fix if our own machinery still shouts.
 */
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sliceBetween } = require('../../../scripts/lib/anchored-slice.cjs')

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logSessionSafely: vi.fn(),
}))
vi.mock('@/core/replicate', () => ({ replicate: { run: vi.fn() } }))
vi.mock('@/core/supabase', () => ({
  savePrompt: vi.fn(),
  getUserByTelegramIdString: vi.fn(),
  updateUserLevelPlusOne: vi.fn(),
  getUserBalance: vi.fn(),
  getAspectRatio: vi.fn(async () => '1:1'),
}))
vi.mock('@/helpers/pulse', () => ({ pulse: vi.fn() }))
vi.mock('@/price/helpers/refundUser', () => ({ refundUser: vi.fn() }))

import { logger } from '@/utils/logger'
import { getUserByTelegramIdString, getUserBalance } from '@/core/supabase'
import { generateAdvancedFluxKontext } from '@/services/generateFluxKontext'
// The real predicate and the real error class: the branches under test decide
// with them, so a stand-in would prove nothing about what ships.
import { isContentRefusal } from '@/helpers/isContentRefusal'
import { BalanceRefusedError } from '@/price/helpers/refuseUnpaidGeneration'

const paged = logger.error as unknown as Mock
const quiet = logger.warn as unknown as Mock
const lookupUser = getUserByTelegramIdString as unknown as Mock
const readBalance = getUserBalance as unknown as Mock

/** Every headline the owner would have been paged about. */
const pages = () => paged.mock.calls.map(c => String(c[0]))
const warnings = () => quiet.mock.calls.map(c => String(c[0]))

function fluxParams(): any {
  return {
    prompt: 'make the sky bluer',
    mode: 'single',
    modelType: 'pro',
    imageA: 'https://example.com/a.jpg',
    telegram_id: '424242',
    username: 'u',
    is_ru: false,
    silent: true,
    ctx: {
      telegram: { sendMessage: vi.fn(async () => ({ message_id: 1 })) },
      botInfo: { username: 'test_bot' },
      session: {},
    },
  }
}

/**
 * Run the service and swallow the rethrow. The failure is injected at the first
 * awaited call rather than at the moderation hop itself, which sits behind an
 * image download and a provider poll: the catch under test cannot tell where
 * its error came from -- it only reads the error -- so the injection point is
 * not part of what is being measured.
 */
async function failWith(error: unknown) {
  lookupUser.mockRejectedValue(error)
  await expect(generateAdvancedFluxKontext(fluxParams())).rejects.toBeTruthy()
}

beforeEach(() => {
  vi.clearAllMocks()
  readBalance.mockResolvedValue(1000)
})

describe('generateAdvancedFluxKontext: our own moderation hop still pages', () => {
  it('STILL pages when the safety checker is the thing that is down', async () => {
    await failWith(new Error('safety checker service unavailable'))

    expect(
      pages().join(' '),
      'the word "safety" in an outage used to buy silence'
    ).toMatch(/Advanced FLUX Kontext editing failed/)
    expect(warnings().join(' ')).not.toMatch(/blocked by content moderation/)
  })

  it('STILL pages when the NSFW classifier is the thing that is down', async () => {
    await failWith(new Error('NSFW classifier unavailable'))

    expect(pages().join(' ')).toMatch(/Advanced FLUX Kontext editing failed/)
    expect(warnings().join(' ')).not.toMatch(/blocked by content moderation/)
  })

  it('STILL pages for an ordinary provider outage', async () => {
    // The control for the two above: if this went quiet the demotion would have
    // swallowed everything and the two assertions above would mean nothing.
    await failWith(new Error('replicate 503 Service Unavailable'))

    expect(pages().join(' ')).toMatch(/Advanced FLUX Kontext editing failed/)
  })
})

describe('generateAdvancedFluxKontext: a refused photo is not an incident', () => {
  it('goes quiet when the provider refused the picture', async () => {
    await failWith(new Error('Image flagged as sensitive (E005)'))

    expect(pages(), 'a refused photo has nothing an operator can do').toEqual(
      []
    )
    expect(warnings().join(' ')).toMatch(/blocked by content moderation/)
  })

  it('goes quiet when the prompt itself was refused', async () => {
    await failWith(new Error('NSFW content detected'))

    expect(pages()).toEqual([])
    expect(warnings().join(' ')).toMatch(/blocked by content moderation/)
  })

  it('leaves the empty wallet to the branch that reads the TYPE', async () => {
    /*
     * ORDER IS THE PROPERTY HERE. The content test runs BEFORE the wallet test,
     * so a loose content test does not merely mis-route a refused photo -- it
     * short-circuits the typed wallet verdict underneath it. This drives the
     * real pre-charge refusal: a user exists, the balance is zero, and the
     * service throws its own BalanceRefusedError.
     */
    lookupUser.mockResolvedValue({ level: 1 })
    readBalance.mockResolvedValue(0)

    const params = fluxParams()
    await expect(generateAdvancedFluxKontext(params)).rejects.toBeInstanceOf(
      BalanceRefusedError
    )

    expect(pages(), 'an empty wallet is not an outage').toEqual([])
    expect(
      warnings().join(' '),
      'and it is the wallet branch that must claim it, not the content one'
    ).toMatch(/Advanced FLUX Kontext editing failed/)
    expect(warnings().join(' ')).not.toMatch(/blocked by content moderation/)
  })
})

describe('the vocabulary both files now share', () => {
  // Both sides, because a predicate that answered false to everything would
  // satisfy every "still pages" assertion above on its own.
  it('refuses to read a dead checker as a refused photo', () => {
    expect(
      isContentRefusal(new Error('safety checker service unavailable'))
    ).toBe(false)
    expect(isContentRefusal(new Error('nsfw filter timed out'))).toBe(false)
    expect(isContentRefusal(new Error('NSFW classifier unavailable'))).toBe(
      false
    )
  })

  it('still recognises the wording these two files actually see', () => {
    expect(isContentRefusal(new Error('Image flagged as sensitive'))).toBe(true)
    expect(isContentRefusal(new Error('Prediction failed: E005'))).toBe(true)
    expect(isContentRefusal(new Error('NSFW content detected'))).toBe(true)
  })
})

describe('scenes/aiPhotoshopScene/index.ts: the live catch asks the shared question', () => {
  /** Blank comments, keeping offsets, so prose cannot satisfy a code assertion. */
  const stripComments = (text: string) =>
    text
      .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
      .replace(/^([^'"`\n]*?)\/\/.*$/gm, (_m, keep) => keep)

  const src = stripComments(
    fs.readFileSync(
      path.resolve(__dirname, '../../scenes/aiPhotoshopScene/index.ts'),
      'utf8'
    )
  )

  /*
   * ANCHORED TO THE LIVE FUNCTION, BOTH ENDS.
   *
   * There are two catches in this file carrying that expression. The one at
   * ~3265 is documented dead -- processSingleAiPhotoshopModel contains no
   * `throw` anywhere in its body, so nothing can reach the catch that wraps the
   * call to it -- and it sits EARLIER in the file. Anchoring from the
   * function's own definition therefore measures the live branch and only the
   * live branch: an unanchored scan would be satisfied, or broken, by the dead
   * one.
   */
  const liveFunction = () =>
    sliceBetween(
      src,
      'const processSingleAiPhotoshopModel = async (',
      'Error in processSingleAiPhotoshopModel for'
    )

  it('no longer decides the level on the bare word "safety"', () => {
    const body = liveFunction()
    expect(
      body,
      '"safety checker service unavailable" contains it, and that is an outage'
    ).not.toMatch(/includes\(\s*['"]safety['"]\s*\)/)
    expect(
      body,
      '"NSFW classifier unavailable" contains it, and that is an outage too'
    ).not.toMatch(/includes\(\s*['"]nsfw['"]\s*\)/)
  })

  it('delegates to the one vocabulary instead of keeping a second copy', () => {
    expect(src).toMatch(/from '@\/helpers\/isContentRefusal'/)
    expect(liveFunction()).toContain(
      'const isContentModeration = isContentRefusal(error)'
    )
  })

  it('and STILL pages for everything that answer does not cover', () => {
    // The other half. A branch that demoted unconditionally would pass the two
    // assertions above.
    const body = liveFunction()
    expect(body).toMatch(/if \(isContentModeration\)/)
    expect(body).toMatch(/logger\.warn\(/)
    expect(
      src.slice(
        src.indexOf('Error in processSingleAiPhotoshopModel for') - 200
      ),
      'the machinery branch must still reach logger.error'
    ).toMatch(/logger\.error\(`Error in processSingleAiPhotoshopModel for/)
  })
})
