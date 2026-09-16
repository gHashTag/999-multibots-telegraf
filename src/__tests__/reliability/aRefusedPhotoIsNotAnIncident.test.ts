/**
 * A SAFETY FILTER DECLINING A STRANGER'S PHOTO IS NOT AN INCIDENT.
 *
 * `utils/logger.ts` binds TelegramLogTransport at level 'error' (:253), which
 * theLevelIsTheRoutingDecision.test.ts pins by driving the real transport. So
 * `logger.error` is a push notification to the owner's phone and the level is a
 * routing decision. Ask of every line: what would an operator DO with this at
 * 3am? When Kling, Google or Replicate refuse somebody's selfie the answer is
 * nothing -- no key to rotate, no service to restart, no quota to raise -- and
 * the fallback chain has already moved on.
 *
 * WHY THIS FILE WAS REWRITTEN. It used to assert all three sites by reading
 * their SOURCE, on the excuse that "the avatar scene is a 3000-line Telegraf
 * wizard needing four providers, a database and a photo". Two sibling suites
 * disproved that excuse -- anEmptyWalletDoesNotPageFromAScene.test.ts and
 * theSecondDoorDoesNotPage.test.ts both run this class of scene through its own
 * middleware -- and the excuse cost exactly what a source scan always costs:
 *
 *   expect(src).toMatch(/logger\[allRefusedForContent \? 'warn' : 'error'\]/)
 *
 * passes on the PRESENCE of a ternary. It passes if the condition is a
 * constant, it passes if the branch is unreachable, and it passed for this
 * scene's SECOND entry point -- the custom-prompt step 400 lines below the
 * block it was reading -- which at the time still logged every refusal at
 * error. A green ratchet over an unguarded door.
 *
 * So the two sites that can be driven are now driven: the scene runs through
 * the real wizard middleware with a real Telegraf Context, and
 * generateSeeDream45 is the SUBJECT, not a stub -- the ladder's refusals are
 * the real service's real throws. Only the edges are replaced (the user row,
 * the balance, the model call, the download, the charge, the other three
 * generators): no network, no money. Each case asserts WHICH logger method was
 * asked and WHAT reached the customer.
 *
 * localMorphingProcessor is the one site that genuinely cannot be driven -- the
 * Kling ladder lives in a module-private function and its only exported entry
 * needs ffmpeg, a temp tree and four exponential-backoff sleeps -- so it stays
 * structural, anchored so that a missing anchor THROWS. What that cannot prove
 * is written above the describe.
 *
 * Every "goes quiet" case is paired with a failure of OURS on the same code
 * path that must still page, because a demotion is only a fix if the machinery
 * still shouts.
 */
import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest'
import fs from 'node:fs'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  sliceFrom,
  sliceBetween,
} = require('../../../scripts/lib/anchored-slice.cjs')

const {
  getUser,
  getBalance,
  getAspect,
  run,
  download,
  saveFile,
  save,
  refund,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  getBalance: vi.fn(),
  getAspect: vi.fn(),
  run: vi.fn(),
  download: vi.fn(),
  saveFile: vi.fn(),
  save: vi.fn(),
  refund: vi.fn(),
}))

/*
 * The generator's edges, mocked at the LEAF modules rather than at the
 * '@/core/supabase' barrel: that graph is cyclic, and putting the real barrel
 * inside a mock factory makes the result depend on import order (the note in
 * anEmptyWalletDoesNotWakeTheOwner.test.ts records that being paid for once).
 * The barrel re-exports these files, so the mock arrives through it.
 */
vi.mock('@/core/supabase/getUserByTelegramIdString', () => ({
  getUserByTelegramIdString: getUser,
}))
vi.mock('@/core/supabase/getUserBalance', () => ({
  getUserBalance: getBalance,
  invalidateBalanceCache: vi.fn(),
  BalanceUnavailableError: class BalanceUnavailableError extends Error {},
}))
vi.mock('@/core/supabase/getAspectRatio', () => ({ getAspectRatio: getAspect }))
vi.mock('@/core/supabase/savePrompt', () => ({ savePrompt: save }))
vi.mock('@/core/replicate', () => ({ replicate: { run } }))
vi.mock('@/helpers/downloadFile', () => ({ downloadFile: download }))
vi.mock('@/helpers/saveFileLocally', () => ({ saveFileLocally: saveFile }))
vi.mock('@/price/helpers/processBalanceOperation', () => ({
  processBalanceOperation: vi.fn(async () => ({
    success: true,
    newBalance: 100,
  })),
}))
vi.mock('@/price/helpers/refundUser', () => ({ refundUser: refund }))
vi.mock('@/helpers/pulse', () => ({
  pulse: vi.fn(),
  sendMediaToPulse: vi.fn(),
}))

/*
 * The scene's edges. The known-good mock set for loading this 3200-line wizard,
 * taken from theSecondDoorDoesNotPage.test.ts. generateSeeDream45 is NOT in it:
 * it is the first rung of the ladder under test, and a stub of it would leave
 * the refusals in this file hand-written instead of thrown by the service that
 * ships.
 */
vi.mock('@/helpers/centralizedLanguage')
vi.mock('@/middlewares/getUserPhotoUrl')
vi.mock('@/core/supabase/checkAvatarTransformUsage')
vi.mock('@/core/supabase/markAvatarTransformUsed')
vi.mock('@/core/supabase/checkSuperheroGenerationUsage')
vi.mock('@/core/supabase/incrementSuperheroGeneration')
vi.mock('@/core/bot')
vi.mock('@/services/generateFluxKontextMax')
vi.mock('@/services/generateFluxKontext')
vi.mock('@/services/generateNanoBanana')
vi.mock('@/services/generateGptImage25')
vi.mock('@/helpers/sendPhotoWithFallback')
vi.mock('@/navigation', () => ({
  handleHelpCancel: vi.fn(async () => false),
  createHelpCancelKeyboard: vi.fn(() => ({ reply_markup: {} })),
  createMainMenuKeyboard: vi.fn(() => ({ keyboard: [] })),
  buttonMatcher: vi.fn(),
  safeEnterScene: vi.fn(),
  showMainMenu: vi.fn(async () => {}),
  getMainMenuText: vi.fn(() => 'Main menu'),
}))

import { Context } from 'telegraf'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { checkSuperheroGenerationUsage } from '@/core/supabase/checkSuperheroGenerationUsage'
import { generateSeeDream45 } from '@/services/generateSeeDream45'
import { generateGptImage25 } from '@/services/generateGptImage25'
import { generateNanoBanana } from '@/services/generateNanoBanana'
import { generateFluxKontextMax } from '@/services/generateFluxKontextMax'
import { generateFluxKontext } from '@/services/generateFluxKontext'
import { avatarTransformScene } from '@/scenes/avatarTransformScene'
// The real classes, deliberately not mocked: the scene and the service decide
// with `instanceof`, so a stand-in would prove nothing about the branch that
// ships.
import { ContentRefusalError } from '@/helpers/isContentRefusal'
import { BalanceRefusedError } from '@/price/helpers/refuseUnpaidGeneration'

const gptImage = generateGptImage25 as unknown as Mock
const nanoBanana = generateNanoBanana as unknown as Mock
const fluxMax = generateFluxKontextMax as unknown as Mock
const fluxLegacy = generateFluxKontext as unknown as Mock

/** Blank comments, keeping offsets, so prose cannot satisfy a code assertion. */
const stripComments = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/^([^'"`\n]*?)\/\/.*$/gm, (_m, keep) => keep)

const read = (file: string) => stripComments(fs.readFileSync(file, 'utf8'))

/**
 * The logger method that carries `message`, by walking back from the message
 * itself to the call that opens it. Anchored on the message: sliceFrom THROWS
 * when it is absent, so a renamed line fails loudly instead of leaving a
 * negative assertion to pass over nothing.
 */
function levelCarrying(src: string, message: string): string {
  const tail = sliceFrom(src, message)
  const before = src.slice(0, src.length - tail.length)
  const call = before.match(/logger\.(error|warn|info)\(\s*['"`][^'"`]*$/)
  if (!call) throw new Error(`no plain logger call carries: ${message}`)
  return call[1]
}

let error: { mock: { calls: any[][] } }
let warn: { mock: { calls: any[][] } }

/** Every message the owner would have been paged about, as plain text. */
const pages = () => error.mock.calls.map(c => String(c[0]))
const warnings = () => warn.mock.calls.map(c => String(c[0]))
/** The meta bag of the first line whose headline contains `needle`. */
const metaOf = (spy: { mock: { calls: any[][] } }, needle: string) =>
  spy.mock.calls.find(c => String(c[0]).includes(needle))?.[1]
/** Everything the customer was told, in one string. */
const said = (ctx: any) =>
  ctx.reply.mock.calls.map((c: any[]) => String(c[0])).join(' ')
/** Every callback_data under a message's keyboard, whatever shape it came in. */
const buttonsOf = (extra: any): string[] =>
  (extra?.reply_markup?.inline_keyboard ?? [])
    .flat()
    .map((b: any) => b?.callback_data ?? '')
/** The keyboard of the last thing the customer was sent. */
const lastButtons = (ctx: any): string[] => {
  const calls = ctx.reply.mock.calls
  return calls.length ? buttonsOf(calls[calls.length - 1][1]) : []
}

/**
 * The Telegram client a real Context needs. Typed `any` on purpose: these four
 * methods return message ids, and satisfying the real signatures would mean
 * hand-writing full Message objects for a value nothing here reads.
 */
function baseTelegram(): any {
  return {
    sendMessage: async () => ({ message_id: 2 }),
    sendPhoto: async () => ({ message_id: 4 }),
    sendChatAction: async () => true,
    deleteMessage: async () => true,
    callApi: async () => ({}),
  }
}

/** The Replicate/Kling refusal, verbatim, as the providers word it. */
const REFUSED = () => new Error('E005: image flagged as sensitive')
const PHOTO = 'https://example.com/user-photo.jpg'

beforeEach(() => {
  // Spied on the real logger object -- the same instance the Telegram transport
  // is attached to, so "which method" is the whole question.
  error = vi.spyOn(logger, 'error').mockImplementation(() => logger as any)
  warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger as any)
  vi.spyOn(logger, 'info').mockImplementation(() => logger as any)
  vi.spyOn(logger, 'debug').mockImplementation(() => logger as any)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)

  getUser.mockReset().mockResolvedValue({ id: 1, telegram_id: '1', level: 1 })
  getAspect.mockReset().mockResolvedValue('9:16')
  getBalance.mockReset().mockResolvedValue(1000)
  run.mockReset()
  download.mockReset().mockResolvedValue(Buffer.from('png'))
  saveFile.mockReset().mockResolvedValue('/tmp/seedream45-test.png')
  save.mockReset().mockResolvedValue('prompt-1')
  refund.mockReset().mockResolvedValue(undefined)

  gptImage.mockReset()
  nanoBanana.mockReset()
  fluxMax.mockReset()
  fluxLegacy.mockReset()

  // English, so the assertions read the English half of each reply; its Russian
  // twin is the line above it in the scene.
  vi.mocked(isRussianFromState).mockReturnValue(false)
  vi.mocked(checkSuperheroGenerationUsage).mockResolvedValue({
    canGenerate: true,
  } as any)
  // The hero list is picked at random; pinning the draw keeps the prompt, and
  // therefore the alert, identical from run to run.
  vi.spyOn(Math, 'random').mockReturnValue(0)
})

afterEach(() => {
  vi.restoreAllMocks()
})

/*
 * WHAT THIS DESCRIBE CANNOT PROVE, AND WHY IT IS STILL HERE.
 *
 * The Kling ladder lives in `generateSingleClipWithRetry`, which the module
 * does not export; the two exported entries (createMorphingVideo,
 * resumeMorphingFromCheckpoint) reach it through ffmpeg, a temp tree, axios
 * and MAX_RETRIES exponential-backoff sleeps. So these assertions read the
 * source and can prove only that the right method name stands next to the right
 * sentence. They cannot prove the branch is reachable, that the predicate ever
 * answers true, or that the level chosen at runtime is this one -- which is
 * exactly the blind spot that let this file bless an unguarded second door in
 * the avatar scene for a week. The predicate's own behaviour is driven in
 * isContentRefusal.test.ts; the runtime half for THIS file is missing and
 * stays missing until the ladder is extracted.
 *
 * Every anchor below throws when it is absent, so a rename fails loudly.
 */
describe('services/localMorphingProcessor.ts (structural: see the note above)', () => {
  const src = read('src/services/localMorphingProcessor.ts')

  it('does not raise the level just because the model ladder ran out', () => {
    // The identical fact one rung up is already a warn; reaching the last
    // model changed the level and nothing else.
    expect(
      levelCarrying(src, 'All Kling models rejected content'),
      'the end of the retry ladder pages about a refused photo'
    ).toBe('warn')
  })

  it('types the refusal so the outer catch does not page about it again', () => {
    // The thrown message is bilingual product copy naming no error code, so
    // the catch upstream cannot read a refusal out of the wording.
    expect(src).toMatch(/throw new ContentRefusalError\(/)
    expect(src).toMatch(/from '@\/helpers\/isContentRefusal'/)
  })

  it('asks what the failure was before choosing a level in the outer catch', () => {
    const branch = sliceFrom(
      src,
      'const contentRefusal = isContentRefusal(error)',
      400
    )
    expect(branch).toMatch(/logger\[contentRefusal \? 'warn' : 'error'\]/)
    expect(branch).toContain('[LOCAL MORPHING] Video generation failed')
  })

  it('STILL pages for everything that is ours', () => {
    for (const line of [
      'All attempts failed for clip',
      'Failed to download clip',
      'Failed to normalize clip',
      'Failed to get video resolution',
    ]) {
      expect(levelCarrying(src, line), `"${line}" stopped paging`).toBe('error')
    }
  })
})

describe('services/generateSeeDream45.ts: the level follows the cause', () => {
  /** The service, called the way a caller with a UI calls it. */
  function generatorCtx() {
    const ctx: any = {
      reply: vi.fn(async () => ({ message_id: 9 })),
      replyWithPhoto: vi.fn(async () => ({ message_id: 10 })),
      deleteMessage: vi.fn(async () => true),
      telegram: { deleteMessage: vi.fn(async () => true) },
      botInfo: { username: 'test_bot' },
      from: { id: 144022504, language_code: 'en' },
      session: {},
    }
    return ctx
  }

  const call = (ctx: any) =>
    generateSeeDream45({
      prompt: 'a portrait in the style of a 17th century engraving',
      inputImageUrl: PHOTO,
      telegram_id: '144022504',
      username: 'u',
      is_ru: false,
      ctx,
      size: '2K',
    })

  it('writes a refused photo down instead of sending it to the phone', async () => {
    run.mockRejectedValue(REFUSED())
    const ctx = generatorCtx()

    await expect(call(ctx)).rejects.toThrow('E005')

    expect(pages(), 'a refused selfie woke the owner').toEqual([])
    expect(warnings().join('\n')).toContain('[SeeDream4.5] NSFW_DETECTED')
  })

  it("does not read a rate limit out of the word 'generated'", async () => {
    /*
     * Driven through the real wrapper at :411 rather than asserted as a string:
     * the download fails, the service phrases it "Failed to process generated
     * image: ...", and 'rate' is inside 'generated'. That substring test used to
     * tell the owner a provider was throttling us -- with a retry nobody had
     * scheduled -- while the disk was full.
     */
    run.mockResolvedValue(['https://example.com/out.png'])
    download.mockRejectedValue(new Error('ENOSPC: no space left on device'))
    const ctx = generatorCtx()

    await expect(call(ctx)).rejects.toThrow('Failed to process generated image')

    const paged = pages().join('\n')
    expect(paged, 'a full disk stopped paging').toContain('[SeeDream4.5]')
    expect(
      paged,
      'a broken download is still called a rate limit'
    ).not.toContain('RATE_LIMIT')
    expect(
      paged,
      'the owner was promised a retry that is not scheduled'
    ).not.toContain('retry')
    // UNKNOWN is the only branch that appends the real message, which is the
    // one thing here an operator can act on.
    expect(paged).toContain('[SeeDream4.5] UNKNOWN')
    expect(paged).toContain('ENOSPC: no space left on device')
  })

  it('pages when the balance cannot be READ, which the label alone would not', async () => {
    // The label is sorted by the same two predicates as the level, and both are
    // narrow on purpose: a bare includes('balance') made this outage share a
    // branch with a customer who has no stars.
    getBalance.mockRejectedValue(new Error('Failed to fetch user balance'))
    const ctx = generatorCtx()

    await expect(call(ctx)).rejects.toThrow('Failed to fetch user balance')

    const paged = pages().join('\n')
    expect(paged, 'a balance we cannot read is an outage').toContain(
      '[SeeDream4.5]'
    )
    expect(paged).not.toContain('INSUFFICIENT_BALANCE')
    expect(
      warnings().join('\n'),
      'the outage was filed as a poor customer'
    ).not.toContain('[SeeDream4.5] INSUFFICIENT')
  })

  it('goes quiet for an empty wallet, and still offers the way to pay', async () => {
    getBalance.mockResolvedValue(0)
    const ctx = generatorCtx()

    const caught = await call(ctx).then(
      () => null,
      (e: unknown) => e
    )

    // Typed, because five sibling catch sites ask the flag and not the wording.
    expect(caught).toBeInstanceOf(BalanceRefusedError)
    expect((caught as BalanceRefusedError).insufficientFunds).toBe(true)
    expect(pages(), 'a customer four stars short rang the phone').toEqual([])
    expect(warnings().join('\n')).toContain(
      '[SeeDream4.5] INSUFFICIENT_BALANCE'
    )
    expect(
      buttonsOf(ctx.reply.mock.calls[0][1]),
      'the refusal must carry the way to pay'
    ).toContain('act:topup')
  })

  it('STILL pages when the stars could not be deducted after a success', async () => {
    // The picture exists and nobody was charged for it: the only person who can
    // settle that is an operator.
    const { processBalanceOperation } = await import(
      '@/price/helpers/processBalanceOperation'
    )
    vi.mocked(processBalanceOperation).mockResolvedValue({
      success: false,
      newBalance: 1000,
    } as any)
    run.mockResolvedValue(['https://example.com/out.png'])
    save.mockRejectedValue(new Error('supabase unreachable'))
    const ctx = generatorCtx()

    await expect(call(ctx)).rejects.toThrow('Failed to save generation record')

    expect(pages().join('\n')).toContain(
      'failed to deduct stars after generation'
    )
  })

  it('STILL pages when the refund after a post-charge failure fails', async () => {
    // Charged, then delivery threw, then the refund threw as well: money left
    // the customer and did not come back.
    run.mockResolvedValue(['https://example.com/out.png'])
    save.mockRejectedValue(new Error('supabase unreachable'))
    refund.mockRejectedValue(new Error('refund rpc refused'))
    const ctx = generatorCtx()

    await expect(call(ctx)).rejects.toThrow('Failed to save generation record')

    expect(
      refund,
      'the charge went through and nothing tried to undo it'
    ).toHaveBeenCalled()
    expect(pages().join('\n')).toContain(
      '[SeeDream4.5] Failed to refund after post-charge failure'
    )
  })
})

/*
 * The first of the scene's two doors: the hero ladder on step 4. Driven through
 * the real wizard middleware, with generateSeeDream45 REAL as its first rung --
 * so the refusal the ladder classifies is the one the service actually throws.
 */
describe('scenes/avatarTransformScene: the model ladder', () => {
  /** Step 4 of the wizard: the one that picks a hero and pays for a picture. */
  const HERO_LADDER_STEP = 4
  /** The button that skips hero validation; English, per the language mock. */
  const RANDOM_STYLE = '🎲 Random style'

  /*
   * A fresh telegram id per case. `superheroGenInFlight` (index.ts:930) is set
   * before the generation and deleted only on the success and quota paths, so a
   * reused id would make the second run return at the in-flight guard and every
   * assertion below would pass by never reaching the ladder.
   */
  let nextId = 1000000001
  const freshId = () => nextId++

  function ladderCtx(): any {
    const id = freshId()
    const update: any = {
      update_id: 1,
      message: {
        message_id: 1,
        date: 0,
        chat: { id, type: 'private' },
        from: { id, is_bot: false, first_name: 'U', username: 'u' },
        text: RANDOM_STYLE,
      },
    }
    const ctx: any = new Context(update, baseTelegram(), {
      username: 'test_bot',
    } as any)
    ctx.scene = {
      leave: vi.fn(async () => {}),
      current: { id: ModeEnum.AvatarTransform },
      state: {},
      session: { cursor: HERO_LADDER_STEP },
    }
    ctx.session = {
      selectedGender: 'male',
      selectedModel: 'seedream45',
      kontextImageUrl: PHOTO,
    }
    ctx.reply = vi.fn(async () => ({ message_id: 9 }))
    return ctx
  }

  const drive = (ctx: any) =>
    (avatarTransformScene as any).middleware()(ctx, async () => {})

  /** Make every model after the first refuse the photo the same way. */
  const theRestRefuse = () => {
    gptImage.mockRejectedValue(REFUSED())
    fluxMax.mockRejectedValue(REFUSED())
    fluxLegacy.mockRejectedValue(new ContentRefusalError('E005'))
    nanoBanana.mockRejectedValue(REFUSED())
  }

  it('reaches the ladder at all', async () => {
    // If this stops holding, every "does not page" below passes for the wrong
    // reason -- by never running the code under test.
    run.mockRejectedValue(new Error('Replicate returned 503'))
    gptImage.mockResolvedValue(null)
    fluxMax.mockRejectedValue(new Error('Replicate returned 503'))
    fluxLegacy.mockRejectedValue(new Error('Replicate returned 503'))
    nanoBanana.mockResolvedValue(null)
    const ctx = ladderCtx()

    await drive(ctx)

    expect(run, 'the real generator was never asked').toHaveBeenCalledTimes(1)
    expect(pages().join('\n')).toContain(
      '[AvatarTransformScene] All AI models failed'
    )
  })

  it('does not end the chain on one refused photo', async () => {
    // Unlike an empty wallet, a refusal decides nothing about the next
    // provider: it runs a different classifier and often says yes. That is the
    // entire reason the chain has four of them.
    run.mockRejectedValue(REFUSED())
    gptImage.mockResolvedValue('ok')
    const ctx = ladderCtx()

    await drive(ctx)

    expect(
      gptImage,
      'a refused photo ended the fallback chain'
    ).toHaveBeenCalledTimes(1)
    expect(pages()).toEqual([])
  })

  it('only goes quiet when EVERY attempted model refused the photo', async () => {
    run.mockRejectedValue(REFUSED())
    theRestRefuse()
    const ctx = ladderCtx()

    await drive(ctx)

    expect(pages(), 'four refusals of one selfie rang the phone').toEqual([])
    const quiet = warnings().join('\n')
    expect(quiet).toContain(
      '[AvatarTransformScene] every model refused the photo on content'
    )
    // The page that survives must say WHY: which models were tried, and which
    // of them refused rather than broke.
    const meta = metaOf(warn, 'every model refused the photo on content')
    expect(meta.attemptedModels).toEqual([
      'seedream45',
      'gpt-image-25',
      'flux-kontext',
      'nano-banana',
    ])
    expect(meta.contentRefusals).toEqual(meta.attemptedModels)
  })

  it('tells the refused customer about the filter, not about an outage', async () => {
    run.mockRejectedValue(REFUSED())
    theRestRefuse()
    const ctx = ladderCtx()

    await drive(ctx)

    expect(said(ctx)).toMatch(/safety filters rejected it/i)
    expect(said(ctx)).not.toMatch(/temporarily unavailable/i)
    // ...and whatever it says, it leaves the keyboard on.
    expect(lastButtons(ctx)).toContain('act:topup')
  })

  it('STILL pages when one model in the chain broke rather than refused', async () => {
    // An outage hiding behind one refused photo is exactly the trade this must
    // not make, so the test is the strict one: every model that was tried threw,
    // and every throw was a recognised refusal.
    run.mockRejectedValue(REFUSED())
    gptImage.mockRejectedValue(REFUSED())
    fluxMax.mockRejectedValue(new Error('Replicate returned 503'))
    fluxLegacy.mockRejectedValue(new Error('Replicate returned 503'))
    nanoBanana.mockRejectedValue(REFUSED())
    const ctx = ladderCtx()

    await drive(ctx)

    expect(pages().join('\n')).toContain(
      '[AvatarTransformScene] All AI models failed'
    )
    expect(said(ctx)).toMatch(/temporarily unavailable/i)
    const meta = metaOf(error, 'All AI models failed')
    expect(meta.contentRefusals).toEqual([
      'seedream45',
      'gpt-image-25',
      'nano-banana',
    ])
  })

  it('STILL pages when a model swallows its refusal and returns null', async () => {
    /*
     * generateGptImage25:340 and generateNanoBanana:532 catch their own errors
     * and return null, so a refusal from either never reaches the counter. This
     * pins the conservative direction of that gap: the count falls short of the
     * attempts and the chain keeps paging. If those two are ever made to speak,
     * this case must be revisited rather than deleted.
     */
    run.mockRejectedValue(REFUSED())
    gptImage.mockResolvedValue(null)
    fluxMax.mockRejectedValue(REFUSED())
    fluxLegacy.mockRejectedValue(new ContentRefusalError('E005'))
    nanoBanana.mockRejectedValue(REFUSED())
    const ctx = ladderCtx()

    await drive(ctx)

    expect(pages().join('\n')).toContain(
      '[AvatarTransformScene] All AI models failed'
    )
  })

  it('stops the chain for an empty wallet, and does not page about it', async () => {
    // The other half of the same decision, and the opposite answer: every model
    // reads the same balance against the same price, so the first refusal has
    // already decided the outcome. The throw here is the REAL one -- the
    // service's typed BalanceRefusedError, raised by its own pre-check.
    getBalance.mockResolvedValue(0)
    const ctx = ladderCtx()

    await drive(ctx)

    expect(gptImage, 'three retries that cannot succeed').not.toHaveBeenCalled()
    expect(pages(), 'an empty wallet rang the phone').toEqual([])
    expect(warnings().join('\n')).toContain(
      '[AvatarTransformScene] stopped the fallback chain: the balance is short'
    )
    expect(said(ctx)).toMatch(/Not enough stars/i)
    expect(lastButtons(ctx)).toContain('act:topup')
  })
})

/*
 * The SECOND door into the same two generators, a hundred lines below the
 * ladder: the custom-prompt step. The old source-scanning assertions in this
 * file could not see it at all -- they matched a ternary in the ladder and
 * reported the whole file green while this catch still logged every refusal at
 * error. theSecondDoorDoesNotPage.test.ts drives it against stubbed generators;
 * these three drive it against the real generateSeeDream45, so the throw the
 * step classifies is the throw the service produces.
 */
describe('scenes/avatarTransformScene: the custom-prompt door', () => {
  const CUSTOM_PROMPT_STEP = 6
  const PROMPT =
    'as a cyberpunk detective in the rain with neon reflections everywhere'

  let nextId = 2000000001

  function customPromptCtx(): any {
    const id = nextId++
    const update: any = {
      update_id: 1,
      message: {
        message_id: 1,
        date: 0,
        chat: { id, type: 'private' },
        from: { id, is_bot: false, first_name: 'U', username: 'u' },
        text: PROMPT,
      },
    }
    const ctx: any = new Context(update, baseTelegram(), {
      username: 'test_bot',
    } as any)
    ctx.scene = {
      leave: vi.fn(async () => {}),
      current: { id: ModeEnum.AvatarTransform },
      state: {},
      session: { cursor: CUSTOM_PROMPT_STEP },
    }
    ctx.session = {
      selectedGender: 'male',
      selectedModel: 'seedream45',
      kontextImageUrl: PHOTO,
    }
    ctx.reply = vi.fn(async () => ({ message_id: 9 }))
    return ctx
  }

  const drive = (ctx: any) =>
    (avatarTransformScene as any).middleware()(ctx, async () => {})

  it('STILL pages when the provider behind it is down', async () => {
    // Also the reachability control: this is the door, and it is open.
    run.mockRejectedValue(new Error('Replicate returned 503'))
    const ctx = customPromptCtx()

    await drive(ctx)

    expect(run, 'the step never reached the generator').toHaveBeenCalledTimes(1)
    expect(pages().join('\n')).toContain(
      '[AvatarTransformScene] Custom prompt generation failed'
    )
    expect(said(ctx)).toMatch(/Generation Error/i)
  })

  it('does not page when a safety filter declined the photo', async () => {
    run.mockRejectedValue(REFUSED())
    const ctx = customPromptCtx()

    await drive(ctx)

    expect(
      pages(),
      'nothing to restart, nothing to rotate -- the picture was not allowed'
    ).toEqual([])
    expect(warnings().join('\n')).toContain(
      '[AvatarTransformScene] custom prompt refused on content'
    )
    // Unlike the money case the advice is the RIGHT advice here, so only the
    // level moves: reword it, or send a different photo.
    expect(said(ctx)).toMatch(/Simplify description|Use different words/i)
  })

  it('does not page for an empty wallet, and leaves the top-up offer standing', async () => {
    /*
     * The service's own pre-check has already sent the top-up message with its
     * keyboard, so this step deliberately sends nothing more. What it must not
     * do is page: the wording that arrives here is INSUFFICIENT_FUNDS_SENTINEL,
     * recognised both by the flag on the type and by isBalanceRefusal.
     *
     * RECORDED, NOT ENDORSED -- and the branch's comment above ("the top-up
     * message is the last thing this person saw") is not true yet. Unlike the
     * ladder, this door calls generateSeeDream45 WITHOUT suppressUserErrors
     * (index.ts:3154), so the service's own catch (generateSeeDream45.ts
     * :617-623) still replies "An error occurred during image generation.
     * Please try later." AFTER the top-up message -- the very contradiction
     * this step stopped sending itself. The level is already right; the
     * customer's last line is not.
     *
     * Asserted as it IS, so the fix has to come through this file. Note what
     * the fix is NOT: `suppressUserErrors: true` here alone, measured, deletes
     * the top-up message too -- one flag gates both the refusal notice (:227)
     * and the apology (:617), and the service then hands the caller
     * `userAlreadyNotified: false` (:275) for a branch that replies nothing.
     * Either split the flag, or suppress and have the refusedForMoney branch
     * send the top-up itself when the type says nobody has. When either lands,
     * this expectation flips to .not.toMatch and the one above it stays.
     *
     * Driving the real service is what makes the apology visible at all --
     * theSecondDoorDoesNotPage.test.ts stubs the generator, so for it the
     * sentence does not exist.
     */
    getBalance.mockResolvedValue(0)
    const ctx = customPromptCtx()

    await drive(ctx)

    expect(pages(), 'a customer with no stars rang the phone').toEqual([])
    expect(warnings().join('\n')).toContain(
      '[AvatarTransformScene] custom prompt refused: the balance is short'
    )
    expect(said(ctx), 'the way to pay never arrived').toMatch(
      /Insufficient stars balance/i
    )
    expect(
      said(ctx),
      'the apology stopped following the top-up message -- flip this to .not.toMatch'
    ).toMatch(/An error occurred during image generation/i)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})
