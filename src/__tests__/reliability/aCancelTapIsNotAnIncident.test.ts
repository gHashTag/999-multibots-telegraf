/**
 * PRESSING CANCEL IS THE CUSTOMER'S OWN DECISION, AND IT USED TO WAKE THE OWNER.
 *
 * Every scene cancel handler in this repo has the same shape: acknowledge the
 * callback, reply, clear the session, leave the scene -- all inside one try
 * whose catch calls `logger.error`. Since `utils/logger.ts` binds
 * TelegramLogTransport at level 'error', that catch is a push notification to
 * the owner's phone, and the two realistic ways those calls fail are both the
 * person, not the machinery:
 *
 *   - a tap on yesterday's inline button -> `400: query is too old and
 *     response timeout expired`, thrown by `answerCbQuery`;
 *   - a chat that cannot receive anything -> `403: bot was blocked by the
 *     user`, thrown by `ctx.reply`.
 *
 * THE ACKNOWLEDGEMENT GUARD IS NOT COSMETIC, WHICH IS WHY IT IS ASSERTED ON
 * BEHAVIOUR. Before it, a stale tap threw on the FIRST line of the handler, so
 * the reply, the session clear and the `scene.leave` never ran: the person was
 * left sitting inside a paid wizard, and the owner was paged about it. The
 * tests below therefore check that the cancel COMPLETES, not merely that the
 * log line changed level -- classifying the catch alone would have left the
 * customer stuck.
 *
 * And the residual page is pinned in the other direction: a TypeError from our
 * own menu code still reaches `logger.error`. A catch downgraded wholesale to
 * `.catch(() => {})` would pass a one-sided test and hide a real defect.
 */
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'

// Hoisted: `vi.mock` factories are lifted above the imports, and two of them
// share this one spy -- the scenes reach the menu through different modules
// (`@/navigation` dynamically, `@/navigation/helpers/menuKeyboard` directly).
const { showMainMenu } = vi.hoisted(() => ({
  showMainMenu: vi.fn(async () => {}),
}))

vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => false),
}))
vi.mock('@/navigation', () => ({
  showMainMenu,
  getMainMenuText: vi.fn(() => 'menu'),
  handleHelpCancel: vi.fn(async () => false),
  createHelpCancelKeyboard: vi.fn(() => ({ reply_markup: {} })),
}))
vi.mock('@/navigation/helpers/menuKeyboard', () => ({
  showMainMenu,
  createMainMenuKeyboard: vi.fn(() => ({ reply_markup: {} })),
}))
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/helpers/saveFileLocally', () => ({ saveFileLocally: vi.fn() }))
vi.mock('@/helpers/downloadTelegramFile', () => ({
  downloadTelegramFileBuffer: vi.fn(),
}))
vi.mock('@/handlers/getBotToken', () => ({ getBotToken: vi.fn(() => 'tok') }))
vi.mock('@/core/bot/shouldShowRubles', () => ({
  shouldShowRubles: vi.fn(() => false),
}))
vi.mock('@/config/unified-video-models.config', () => ({
  getModelsByInputType: vi.fn(() => [{ id: 'morph-model', name: 'M' }]),
}))
vi.mock('@/services/generateMorphing', () => ({ generateMorphing: vi.fn() }))
vi.mock('@/modules/videoGenerator/helpers/priceHelper', () => ({
  processBalanceVideoOperationHelper: vi.fn(),
}))
vi.mock('@/price/helpers/refundUser', () => ({ refundUser: vi.fn() }))
vi.mock('@/helpers/images', () => ({ isValidImage: vi.fn(async () => true) }))
vi.mock('@/inngest_app/render-server-client', () => ({
  sendRenderAvatarVideoEvent: vi.fn(),
  createRenderAvatarPayload: vi.fn(),
}))
vi.mock('@/services/video-task-store', () => ({
  videoTaskStore: { create: vi.fn(), get: vi.fn(), update: vi.fn() },
}))
vi.mock('@/core/supabase/getUserBalance', () => ({ getUserBalance: vi.fn() }))
vi.mock('@/core/supabase/updateUserBalance', () => ({
  updateUserBalance: vi.fn(),
}))
vi.mock('@/price/helpers/refundAndTell', () => ({ refundAndTell: vi.fn() }))

import { Context } from 'telegraf'
import { logger } from '@/utils/logger'
import { morphingWizard } from '@/scenes/morphingWizard'
import { aiPhotoshopScene } from '@/scenes/aiPhotoshopScene'
import { aiReelsRenderWizard } from '@/scenes/lipSyncWizard/ai-reels-render-wizard'

const paged = logger.error as unknown as Mock
const quiet = logger.warn as unknown as Mock

/** Telegram's answer to a tap on a button from a previous day. */
const staleButton = () =>
  Object.assign(
    new Error(
      '400: Bad Request: query is too old and response timeout expired or query ID is invalid'
    ),
    {
      response: {
        error_code: 400,
        description:
          'Bad Request: query is too old and response timeout expired or query ID is invalid',
      },
    }
  )

/** Telegram's answer when the person has blocked the bot. */
const blockedBot = () =>
  Object.assign(new Error('403: Forbidden: bot was blocked by the user'), {
    response: {
      error_code: 403,
      description: 'Forbidden: bot was blocked by the user',
    },
  })

/** Telegram's answer to a second tap on Cancel, or a message older than 48h. */
const messageGone = () =>
  Object.assign(new Error('400: Bad Request: message to delete not found'), {
    response: {
      error_code: 400,
      description: 'Bad Request: message to delete not found',
    },
  })

const from = { id: 223757230, is_bot: false, first_name: 'U', username: 'u' }

function cancelCtx(data: string, sceneId: string) {
  const update: any = {
    update_id: 1,
    callback_query: {
      id: '1',
      from,
      message: { message_id: 1, date: 0, chat: { id: 1, type: 'private' } },
      chat_instance: 'ci',
      data,
    },
  }
  const telegram: any = {
    answerCbQuery: async () => true,
    sendMessage: async () => ({ message_id: 2 }),
    editMessageText: async () => true,
    deleteMessage: async () => true,
    callApi: async () => ({}),
  }
  const ctx: any = new Context(update, telegram, {
    username: 'test_bot',
  } as any)
  ctx.scene = {
    leave: vi.fn(async () => {}),
    enter: vi.fn(async () => {}),
    current: { id: sceneId },
    state: {},
    session: { cursor: 0 },
  }
  ctx.session = { morphingImages: [], aiReelsRender: { step: 1 } }
  ctx.answerCbQuery = vi.fn(async () => true)
  ctx.reply = vi.fn(async () => ({ message_id: 9 }))
  ctx.deleteMessage = vi.fn(async () => true)
  return ctx
}

const pages = () => paged.mock.calls.map(c => String(c[0]))
const warnings = () => quiet.mock.calls.map(c => String(c[0]))

const run = (scene: any, ctx: any) => scene.middleware()(ctx, async () => {})

beforeEach(() => {
  vi.clearAllMocks()
  showMainMenu.mockImplementation(async () => {})
})

describe('morphing cancel', () => {
  const ctxFor = () => cancelCtx('morphing_cancel', 'morphing_wizard')

  it('a stale button does not page, and the cancel still completes', async () => {
    const ctx = ctxFor()
    ctx.answerCbQuery.mockRejectedValue(staleButton())

    await run(morphingWizard, ctx)

    expect(pages(), 'a tap on an old button is not an incident').toEqual([])
    // The part that matters: the person is actually out of the wizard.
    expect(ctx.reply).toHaveBeenCalled()
    expect(ctx.scene.leave).toHaveBeenCalled()
    expect(showMainMenu).toHaveBeenCalled()
  })

  it('a blocked bot is reported quietly, not pushed', async () => {
    const ctx = ctxFor()
    ctx.reply.mockRejectedValue(blockedBot())

    await run(morphingWizard, ctx)

    expect(pages()).toEqual([])
    expect(warnings().join(' ')).toMatch(/customer is gone/i)
  })

  it('STILL pages when our own menu code throws', async () => {
    const ctx = ctxFor()
    showMainMenu.mockRejectedValue(new TypeError('x is not a function'))

    await run(morphingWizard, ctx)

    expect(
      pages().join(' '),
      'a defect in our navigation must not hide behind the customer'
    ).toMatch(/Error cancelling morphing wizard/)
  })
})

describe('AI Photoshop cancel', () => {
  const ctxFor = () => cancelCtx('ai_photoshop_cancel', 'ai_photoshop')

  it('a stale button does not page, and the cancel still completes', async () => {
    const ctx = ctxFor()
    ctx.answerCbQuery.mockRejectedValue(staleButton())

    await run(aiPhotoshopScene, ctx)

    expect(pages()).toEqual([])
    expect(ctx.reply).toHaveBeenCalled()
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('a blocked bot is reported quietly, not pushed', async () => {
    const ctx = ctxFor()
    ctx.reply.mockRejectedValue(blockedBot())

    await run(aiPhotoshopScene, ctx)

    expect(pages()).toEqual([])
    expect(warnings().join(' ')).toMatch(/customer is gone/i)
  })

  it('STILL pages when our own menu code throws', async () => {
    const ctx = ctxFor()
    showMainMenu.mockRejectedValue(new TypeError('x is not a function'))

    await run(aiPhotoshopScene, ctx)

    expect(pages().join(' ')).toMatch(/Error handling AI Photoshop cancel/)
  })
})

describe('AI Photoshop album cancel', () => {
  const ctxFor = () => cancelCtx('ai_photoshop_multi_cancel', 'ai_photoshop')

  it('an undeletable message does not page and does not swallow the cancel', async () => {
    const ctx = ctxFor()
    ctx.deleteMessage.mockRejectedValue(messageGone())

    await run(aiPhotoshopScene, ctx)

    expect(pages(), 'Telegram refusing to delete is not an incident').toEqual(
      []
    )
    // The unguarded delete used to throw past BOTH of these, so the person got
    // no confirmation and no way back -- a silent dead end plus a 3am page.
    expect(
      ctx.reply.mock.calls.length,
      'the confirmation and the model list must both still be sent'
    ).toBeGreaterThan(1)
  })

  it('a stale button does not page, and the cancel still completes', async () => {
    const ctx = ctxFor()
    ctx.answerCbQuery.mockRejectedValue(staleButton())

    await run(aiPhotoshopScene, ctx)

    expect(pages()).toEqual([])
    expect(ctx.reply).toHaveBeenCalled()
  })

  it('STILL pages when the model list itself fails to render', async () => {
    const ctx = ctxFor()
    // Not a Telegram rejection: something in our rendering path threw.
    ctx.reply.mockRejectedValue(new TypeError('models is not iterable'))

    await run(aiPhotoshopScene, ctx)

    expect(pages().join(' ')).toMatch(
      /Error cancelling multi-photo AI Photoshop/
    )
  })
})

describe('AI Reels render cancel', () => {
  const ctxFor = () => cancelCtx('ai_reels_cancel', 'ai_reels_render_wizard')

  it('a stale button does not page, and the cancel still completes', async () => {
    const ctx = ctxFor()
    ctx.answerCbQuery.mockRejectedValue(staleButton())

    await run(aiReelsRenderWizard, ctx)

    expect(pages()).toEqual([])
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('shows the main menu it promises in the reply', async () => {
    const ctx = ctxFor()

    await run(aiReelsRenderWizard, ctx)

    // The reply says the bot is returning to the main menu and strips the
    // keyboard; for four lip-sync wizards no menu ever followed, so the
    // sentence named a screen the code did not show.
    expect(showMainMenu).toHaveBeenCalled()
  })

  it('a main menu that fails to render does not page from the cancel', async () => {
    const ctx = ctxFor()
    showMainMenu.mockRejectedValue(blockedBot())

    await run(aiReelsRenderWizard, ctx)

    // showMainMenu owns its own reporting; calling it inside the try would
    // have made one person leaving cost two notifications.
    expect(pages()).toEqual([])
    expect(warnings().join(' ')).toMatch(/main menu was not shown/i)
  })
})
