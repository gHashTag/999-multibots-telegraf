// Мок для Telegraf API
import { EventEmitter } from 'events'
import { Scenes } from './telegraf-scenes.mock'
import { vi } from 'vitest'

// Базовый класс Context
export class Context {
  constructor(update = {}, telegram = {}, options = {}) {
    this.update = update
    this.telegram = telegram
    this.options = options
    this.from = this.update?.message?.from || {}
    this.chat = this.update?.message?.chat || {}
    this.message = this.update?.message || {}
    this.callbackQuery = this.update?.callback_query || null
    this.session = {}
    this.state = {}
    this.scene = null
  }

  update: any
  telegram: any
  options: any
  from: any
  chat: any
  message: any
  callbackQuery: any
  session: any
  state: any
  scene: any

  reply(text: string, extra?: any) {
    return Promise.resolve({ message_id: 123, text })
  }

  replyWithHTML(text: string, extra?: any) {
    return this.reply(text, { ...extra, parse_mode: 'HTML' })
  }

  replyWithMarkdown(text: string, extra?: any) {
    return this.reply(text, { ...extra, parse_mode: 'Markdown' })
  }

  replyWithPhoto(photo: string, extra?: any) {
    return Promise.resolve({ message_id: 124, photo })
  }

  replyWithVideo(video: string, extra?: any) {
    return Promise.resolve({ message_id: 125, video })
  }

  replyWithDocument(doc: string, extra?: any) {
    return Promise.resolve({ message_id: 126, document: doc })
  }

  replyWithVoice(voice: string, extra?: any) {
    return Promise.resolve({ message_id: 127, voice })
  }

  deleteMessage(messageId?: number) {
    return Promise.resolve(true)
  }

  answerCbQuery(text?: string, extra?: any) {
    return Promise.resolve(true)
  }

  editMessageText(text: string, extra?: any) {
    return Promise.resolve({ message_id: this.message?.message_id, text })
  }

  editMessageCaption(caption: string, extra?: any) {
    return Promise.resolve({ message_id: this.message?.message_id, caption })
  }

  editMessageReplyMarkup(replyMarkup: any) {
    return Promise.resolve({
      message_id: this.message?.message_id,
      reply_markup: replyMarkup,
    })
  }
}

// Основной класс Telegraf
export class Telegraf extends EventEmitter {
  constructor(token: string, options: any = {}) {
    super()
    this.token = token
    this.options = options
    this.context = new Context()
    this.telegram = {
      sendMessage: (chatId: string | number, text: string, extra: any = {}) => {
        return Promise.resolve({ chat_id: chatId, text, ...extra })
      },
      sendPhoto: (chatId: string | number, photo: string, extra: any = {}) => {
        return Promise.resolve({ chat_id: chatId, photo, ...extra })
      },
      sendVideo: (chatId: string | number, video: string, extra: any = {}) => {
        return Promise.resolve({ chat_id: chatId, video, ...extra })
      },
      sendDocument: (
        chatId: string | number,
        document: string,
        extra: any = {}
      ) => {
        return Promise.resolve({ chat_id: chatId, document, ...extra })
      },
      sendVoice: (chatId: string | number, voice: string, extra: any = {}) => {
        return Promise.resolve({ chat_id: chatId, voice, ...extra })
      },
      deleteMessage: (chatId: string | number, messageId: number) => {
        return Promise.resolve(true)
      },
      editMessageText: (
        chatId: string | number,
        messageId: number,
        text: string,
        extra: any = {}
      ) => {
        return Promise.resolve({
          chat_id: chatId,
          message_id: messageId,
          text,
          ...extra,
        })
      },
      editMessageCaption: (
        chatId: string | number,
        messageId: number,
        caption: string,
        extra: any = {}
      ) => {
        return Promise.resolve({
          chat_id: chatId,
          message_id: messageId,
          caption,
          ...extra,
        })
      },
      editMessageReplyMarkup: (
        chatId: string | number,
        messageId: number,
        replyMarkup: any
      ) => {
        return Promise.resolve({
          chat_id: chatId,
          message_id: messageId,
          reply_markup: replyMarkup,
        })
      },
      answerCallbackQuery: (
        callbackQueryId: string,
        text?: string,
        extra?: any
      ) => {
        return Promise.resolve(true)
      },
    }
  }

  token: string
  options: any
  context: Context
  telegram: any

  use(middleware: any) {
    return this
  }

  on(event: string, handler: any) {
    super.on(event, handler)
    return this
  }

  command(command: string, handler: any) {
    return this
  }

  hears(trigger: any, handler: any) {
    return this
  }

  action(trigger: any, handler: any) {
    return this
  }

  start(handler: any) {
    return this.command('start', handler)
  }

  help(handler: any) {
    return this.command('help', handler)
  }

  launch(options?: any) {
    return Promise.resolve(this)
  }

  stop(reason?: string) {
    return Promise.resolve(true)
  }
}

// Тип для легальных HTML тегов для форматирования
export const fmt = {
  bold: (content: string) => `<b>${content}</b>`,
  italic: (content: string) => `<i>${content}</i>`,
  underline: (content: string) => `<u>${content}</u>`,
  strikethrough: (content: string) => `<s>${content}</s>`,
  code: (content: string) => `<code>${content}</code>`,
  pre: (content: string, language?: string) =>
    language
      ? `<pre><code class="language-${language}">${content}</code></pre>`
      : `<pre>${content}</pre>`,
  link: (content: string, url: string) => `<a href="${url}">${content}</a>`,
  mention: (content: string, username: string) =>
    `<a href="tg://user?id=${username}">${content}</a>`,
  spoiler: (content: string) => `<span class="tg-spoiler">${content}</span>`,
  text: (content: string) => content,
}

// Класс для создания клавиатур
export class Markup {
  static inlineKeyboard(buttons: any[][], options?: any) {
    return {
      reply_markup: { inline_keyboard: buttons, ...options },
    }
  }

  static keyboard(buttons: any[][], options?: any) {
    return {
      reply_markup: {
        keyboard: buttons,
        resize_keyboard: options?.resize || true,
        one_time_keyboard: options?.oneTime || false,
        selective: options?.selective || false,
        ...options,
      },
    }
  }

  static removeKeyboard(selective?: boolean) {
    return {
      reply_markup: { remove_keyboard: true, selective },
    }
  }

  static forceReply(selective?: boolean) {
    return {
      reply_markup: { force_reply: true, selective },
    }
  }

  static button(text: string, data: string) {
    return { text, callback_data: data }
  }

  static urlButton(text: string, url: string) {
    return { text, url }
  }

  static switchToChatButton(text: string, value: string) {
    return { text, switch_inline_query: value }
  }

  static switchToCurrentChatButton(text: string, value: string) {
    return { text, switch_inline_query_current_chat: value }
  }

  static webAppButton(text: string, url: string) {
    return { text, web_app: { url } }
  }

  static callbackButton(text: string, data: string) {
    return { text, callback_data: data }
  }

  static payButton(text: string) {
    return { text, pay: true }
  }

  static loginButton(text: string, url: string, options?: any) {
    return {
      text,
      login_url: {
        url,
        forward_text: options?.forward_text,
        bot_username: options?.bot_username,
        request_write_access: options?.request_write_access,
      },
    }
  }

  static gameButton(text: string) {
    return { text, callback_game: {} }
  }
}

// Mock для Markup
export const MockMarkup = {
  keyboard: vi.fn().mockReturnThis(),
  resize: vi.fn().mockReturnThis(),
  oneTime: vi.fn().mockReturnThis(),
  inlineKeyboard: vi.fn().mockReturnThis(),
  removeKeyboard: vi.fn().mockReturnThis(),
  selective: vi.fn().mockReturnThis(),
  placeholder: vi.fn().mockReturnThis(),
  webApp: vi.fn().mockReturnThis(),
  forceReply: vi.fn().mockReturnThis(),
  extra: vi.fn().mockReturnThis(),
}

// Mock для дополнительных функций, которые могут потребоваться
export const teleprafMocks = {
  Markup: MockMarkup,
  // Добавьте здесь другие моки, если они понадобятся
}

// Экспорт модуля
export { Scenes }
export default {
  Telegraf,
  Context,
  Markup,
  Scenes,
  fmt,
  ...teleprafMocks,
}
