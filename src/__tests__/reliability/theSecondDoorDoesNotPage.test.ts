/**
 * THE SCENE HAS TWO DOORS INTO THE SAME GENERATORS, AND ONE WAS UNGUARDED.
 *
 * `utils/logger.ts` binds TelegramLogTransport at level 'error', so in this
 * repository the LEVEL IS A ROUTING DECISION: logger.error rings the owner's
 * phone, logger.warn writes it down. The avatar scene's model ladder learned
 * that -- it asks isBalanceRefusal / isContentRefusal before choosing. Its
 * custom-prompt step calls the SAME two services (generateSeeDream45,
 * generateFluxKontextMax) a hundred lines further down and kept a flat
 * logger.error, so a customer with no stars and a selfie a safety filter
 * declined both paged the owner from there.
 *
 * The money case did the second, worse thing as well. generateSeeDream45 has
 * already replied "Insufficient stars balance... Top up and we continue" with
 * the top-up keyboard under it; the step then answered "Generation Error ...
 * Simplify description / Try again later", which is false and points the one
 * person in the product most willing to pay away from paying. The identical
 * message was removed at imageUpscalerWizard:112, aiPhotoshopScene:2353 and
 * registerCommands:1898.
 *
 * WHY THIS IS DRIVEN AND NOT GREPPED. A source-scanning test passes on
 * `logger[cond ? 'warn' : 'error']` however `cond` actually runs, and this
 * whole defect was a condition that existed one screen away and was not
 * applied. So each case below runs the REAL registered step through the real
 * wizard middleware and asserts on what the logger and the customer were
 * actually given. Only the generators and the data edges are mocked: no
 * network, no money.
 *
 * EVERY DEMOTION IS PAIRED WITH ITS MACHINERY TWIN. A change that silenced
 * both halves would pass a one-sided suite and cost the alert that matters --
 * so a failed charge, and a provider returning 503, must still page here.
 */
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'

// The known-good mock set for loading this 3200-line scene, taken from
// scenes/avatarTransformScene.test.ts. Bare automocks keep each module's
// shape, which matters: the scene imports named symbols from most of them.
vi.mock('@/helpers/centralizedLanguage')
vi.mock('@/middlewares/getUserPhotoUrl')
vi.mock('@/core/supabase/checkAvatarTransformUsage')
vi.mock('@/core/supabase/markAvatarTransformUsed')
vi.mock('@/core/supabase/checkSuperheroGenerationUsage')
vi.mock('@/core/supabase/incrementSuperheroGeneration')
vi.mock('@/core/bot')
vi.mock('@/services/generateSeeDream45')
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

/*
 * The logger is spied, but `detailsForAlert` is the REAL one. That function is
 * the choke point where a customer's words are replaced by their length before
 * anything reaches Telegram, and a stub of it would let this suite pass while
 * the prompt still shipped -- the exact failure alertsDoNotCarryTheCustomersPrompt
 * was written for.
 */
vi.mock('@/utils/logger', async importOriginal => {
  const actual = await importOriginal<typeof import('@/utils/logger')>()
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  }
})

import { Context } from 'telegraf'
import { logger, detailsForAlert } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { generateSeeDream45 } from '@/services/generateSeeDream45'
import { generateFluxKontextMax } from '@/services/generateFluxKontextMax'
import { avatarTransformScene } from '@/scenes/avatarTransformScene'
// The real class, deliberately not mocked: the step decides with `instanceof`,
// so a stand-in would prove nothing about the branch that ships.
import {
  BalanceRefusedError,
  INSUFFICIENT_FUNDS_SENTINEL,
} from '@/price/helpers/refuseUnpaidGeneration'

const paged = logger.error as unknown as Mock
const quiet = logger.warn as unknown as Mock
const seedream = generateSeeDream45 as unknown as Mock
const fluxMax = generateFluxKontextMax as unknown as Mock

/** Step 6 of the wizard: the one that takes a typed prompt and generates. */
const CUSTOM_PROMPT_STEP = 6

/** Long enough to pass the 10-character floor, distinctive enough to find. */
const PROMPT =
  'as a cyberpunk detective in the rain with neon reflections everywhere'

/** What the generator throws today for an empty wallet. */
const untypedShortBalance = () => new Error('Insufficient balance')

/** What refuseUnpaidGeneration throws for the same thing. */
const typedShortBalance = () =>
  new BalanceRefusedError({
    message: INSUFFICIENT_FUNDS_SENTINEL,
    insufficientFunds: true,
    reason: 'Insufficient funds. Top up and we continue.',
    userAlreadyNotified: true,
  })

/** What it throws when the charge failed for a reason that is OURS. */
const chargeBroke = () =>
  new BalanceRefusedError({
    message: 'Charge failed: balance write failed',
    insufficientFunds: false,
    reason: 'balance write failed',
    userAlreadyNotified: false,
  })

function baseTelegram(): any {
  return {
    sendMessage: async () => ({ message_id: 2 }),
    sendPhoto: async () => ({ message_id: 4 }),
    sendChatAction: async () => true,
    callApi: async () => ({}),
  }
}

/** A typed prompt parked on the custom-prompt step, with a photo and a model. */
function customPromptCtx(model: 'seedream45' | 'flux-kontext-max') {
  const update: any = {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: 1, type: 'private' },
      from: { id: 1613501411, is_bot: false, first_name: 'U', username: 'u' },
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
    selectedModel: model,
    kontextImageUrl: 'https://example.com/user-photo.jpg',
  }
  ctx.reply = vi.fn(async () => ({ message_id: 9 }))
  return ctx
}

const run = (ctx: any) =>
  (avatarTransformScene as any).middleware()(ctx, async () => {})

/** Every message the owner would have been paged about, as plain text. */
const pages = () => paged.mock.calls.map(c => String(c[0]))
const warnings = () => quiet.mock.calls.map(c => String(c[0]))
/** Everything the customer was told, in one string. */
const said = (ctx: any) =>
  ctx.reply.mock.calls.map((c: any[]) => String(c[0])).join(' ')

beforeEach(() => {
  vi.clearAllMocks()
  // English, so the assertions below read the English half of each reply; its
  // Russian twin is the line above it in the scene.
  vi.mocked(isRussianFromState).mockReturnValue(false)
})

describe('the custom-prompt door is reachable at all', () => {
  it('runs the step that calls the generator', async () => {
    // If this ever stops holding, every "does not page" below would pass for
    // the wrong reason -- by never reaching the catch under test.
    seedream.mockRejectedValue(untypedShortBalance())
    const ctx = customPromptCtx('seedream45')

    await run(ctx)

    expect(seedream).toHaveBeenCalledTimes(1)
    expect(said(ctx)).toMatch(/Custom prompt accepted/i)
  })
})

describe('an empty wallet at the custom-prompt door', () => {
  it('does not page the owner for the untyped throw shipping today', async () => {
    seedream.mockRejectedValue(untypedShortBalance())
    const ctx = customPromptCtx('seedream45')

    await run(ctx)

    expect(
      pages(),
      'a customer four stars short must not ring the phone'
    ).toEqual([])
    expect(warnings().join(' ')).toMatch(/balance is short/i)
  })

  it('does not page the owner once that throw becomes typed', async () => {
    // The parallel change to generateSeeDream45: BalanceRefusedError instead of
    // new Error('Insufficient balance'). The guard must be right both ways.
    seedream.mockRejectedValue(typedShortBalance())
    const ctx = customPromptCtx('seedream45')

    await run(ctx)

    expect(pages()).toEqual([])
    expect(warnings().join(' ')).toMatch(/balance is short/i)
  })

  it('reads the flag, not the wording, when the type carries one', async () => {
    /*
     * The point of typing the throw is that the prose stops being
     * load-bearing. This fixture is a refusal whose message a future edit has
     * reworded past `isBalanceRefusal`: only `insufficientFunds` can still
     * answer for it, so this case fails if the `instanceof` half is dropped.
     */
    seedream.mockRejectedValue(
      new BalanceRefusedError({
        message: 'Generation refused before start',
        insufficientFunds: true,
        reason: 'wallet empty',
        userAlreadyNotified: true,
      })
    )
    const ctx = customPromptCtx('seedream45')

    await run(ctx)

    expect(pages()).toEqual([])
  })

  it('does not contradict the top-up message with an error apology', async () => {
    seedream.mockRejectedValue(untypedShortBalance())
    const ctx = customPromptCtx('seedream45')

    await run(ctx)

    // generateSeeDream45:226-231 has already sent the top-up message WITH the
    // keyboard. This reply said the machine broke and to reword the prompt.
    expect(said(ctx)).not.toMatch(
      /Generation Error|Simplify description|Try again later/i
    )
  })

  it('still leaves the scene rather than parking the customer in it', async () => {
    // The demotion must not cost the exit: a bare `return` would have left the
    // person inside a wizard step that only accepts prompts.
    seedream.mockRejectedValue(untypedShortBalance())
    const ctx = customPromptCtx('seedream45')

    await run(ctx)

    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('covers the other model behind the same door', async () => {
    // Both branches of the `if` call a generator that refuses the same way; a
    // guard placed in one of them would be half a fix.
    fluxMax.mockRejectedValue(untypedShortBalance())
    const ctx = customPromptCtx('flux-kontext-max')

    await run(ctx)

    expect(fluxMax).toHaveBeenCalledTimes(1)
    expect(pages()).toEqual([])
    expect(said(ctx)).not.toMatch(/Generation Error/i)
  })
})

describe('a refused photo at the custom-prompt door', () => {
  it('does not page the owner when a safety filter declined it', async () => {
    // The Replicate/Kling wording, rethrown verbatim by generateSeeDream45:625.
    seedream.mockRejectedValue(new Error('E005: image flagged as sensitive'))
    const ctx = customPromptCtx('seedream45')

    await run(ctx)

    expect(
      pages(),
      'nothing to restart, nothing to rotate -- the picture was not allowed'
    ).toEqual([])
    expect(warnings().join(' ')).toMatch(/refused on content/i)
  })

  it('still tells the customer what to change', async () => {
    // Unlike the money case the advice is the RIGHT advice here, so only the
    // level moves: reword it, or send a different photo.
    seedream.mockRejectedValue(new Error('E005: image flagged as sensitive'))
    const ctx = customPromptCtx('seedream45')

    await run(ctx)

    expect(said(ctx)).toMatch(/Simplify description|Use different words/i)
  })
})

describe('our own machinery still wakes somebody', () => {
  it('STILL pages when the provider is down, and still apologises', async () => {
    seedream.mockRejectedValue(new Error('Replicate returned 503'))
    const ctx = customPromptCtx('seedream45')

    await run(ctx)

    expect(pages().join(' ')).toMatch(/Custom prompt generation failed/)
    expect(said(ctx)).toMatch(/Generation Error/i)
  })

  it('STILL pages when the charge failed for an operator reason', async () => {
    // insufficientFunds:false is a bad price or a failed balance write. The
    // customer may well have had the stars, so only an operator can settle it
    // -- and a guard written as a bare `instanceof BalanceRefusedError` would
    // silence exactly this.
    seedream.mockRejectedValue(chargeBroke())
    const ctx = customPromptCtx('seedream45')

    await run(ctx)

    expect(pages().join(' ')).toMatch(/Custom prompt generation failed/)
  })

  it('keeps the facts an operator can act on', async () => {
    seedream.mockRejectedValue(new Error('Replicate returned 503'))
    const ctx = customPromptCtx('seedream45')

    await run(ctx)

    const details = detailsForAlert(paged.mock.calls[0][1])!
    expect(details, 'the diagnosis was lost').toContain(
      'Replicate returned 503'
    )
    expect(
      details,
      'the alert no longer says which service was asked'
    ).toContain('seedream45')
  })

  it('does not publish what the customer wrote', async () => {
    /*
     * The surviving page used to carry the prompt verbatim: it was passed as
     * `customPrompt`, and detailsForAlert reports by size only the key names it
     * recognises. Renaming it to one of those names is what makes the choke
     * point apply here.
     */
    seedream.mockRejectedValue(new Error('Replicate returned 503'))
    const ctx = customPromptCtx('seedream45')

    await run(ctx)

    const details = detailsForAlert(paged.mock.calls[0][1])!
    expect(details, 'the prompt reached the alert').not.toContain(
      'cyberpunk detective'
    )
    expect(details).toContain(`<promptText: ${PROMPT.length} chars>`)
  })
})
