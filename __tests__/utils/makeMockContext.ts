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
  sceneState: any = {}
): MyContext => {
  // Добавляем __scenes к базовой сессии
  const baseSession: MySession & { __scenes?: any } = {
    ...defaultSession,
    __scenes: sceneState
      ? { cursor: 0, state: sceneState } // Use provided state
      : { cursor: 0, state: {} }, // Provide default cursor and state
    ...sessionData,
  }

  const mockScene: Partial<
    Scenes.SceneContextScene<MyContext, Scenes.WizardSessionData>
  > = {
    enter: jest.fn(),
    leave: jest.fn(),
    reenter: jest.fn(),
    session: baseSession as Scenes.WizardSessionData, // Приводим тип
    state: sceneState,
    // current: undefined, // Опционально можно установить текущую сцену
  }

  // Создаем частичный контекст, чтобы установить ссылку на wizard.ctx
  const partialCtx: Partial<MyContext> = {}

  const mockWizard: Partial<Scenes.WizardContextWizard<MyContext>> = {
    next: jest.fn(),
    back: jest.fn(),
    state: {}, // Состояние Wizard
    cursor: 0, // Курсор Wizard
    step: jest.fn(), // Добавляем step
    selectStep: jest.fn(), // Добавляем selectStep
  }

  // Устанавливаем обратные ссылки
  // @ts-ignore
  mockScene.ctx = partialCtx as MyContext
  // @ts-ignore
  mockWizard.ctx = partialCtx as MyContext

  // Дополняем объект context
  Object.assign(partialCtx, {
    // @ts-ignore - Basic properties
    update: update as Update,
    message: (update as any).message,
    callback_query: (update as any).callback_query,
    from: (update as any).message?.from || (update as any).callback_query?.from,
    chat: (update as any).message?.chat,
    // Добавляем ctx.tg с базовыми методами
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
      }), // Мокаем getMe
      getFile: jest.fn(),
      getFileLink: jest.fn(),
      // Добавь другие методы tg по мере необходимости
    },
    telegram: {
      // Оставляем для совместимости, если где-то используется
      // @ts-ignore - Mock telegram methods as needed
      sendMessage: jest.fn(),
      answerCbQuery: jest.fn(),
      editMessageText: jest.fn(),
      deleteMessage: jest.fn(),
      sendPhoto: jest.fn(),
      sendDocument: jest.fn(),
      sendInvoice: jest.fn(), // Для платежей
      answerPreCheckoutQuery: jest.fn(), // Для платежей
      getMe: jest.fn(),
      getFile: jest.fn(),
      getFileLink: jest.fn(),
    },
    // @ts-ignore
    scene: mockScene as Scenes.SceneContextScene<
      MyContext,
      Scenes.WizardSessionData
    >,
    session: baseSession,
    reply: jest.fn(),
    answerCbQuery: jest.fn(),
    // @ts-ignore
    wizard: mockWizard as Scenes.WizardContextWizard<MyContext>,
    match: null, // Для обработчиков hears/action - Инициализируем как null
    i18n: {
      // @ts-ignore - Mock i18n if used
      t: (key: string) => key, // Просто возвращаем ключ
      // Используем language_code из ctx.from, если он есть
      locale: (lang?: string) =>
        (partialCtx as MyContext).from?.language_code || 'ru',
    },
    // Добавляем botInfo и state
    botInfo: {
      id: 42,
      is_bot: true,
      first_name: 'Test Bot',
      username: 'TestBot',
    }, // Пример botInfo
    state: {}, // Убедимся, что state инициализирован
    // Добавляем любые другие свойства, необходимые для MyContext
  })

  return partialCtx as MyContext
}

export default makeMockContext
