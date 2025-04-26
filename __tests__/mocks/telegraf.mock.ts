/**
 * Полный мок Telegraf для тестирования
 * Содержит все основные компоненты и методы Telegraf для использования в тестах
 */

import { vi } from 'vitest'

// Определяем интерфейсы для типизации моков
interface IContext {
  update: any
  telegram: any
  session: any
  scene: any
  callbackQuery: any
  message: any
  from: any
  chat: any
  reply(text: string, extra?: any): Promise<any>
  replyWithPhoto(photo: any, extra?: any): Promise<any>
  replyWithDocument(document: any, extra?: any): Promise<any>
  replyWithVideo(video: any, extra?: any): Promise<any>
  replyWithAnimation(animation: any, extra?: any): Promise<any>
  replyWithAudio(audio: any, extra?: any): Promise<any>
  replyWithVoice(voice: any, extra?: any): Promise<any>
  replyWithMediaGroup(media: any, extra?: any): Promise<any>
  deleteMessage(messageId: any): Promise<boolean>
  editMessageText(text: string, extra?: any): Promise<any>
  editMessageReplyMarkup(markup: any): Promise<any>
  answerCbQuery(text: string, extra?: any): Promise<boolean>
}

interface IBaseScene {
  id: string
  enterHandler: any
  leaveHandler: any
  enter(handler: any): any
  leave(handler: any): any
  command(command: string, handler: any): any
  on(event: string, handler: any): any
  action(action: string | RegExp, handler: any): any
  use(middleware: any): any
  hears(trigger: string | RegExp | Array<string | RegExp>, handler: any): any
}

/**
 * Мок для класса Markup из Telegraf
 */
export const MockMarkup = {
  keyboard: vi.fn().mockImplementation(buttons => ({
    keyboard: buttons,
    resize_keyboard: true,
    one_time_keyboard: false,
    selective: false,
  })),
  inlineKeyboard: vi.fn().mockImplementation(buttons => ({
    inline_keyboard: buttons,
  })),
  removeKeyboard: vi.fn().mockReturnValue({ remove_keyboard: true }),
  forceReply: vi.fn().mockReturnValue({ force_reply: true }),
  button: vi.fn().mockImplementation((text, hide) => ({ text, hide })),
  callbackButton: vi
    .fn()
    .mockImplementation((text, data) => ({ text, callback_data: data })),
  urlButton: vi.fn().mockImplementation((text, url) => ({ text, url })),
  switchToChatButton: vi.fn().mockImplementation((text, value) => ({
    text,
    switch_inline_query: value,
  })),
  switchToCurrentChatButton: vi.fn().mockImplementation((text, value) => ({
    text,
    switch_inline_query_current_chat: value,
  })),
  gameButton: vi.fn().mockImplementation(text => ({ text, callback_game: {} })),
  payButton: vi.fn().mockImplementation(text => ({ text, pay: true })),
  loginButton: vi.fn().mockImplementation((text, url, opts) => ({
    text,
    login_url: { ...opts, url },
  })),
  webAppButton: vi
    .fn()
    .mockImplementation((text, url) => ({ text, web_app: { url } })),
}

/**
 * Мок для создания контекста Telegram
 * @param overrides - переопределения для контекста
 */
export function createMockContext(overrides = {}) {
  const defaultCtx = {
    telegram: {
      sendMessage: vi.fn().mockResolvedValue({}),
      sendPhoto: vi.fn().mockResolvedValue({}),
      sendVideo: vi.fn().mockResolvedValue({}),
      sendDocument: vi.fn().mockResolvedValue({}),
      sendMediaGroup: vi.fn().mockResolvedValue({}),
      deleteMessage: vi.fn().mockResolvedValue(true),
      editMessageText: vi.fn().mockResolvedValue({}),
      editMessageCaption: vi.fn().mockResolvedValue({}),
      editMessageReplyMarkup: vi.fn().mockResolvedValue({}),
      setChatMenuButton: vi.fn().mockResolvedValue(true),
      setMyCommands: vi.fn().mockResolvedValue(true),
      getChatMember: vi.fn().mockResolvedValue({ status: 'member' }),
      getChat: vi.fn().mockResolvedValue({ id: 123456789, type: 'private' }),
      pinChatMessage: vi.fn().mockResolvedValue(true),
      unpinChatMessage: vi.fn().mockResolvedValue(true),
      unpinAllChatMessages: vi.fn().mockResolvedValue(true),
      getUserProfilePhotos: vi
        .fn()
        .mockResolvedValue({ total_count: 0, photos: [] }),
      getFileLink: vi.fn().mockResolvedValue('https://example.com/file.jpg'),
      getMe: vi.fn().mockResolvedValue({
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
      enter: vi.fn().mockImplementation(sceneName => Promise.resolve()),
      reenter: vi.fn().mockImplementation(() => Promise.resolve()),
      leave: vi.fn().mockImplementation(() => Promise.resolve()),
      current: null,
      state: {},
    },
    wizard: {
      next: vi.fn().mockImplementation(() => Promise.resolve()),
      back: vi.fn().mockImplementation(() => Promise.resolve()),
      selectStep: vi.fn().mockImplementation(step => Promise.resolve()),
      step: 0,
      cursor: 0,
      state: {},
    },
    reply: vi.fn().mockImplementation((text, extra) =>
      Promise.resolve({
        message_id: 2,
        text,
        ...extra,
      })
    ),
    replyWithMarkdown: vi.fn().mockImplementation((text, extra) =>
      Promise.resolve({
        message_id: 2,
        text,
        parse_mode: 'Markdown',
        ...extra,
      })
    ),
    replyWithHTML: vi.fn().mockImplementation((text, extra) =>
      Promise.resolve({
        message_id: 2,
        text,
        parse_mode: 'HTML',
        ...extra,
      })
    ),
    replyWithPhoto: vi.fn().mockImplementation((photo, extra) =>
      Promise.resolve({
        message_id: 2,
        photo,
        ...extra,
      })
    ),
    replyWithVideo: vi.fn().mockImplementation((video, extra) =>
      Promise.resolve({
        message_id: 2,
        video,
        ...extra,
      })
    ),
    replyWithMediaGroup: vi
      .fn()
      .mockResolvedValue([{ message_id: 2 }, { message_id: 3 }]),
    replyWithDocument: vi.fn().mockImplementation((doc, extra) =>
      Promise.resolve({
        message_id: 2,
        document: doc,
        ...extra,
      })
    ),
    replyWithAudio: vi.fn().mockImplementation((audio, extra) =>
      Promise.resolve({
        message_id: 2,
        audio,
        ...extra,
      })
    ),
    replyWithVoice: vi.fn().mockImplementation((voice, extra) =>
      Promise.resolve({
        message_id: 2,
        voice,
        ...extra,
      })
    ),
    replyWithSticker: vi.fn().mockImplementation((sticker, extra) =>
      Promise.resolve({
        message_id: 2,
        sticker,
        ...extra,
      })
    ),
    replyWithLocation: vi
      .fn()
      .mockImplementation((latitude, longitude, extra) =>
        Promise.resolve({
          message_id: 2,
          location: { latitude, longitude },
          ...extra,
        })
      ),
    replyWithVenue: vi
      .fn()
      .mockImplementation((latitude, longitude, title, address, extra) =>
        Promise.resolve({
          message_id: 2,
          venue: { latitude, longitude, title, address },
          ...extra,
        })
      ),
    replyWithContact: vi
      .fn()
      .mockImplementation((phone_number, first_name, extra) =>
        Promise.resolve({
          message_id: 2,
          contact: { phone_number, first_name },
          ...extra,
        })
      ),
    replyWithChatAction: vi.fn().mockResolvedValue(true),
    replyWithGame: vi.fn().mockImplementation((game_short_name, extra) =>
      Promise.resolve({
        message_id: 2,
        game: { game_short_name },
        ...extra,
      })
    ),
    replyWithInvoice: vi.fn().mockImplementation((invoice, extra) =>
      Promise.resolve({
        message_id: 2,
        invoice,
        ...extra,
      })
    ),
    editMessageText: vi.fn().mockResolvedValue({ message_id: 1 }),
    editMessageCaption: vi.fn().mockResolvedValue({ message_id: 1 }),
    editMessageReplyMarkup: vi.fn().mockResolvedValue({ message_id: 1 }),
    editMessageLiveLocation: vi.fn().mockResolvedValue({ message_id: 1 }),
    stopMessageLiveLocation: vi.fn().mockResolvedValue({ message_id: 1 }),
    deleteMessage: vi.fn().mockResolvedValue(true),
    pinChatMessage: vi.fn().mockResolvedValue(true),
    unpinChatMessage: vi.fn().mockResolvedValue(true),
    unpinAllChatMessages: vi.fn().mockResolvedValue(true),
    leaveChat: vi.fn().mockResolvedValue(true),
    answerCbQuery: vi.fn().mockResolvedValue(true),
    answerInlineQuery: vi.fn().mockResolvedValue(true),
    answerShippingQuery: vi.fn().mockResolvedValue(true),
    answerPreCheckoutQuery: vi.fn().mockResolvedValue(true),
    answerGameQuery: vi.fn().mockResolvedValue(true),
    setChatMenuButton: vi.fn().mockResolvedValue(true),
    setMyCommands: vi.fn().mockResolvedValue(true),
    getChat: vi.fn().mockResolvedValue({ id: 123456789, type: 'private' }),
    getChatAdministrators: vi.fn().mockResolvedValue([]),
    getChatMember: vi.fn().mockResolvedValue({ status: 'member' }),
    getChatMembersCount: vi.fn().mockResolvedValue(1),
    getMyCommands: vi.fn().mockResolvedValue([]),
    getMyChatMenuButton: vi.fn().mockResolvedValue({ type: 'default' }),
    getUserProfilePhotos: vi
      .fn()
      .mockResolvedValue({ total_count: 0, photos: [] }),
    getFile: vi
      .fn()
      .mockResolvedValue({ file_id: 'test_file_id', file_size: 1024 }),
    getFileLink: vi.fn().mockResolvedValue('https://example.com/file.jpg'),
    setPassportDataErrors: vi.fn().mockResolvedValue(true),
    i18n: {
      t: vi.fn().mockImplementation(key => `Translated: ${key}`),
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
  constructor: vi.fn(),
  middleware: vi.fn(),
  register: vi.fn(),
  enter: vi.fn().mockImplementation(sceneName => {
    return async ctx => {
      await ctx.scene.enter(sceneName)
    }
  }),
  leave: vi.fn().mockImplementation(() => {
    return async ctx => {
      await ctx.scene.leave()
    }
  }),
}

/**
 * Мок для классов Scenes из Telegraf
 */
export const MockScenes = {
  BaseScene: vi.fn().mockImplementation((id, options = {}) => {
    return new MockBaseScene(id)
  }),
  WizardScene: vi.fn().mockImplementation((id, ...steps) => {
    const scene = new MockBaseScene(id)
    scene.steps = steps
    scene.stepHandler = vi.fn()
    return scene
  }),
  Stage: vi.fn().mockImplementation((scenes = [], options = {}) => {
    return MockStage
  }),
  session: vi.fn().mockImplementation(options => {
    return (ctx, next) => next()
  }),
  Context: {
    enter: vi.fn().mockImplementation((ctx, sceneName, init, silent) => {
      return ctx.scene.enter(sceneName)
    }),
    reenter: vi.fn().mockImplementation(ctx => {
      return ctx.scene.reenter()
    }),
    leave: vi.fn().mockImplementation(ctx => {
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

// Mock для Markup
export const Markup = {
  inlineKeyboard: vi.fn().mockImplementation(keyboard => ({
    reply_markup: { inline_keyboard: keyboard },
  })),
  removeKeyboard: vi.fn().mockImplementation(() => ({
    reply_markup: { remove_keyboard: true },
  })),
}

// Mock для Telegram
const telegram = {
  sendMessage: vi.fn().mockResolvedValue({}),
  sendPhoto: vi.fn().mockResolvedValue({}),
  sendDocument: vi.fn().mockResolvedValue({}),
  sendVideo: vi.fn().mockResolvedValue({}),
  sendAnimation: vi.fn().mockResolvedValue({}),
  sendAudio: vi.fn().mockResolvedValue({}),
  sendVoice: vi.fn().mockResolvedValue({}),
  sendMediaGroup: vi.fn().mockResolvedValue({}),
  deleteMessage: vi.fn().mockResolvedValue({}),
  editMessageText: vi.fn().mockResolvedValue({}),
  editMessageReplyMarkup: vi.fn().mockResolvedValue({}),
  getMe: vi.fn().mockResolvedValue({
    id: 123456789,
    is_bot: true,
    first_name: 'Test Bot',
    username: 'test_bot',
  }),
  getChat: vi.fn().mockResolvedValue({}),
  getChatAdministrators: vi.fn().mockResolvedValue([]),
  getChatMember: vi.fn().mockResolvedValue({}),
  leaveChat: vi.fn().mockResolvedValue({}),
  getFile: vi.fn().mockResolvedValue({
    file_id: 'test-file-id',
    file_unique_id: 'test-file-unique-id',
    file_size: 100,
    file_path: 'test-file-path',
  }),
}

// Mock для Context
export class Context implements IContext {
  update: any
  telegram: any
  session: any
  scene: any
  callbackQuery: any
  message: any
  from: any
  chat: any

  constructor(update: any = {}) {
    this.update = update
    this.telegram = telegram
    this.session = {}
    this.scene = {
      enter: vi.fn().mockResolvedValue(true),
      leave: vi.fn().mockResolvedValue(true),
      current: { id: null },
    }
    this.callbackQuery = update.callback_query || null
    this.message = update.message || null
    this.from =
      (update.message && update.message.from) ||
      (update.callback_query && update.callback_query.from) ||
      null
    this.chat = (update.message && update.message.chat) || null
  }

  reply(text: string, extra: any = {}) {
    return Promise.resolve({ message_id: 12345 })
  }

  replyWithPhoto(photo: any, extra: any = {}) {
    return Promise.resolve({ message_id: 12345 })
  }

  replyWithDocument(document: any, extra: any = {}) {
    return Promise.resolve({ message_id: 12345 })
  }

  replyWithVideo(video: any, extra: any = {}) {
    return Promise.resolve({ message_id: 12345 })
  }

  replyWithAnimation(animation: any, extra: any = {}) {
    return Promise.resolve({ message_id: 12345 })
  }

  replyWithAudio(audio: any, extra: any = {}) {
    return Promise.resolve({ message_id: 12345 })
  }

  replyWithVoice(voice: any, extra: any = {}) {
    return Promise.resolve({ message_id: 12345 })
  }

  replyWithMediaGroup(media: any, extra: any = {}) {
    return Promise.resolve([{ message_id: 12345 }])
  }

  deleteMessage(messageId: any) {
    return Promise.resolve(true)
  }

  editMessageText(text: string, extra: any = {}) {
    return Promise.resolve({ message_id: 12345 })
  }

  editMessageReplyMarkup(markup: any) {
    return Promise.resolve({ message_id: 12345 })
  }

  answerCbQuery(text: string, extra: any = {}) {
    return Promise.resolve(true)
  }
}

// Mock для Telegraf
export class Telegraf {
  token: string
  telegram: any
  middleware: any[]
  contextType: any

  constructor(token: string) {
    this.token = token
    this.telegram = telegram
    this.middleware = []
    this.contextType = Context
  }

  use(middleware: any) {
    this.middleware.push(middleware)
    return this
  }

  start(handler: any) {
    return this
  }

  command(command: string, handler: any) {
    return this
  }

  on(event: string, handler: any) {
    return this
  }

  action(action: string | RegExp, handler: any) {
    return this
  }

  hears(trigger: string | RegExp | Array<string | RegExp>, handler: any) {
    return this
  }

  catch(handler: any) {
    return this
  }

  launch() {
    return Promise.resolve(true)
  }

  stop() {
    return Promise.resolve(true)
  }

  webhookCallback() {
    return vi.fn()
  }
}

// Заменяем namespace Scenes на обычные экспорты
export class Stage {
  middleware() {
    return vi.fn()
  }
  register() {
    return this
  }
}

export class BaseScene implements IBaseScene {
  id: string
  enterHandler: any
  leaveHandler: any

  constructor(id: string) {
    this.id = id
    this.enterHandler = vi.fn()
    this.leaveHandler = vi.fn()
  }

  enter(handler: any) {
    this.enterHandler = handler
    return this
  }

  leave(handler: any) {
    this.leaveHandler = handler
    return this
  }

  command(command: string, handler: any) {
    return this
  }

  on(event: string, handler: any) {
    return this
  }

  action(action: string | RegExp, handler: any) {
    return this
  }

  use(middleware: any) {
    return this
  }

  hears(trigger: string | RegExp | Array<string | RegExp>, handler: any) {
    return this
  }
}

// Экспортируем объект Scenes для обеспечения обратной совместимости
export const Scenes = {
  Stage,
  BaseScene,
}

// Export default
export default Telegraf

// Перенаправление всех импортов на новую структуру моков
export * from './telegraf'
