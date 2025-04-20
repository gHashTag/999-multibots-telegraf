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
  const baseSession: MySession = { ...defaultSession, ...sessionData } // Используем defaultSession и переданные данные

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

  const ctx: Partial<MyContext> = {
    // @ts-ignore - Basic properties
    update: update as Update,
    message: (update as any).message,
    callback_query: (update as any).callback_query,
    from: (update as any).message?.from || (update as any).callback_query?.from,
    chat: (update as any).message?.chat,
    telegram: {
      // @ts-ignore - Mock telegram methods as needed
      sendMessage: jest.fn(),
      answerCbQuery: jest.fn(),
      // ... другие методы API
    },
    // @ts-ignore
    scene: mockScene as Scenes.SceneContextScene<
      MyContext,
      Scenes.WizardSessionData
    >,
    session: baseSession,
    reply: jest.fn(),
    answerCbQuery: jest.fn(),
    wizard: {
      // @ts-ignore - Mock wizard properties
      next: jest.fn(),
      back: jest.fn(),
      state: {}, // Состояние Wizard
      cursor: 0, // Курсор Wizard
    },
    match: null, // Для обработчиков hears/action
    i18n: {
      // @ts-ignore - Mock i18n if used
      t: (key: string) => key, // Просто возвращаем ключ
      locale: (lang?: string) => sessionData.language_code || 'ru',
    },
    // Добавляем любые другие свойства, необходимые для MyContext
  }

  return ctx as MyContext
}

export default makeMockContext
