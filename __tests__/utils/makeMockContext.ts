import { Context, Scenes } from 'telegraf'
import { Update } from 'telegraf/types'
import { MyContext, MySession } from '@/interfaces' // Предполагаем интерфейсы
import { defaultSession } from '@/store' // Импортируем defaultSession

/**
 * Создает мок-объект контекста Telegraf для тестов.
 * @param update Частичный объект Update для имитации входящего сообщения/коллбека
 * @param sessionData Начальные данные сессии
 * @param sceneState Начальное состояние сцены
 */
export const makeMockContext = (
  update: Partial<Update> = { update_id: 1 },
  sessionData: Partial<MySession> = {},
  sceneState: { step: number } & Record<string, any> = { step: 0 } // Keep for WizardScenes if needed
): MyContext => {
  const baseSession: MySession & { __scenes?: Scenes.WizardSessionData } = {
    ...defaultSession,
    __scenes: {
      // Include scene session structure for compatibility, even for BaseScene
      current: '', // BaseScene might still use this?
      state: sceneState, // Keep state, might be used generically
      cursor: 0, // Keep cursor
    },
    ...sessionData,
  }

  const mockScene: Partial<
    Scenes.SceneContextScene<MyContext, Scenes.WizardSessionData>
  > = {
    enter: jest.fn(),
    leave: jest.fn(),
    reenter: jest.fn(),
    session: baseSession.__scenes, // Use the scenes part of the session
    state: sceneState,
  }

  const partialCtx: Partial<MyContext> = {}

  const mockWizard: Partial<Scenes.WizardContextWizard<MyContext>> = {
    next: jest.fn(),
    back: jest.fn(),
    state: sceneState, // Use sceneState here too for consistency
    cursor: 0,
    step: jest.fn(), // Correct mock: should be a simple jest.fn(), not returning number
    selectStep: jest.fn(),
  }

  // @ts-ignore - Assign scene first
  mockScene.ctx = partialCtx as MyContext
  // @ts-ignore - Assign wizard
  mockWizard.ctx = partialCtx as MyContext

  // --- Try to make the context more complete for Telegraf ---
  const fromUser = (update as any).message?.from ||
    (update as any).callback_query?.from || {
      id: 123,
      is_bot: false,
      first_name: 'MockUser',
    }
  const chat = (update as any).message?.chat ||
    (update as any).callback_query?.message?.chat || {
      id: 456,
      type: 'private',
      first_name: 'MockChat',
    }
  const message =
    (update as any).message || (update as any).callback_query?.message

  Object.assign(partialCtx, {
    update: update as Update,
    // Basic Telegraf context properties
    message: message,
    callback_query: (update as any).callback_query,
    from: fromUser,
    chat: chat,
    // Common methods
    reply: jest.fn(),
    replyWithPhoto: jest.fn(),
    replyWithDocument: jest.fn(),
    replyWithMarkdown: jest.fn(),
    replyWithHTML: jest.fn(),
    editMessageText: jest.fn(),
    editMessageReplyMarkup: jest.fn(),
    deleteMessage: jest.fn(),
    answerCbQuery: jest.fn(),
    answerPreCheckoutQuery: jest.fn(), // For payments
    // Scene and session
    scene: mockScene as Scenes.SceneContextScene<
      MyContext,
      Scenes.WizardSessionData
    >,
    session: baseSession,
    // Wizard context (might not be needed for BaseScene, but keep for compatibility)
    wizard: mockWizard as Scenes.WizardContextWizard<MyContext>,
    // Other potentially useful properties
    match: null, // Initialize match
    state: {}, // General purpose state
    botInfo: {
      id: 42,
      is_bot: true,
      first_name: 'Test Bot',
      username: 'TestBot',
    },
    // i18n
    i18n: {
      t: (key: string) => key, // Simple mock
      locale: (lang?: string) => fromUser?.language_code || 'ru',
    },
    // Ensure tg and telegram objects exist with common methods
    tg: {
      sendMessage: jest.fn(),
      answerCbQuery: jest.fn(),
      editMessageText: jest.fn(),
      deleteMessage: jest.fn(),
      sendPhoto: jest.fn(),
      sendDocument: jest.fn(),
      sendInvoice: jest.fn(),
      answerPreCheckoutQuery: jest.fn(),
      getMe: jest.fn().mockResolvedValue({
        id: 42,
        is_bot: true,
        first_name: 'Test Bot',
        username: 'TestBot',
      }),
      getFile: jest.fn(),
      getFileLink: jest.fn(),
    },
    telegram: {
      // Duplicate for compatibility if needed
      sendMessage: jest.fn(),
      answerCbQuery: jest.fn(),
      editMessageText: jest.fn(),
      deleteMessage: jest.fn(),
      sendPhoto: jest.fn(),
      sendDocument: jest.fn(),
      sendInvoice: jest.fn(),
      answerPreCheckoutQuery: jest.fn(),
      getMe: jest.fn().mockResolvedValue({
        id: 42,
        is_bot: true,
        first_name: 'Test Bot',
        username: 'TestBot',
      }),
      getFile: jest.fn(),
      getFileLink: jest.fn(),
    },
  })

  return partialCtx as MyContext
}

export default makeMockContext
