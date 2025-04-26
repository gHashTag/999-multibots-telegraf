/**
 * Полный мок Telegraf для тестирования в Jest
 * Содержит все основные компоненты и методы Telegraf
 */

// Создаем мок-функцию, аналогичную jest.fn()
function mockFn() {
  const fn = function (...args: any[]) {
    fn.mock.calls.push(args)
    return fn.mock.results[fn.mock.calls.length - 1]?.value
  }

  fn.mock = {
    calls: [],
    instances: [],
    invocationCallOrder: [],
    results: [],
  }

  fn.mockImplementation = implementation => {
    // Храним функцию реализации в замыкании
    const mockImpl = implementation
    fn.mock.results.push({ type: 'return', value: null })

    // Переопределяем внешнюю функцию fn
    const originalFn = fn
    const newFn = function (...args: any[]) {
      originalFn.mock.calls.push(args)
      const result = mockImpl ? mockImpl(...args) : undefined
      return result
    }

    // Копируем все свойства из оригинальной fn
    Object.assign(newFn, originalFn)
    return newFn
  }

  fn.mockReturnValue = value => {
    fn.mock.results.push({ type: 'return', value })
    return fn.mockImplementation(() => value)
  }

  fn.mockResolvedValue = value => {
    return fn.mockImplementation(() => Promise.resolve(value))
  }

  return fn
}

/**
 * Мок для класса Markup из Telegraf
 */
export const MockMarkup = {
  keyboard: mockFn().mockImplementation(buttons => ({
    keyboard: buttons,
    resize_keyboard: true,
    one_time_keyboard: false,
    selective: false,
  })),
  inlineKeyboard: mockFn().mockImplementation(buttons => ({
    inline_keyboard: buttons,
  })),
  removeKeyboard: mockFn().mockReturnValue({ remove_keyboard: true }),
  forceReply: mockFn().mockReturnValue({ force_reply: true }),
  button: mockFn().mockImplementation((text, hide) => ({ text, hide })),
  callbackButton: mockFn().mockImplementation((text, data) => ({
    text,
    callback_data: data,
  })),
  urlButton: mockFn().mockImplementation((text, url) => ({ text, url })),
  switchToChatButton: mockFn().mockImplementation((text, value) => ({
    text,
    switch_inline_query: value,
  })),
  switchToCurrentChatButton: mockFn().mockImplementation((text, value) => ({
    text,
    switch_inline_query_current_chat: value,
  })),
  gameButton: mockFn().mockImplementation(text => ({
    text,
    callback_game: {},
  })),
  payButton: mockFn().mockImplementation(text => ({ text, pay: true })),
  loginButton: mockFn().mockImplementation((text, url, opts) => ({
    text,
    login_url: { ...opts, url },
  })),
  webAppButton: mockFn().mockImplementation((text, url) => ({
    text,
    web_app: { url },
  })),
}

/**
 * Мок для создания контекста Telegram
 * @param overrides - переопределения для контекста
 */
export function createMockContext(overrides = {}) {
  const defaultCtx = {
    telegram: {
      sendMessage: mockFn().mockResolvedValue({}),
      sendPhoto: mockFn().mockResolvedValue({}),
      sendVideo: mockFn().mockResolvedValue({}),
      sendDocument: mockFn().mockResolvedValue({}),
      sendMediaGroup: mockFn().mockResolvedValue({}),
      deleteMessage: mockFn().mockResolvedValue(true),
      editMessageText: mockFn().mockResolvedValue({}),
      editMessageCaption: mockFn().mockResolvedValue({}),
      editMessageReplyMarkup: mockFn().mockResolvedValue({}),
      setChatMenuButton: mockFn().mockResolvedValue(true),
      setMyCommands: mockFn().mockResolvedValue(true),
      getChatMember: mockFn().mockResolvedValue({ status: 'member' }),
      getChat: mockFn().mockResolvedValue({ id: 123456789, type: 'private' }),
      pinChatMessage: mockFn().mockResolvedValue(true),
      unpinChatMessage: mockFn().mockResolvedValue(true),
      unpinAllChatMessages: mockFn().mockResolvedValue(true),
      getUserProfilePhotos: mockFn().mockResolvedValue({
        total_count: 0,
        photos: [],
      }),
      getFileLink: mockFn().mockResolvedValue('https://example.com/file.jpg'),
      getMe: mockFn().mockResolvedValue({
        id: 987654321,
        is_bot: true,
        first_name: 'Test Bot',
        username: 'test_bot',
      }),
    },
    from: {
      id: 123456789,
      first_name: 'Test',
      last_name: 'User',
      username: 'testuser',
      language_code: 'en',
    },
    chat: {
      id: 123456789,
      type: 'private',
      first_name: 'Test',
      last_name: 'User',
      username: 'testuser',
    },
    message: {
      message_id: 1,
      from: {
        id: 123456789,
        first_name: 'Test',
        last_name: 'User',
        username: 'testuser',
        language_code: 'en',
      },
      chat: {
        id: 123456789,
        type: 'private',
        first_name: 'Test',
        last_name: 'User',
        username: 'testuser',
      },
      date: Math.floor(Date.now() / 1000),
      text: 'Test message',
    },
    callbackQuery: null,
    inlineQuery: null,
    chosenInlineResult: null,
    channelPost: null,
    editedMessage: null,
    editedChannelPost: null,
    shippingQuery: null,
    preCheckoutQuery: null,
    poll: null,
    pollAnswer: null,
    myChatMember: null,
    chatMember: null,
    session: {
      __scenes: {
        current: null,
        state: {},
      },
      user: {
        telegram_id: '123456789',
        language_code: 'en',
        first_name: 'Test',
        last_name: 'User',
      },
    },
    scene: {
      enter: mockFn().mockImplementation(sceneName => Promise.resolve()),
      reenter: mockFn().mockImplementation(() => Promise.resolve()),
      leave: mockFn().mockImplementation(() => Promise.resolve()),
      current: null,
      state: {},
    },
    wizard: {
      next: mockFn().mockImplementation(() => Promise.resolve()),
      back: mockFn().mockImplementation(() => Promise.resolve()),
      selectStep: mockFn().mockImplementation(step => Promise.resolve()),
      step: 0,
      cursor: 0,
      state: {},
    },
    reply: mockFn().mockImplementation((text, extra) =>
      Promise.resolve({
        message_id: 2,
        text,
        ...extra,
      })
    ),
    replyWithMarkdown: mockFn().mockImplementation((text, extra) =>
      Promise.resolve({
        message_id: 2,
        text,
        parse_mode: 'Markdown',
        ...extra,
      })
    ),
    replyWithHTML: mockFn().mockImplementation((text, extra) =>
      Promise.resolve({
        message_id: 2,
        text,
        parse_mode: 'HTML',
        ...extra,
      })
    ),
    replyWithPhoto: mockFn().mockImplementation((photo, extra) =>
      Promise.resolve({
        message_id: 2,
        photo,
        ...extra,
      })
    ),
    replyWithVideo: mockFn().mockImplementation((video, extra) =>
      Promise.resolve({
        message_id: 2,
        video,
        ...extra,
      })
    ),
    replyWithMediaGroup: mockFn().mockResolvedValue([
      { message_id: 2 },
      { message_id: 3 },
    ]),
    replyWithDocument: mockFn().mockImplementation((doc, extra) =>
      Promise.resolve({
        message_id: 2,
        document: doc,
        ...extra,
      })
    ),
    editMessageText: mockFn().mockResolvedValue({ message_id: 1 }),
    editMessageCaption: mockFn().mockResolvedValue({ message_id: 1 }),
    editMessageReplyMarkup: mockFn().mockResolvedValue({ message_id: 1 }),
    deleteMessage: mockFn().mockResolvedValue(true),
    answerCbQuery: mockFn().mockResolvedValue(true),
    answerInlineQuery: mockFn().mockResolvedValue(true),
    getChat: mockFn().mockResolvedValue({ id: 123456789, type: 'private' }),
    getChatAdministrators: mockFn().mockResolvedValue([]),
    getChatMember: mockFn().mockResolvedValue({ status: 'member' }),
    getChatMembersCount: mockFn().mockResolvedValue(1),
    i18n: {
      t: mockFn().mockImplementation(key => `Translated: ${key}`),
    },
    botInfo: {
      id: 987654321,
      is_bot: true,
      first_name: 'Test Bot',
      username: 'test_bot',
    },
  }

  // Глубокий мерж с переопределениями
  const merged = deepMerge(defaultCtx, overrides)
  return merged
}

// Вспомогательная функция для глубокого слияния объектов
function deepMerge(target, source) {
  const output = { ...target }

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] })
        } else {
          output[key] = deepMerge(target[key], source[key])
        }
      } else {
        Object.assign(output, { [key]: source[key] })
      }
    })
  }

  return output
}

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item)
}

/**
 * Мок для класса Scenes.Stage из Telegraf
 */
export const MockStage = {
  constructor: mockFn(),
  middleware: mockFn(),
  register: mockFn(),
  enter: mockFn().mockImplementation(sceneName => {
    return async ctx => {
      await ctx.scene.enter(sceneName)
    }
  }),
  leave: mockFn().mockImplementation(() => {
    return async ctx => {
      await ctx.scene.leave()
    }
  }),
}

/**
 * Мок для классов Scenes из Telegraf
 */
export const MockScenes = {
  BaseScene: mockFn().mockImplementation((id, options = {}) => {
    return new MockBaseScene(id)
  }),
  WizardScene: mockFn().mockImplementation((id, ...steps) => {
    const scene = new MockBaseScene(id)
    scene.steps = steps
    scene.stepHandler = mockFn()
    return scene
  }),
  Stage: mockFn().mockImplementation((scenes = [], options = {}) => {
    return MockStage
  }),
  session: mockFn().mockImplementation(options => {
    return (ctx, next) => next()
  }),
  Context: {
    enter: mockFn().mockImplementation((ctx, sceneName, init, silent) => {
      return ctx.scene.enter(sceneName)
    }),
    reenter: mockFn().mockImplementation(ctx => {
      return ctx.scene.reenter()
    }),
    leave: mockFn().mockImplementation(ctx => {
      return ctx.scene.leave()
    }),
  },
}

/**
 * Мок для класса Scenes.BaseScene из Telegraf
 */
export class MockBaseScene {
  id: string
  options: any
  enterHandler: Function | null
  leaveHandler: Function | null
  actionHandlers: Array<{ triggers: string[]; handler: Function }> = []
  commandHandlers: Array<{ triggers: string[]; handler: Function }> = []
  hearsHandlers: Array<{ triggers: string[]; handler: Function }> = []
  onHandlers: Array<{ types: string[]; handler: Function }> = []
  middleware: Array<Function> = []
  steps?: Function[]
  stepHandler?: Function

  constructor(id: string, options = {}) {
    this.id = id
    this.options = options
    this.enterHandler = null
    this.leaveHandler = null
    this.actionHandlers = []
    this.commandHandlers = []
    this.hearsHandlers = []
    this.onHandlers = []
    this.middleware = []
  }

  enter(fn) {
    this.enterHandler = fn
    return this
  }

  leave(fn) {
    this.leaveHandler = fn
    return this
  }

  action(triggers, handler) {
    const normalizedTriggers = Array.isArray(triggers) ? triggers : [triggers]
    this.actionHandlers.push({ triggers: normalizedTriggers, handler })
    return this
  }

  command(triggers, handler) {
    const normalizedTriggers = Array.isArray(triggers) ? triggers : [triggers]
    this.commandHandlers.push({ triggers: normalizedTriggers, handler })
    return this
  }

  hears(triggers, handler) {
    const normalizedTriggers = Array.isArray(triggers) ? triggers : [triggers]
    this.hearsHandlers.push({ triggers: normalizedTriggers, handler })
    return this
  }

  on(types, handler) {
    const normalizedTypes = Array.isArray(types) ? types : [types]
    this.onHandlers.push({ types: normalizedTypes, handler })
    return this
  }

  use(middleware) {
    this.middleware.push(middleware)
    return this
  }
}
