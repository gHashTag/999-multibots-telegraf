import { Context } from 'telegraf'
import { Update, User, Message, Chat } from 'telegraf/types'

export interface TestUser {
  telegram_id: string
  username: string
  balance?: number
  subscription_end_date?: Date
  created_at?: Date
  updated_at?: Date
}

// Конфигурация для методов
interface MethodConfig {
  success?: boolean
  delay?: number
  error?: Error
  response?: any
}

interface TelegramConfig {
  sendMessage?: MethodConfig
  editMessageText?: MethodConfig
  deleteMessage?: MethodConfig
  answerCallbackQuery?: MethodConfig
  sendPhoto?: MethodConfig
  sendDocument?: MethodConfig
  sendVoice?: MethodConfig
  sendSticker?: MethodConfig
  sendLocation?: MethodConfig
  getMe?: MethodConfig
  getFile?: MethodConfig
  getFileLink?: MethodConfig
  getUpdates?: MethodConfig
  setWebhook?: MethodConfig
  deleteWebhook?: MethodConfig
  getWebhookInfo?: MethodConfig
}

interface CreateMockContextParams {
  user: TestUser
  text?: string
  photo?: {
    file_id: string
    width: number
    height: number
  }
  document?: {
    file_id: string
    file_name: string
  }
  voice?: {
    file_id: string
    duration: number
  }
  sticker?: {
    file_id: string
    set_name: string
  }
  location?: {
    latitude: number
    longitude: number
  }
  callbackData?: string
  isGroupChat?: boolean
  config?: TelegramConfig
}

// Создаем базовый контекст с общими полями
const createBaseContext = (user: TestUser, isGroupChat: boolean = false): Partial<Context> => {
  const telegramUser: User = {
    id: parseInt(user.telegram_id),
    is_bot: false,
    first_name: user.username,
    username: user.username
  }

  const chat: Chat.PrivateChat | Chat.GroupChat = isGroupChat ? {
    id: parseInt(user.telegram_id),
    type: 'group',
    title: 'Test Group'
  } : {
    id: parseInt(user.telegram_id),
    type: 'private',
    first_name: user.username,
    username: user.username
  }

  return {
    from: telegramUser,
    chat
  }
}

// Создаем метод с конфигурацией
const createMethod = (defaultResponse: any, config?: MethodConfig) => {
  return async (...args: any[]) => {
    if (config?.delay) {
      await new Promise(resolve => setTimeout(resolve, config.delay))
    }

    if (config?.error) {
      throw config.error
    }

    if (config?.success === false) {
      throw new Error('Method failed')
    }

    return config?.response ?? defaultResponse
  }
}

export const createMockContext = (params: CreateMockContextParams): Context<Update> => {
  const { 
    user, 
    text, 
    photo, 
    document, 
    voice, 
    sticker, 
    location,
    callbackData,
    isGroupChat = false,
    config = {}
  } = params

  const baseContext = createBaseContext(user, isGroupChat)
  const update: Update = {} as Update

  // Добавляем различные типы сообщений в update
  if (text) {
    const message = {
      ...baseContext as any,
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      text
    }
    Object.assign(update, { message })
  }

  if (photo) {
    const message = {
      ...baseContext as any,
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      photo: [photo]
    }
    Object.assign(update, { message })
  }

  if (document) {
    const message = {
      ...baseContext as any,
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      document
    }
    Object.assign(update, { message })
  }

  if (voice) {
    const message = {
      ...baseContext as any,
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      voice
    }
    Object.assign(update, { message })
  }

  if (sticker) {
    const message = {
      ...baseContext as any,
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      sticker
    }
    Object.assign(update, { message })
  }

  if (location) {
    const message = {
      ...baseContext as any,
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      location
    }
    Object.assign(update, { message })
  }

  if (callbackData) {
    const callbackQuery = {
      ...baseContext,
      id: '1',
      chat_instance: '1',
      data: callbackData
    }
    Object.assign(update, { callback_query: callbackQuery })
  }

  // Создаем базовые методы Telegram с конфигурируемыми ответами
  const telegram = {
    sendMessage: createMethod({ message_id: 1 }, config.sendMessage),
    editMessageText: createMethod({ message_id: 1 }, config.editMessageText),
    deleteMessage: createMethod(true, config.deleteMessage),
    answerCallbackQuery: createMethod(true, config.answerCallbackQuery),
    sendPhoto: createMethod({ message_id: 1 }, config.sendPhoto),
    sendDocument: createMethod({ message_id: 1 }, config.sendDocument),
    sendVoice: createMethod({ message_id: 1 }, config.sendVoice),
    sendSticker: createMethod({ message_id: 1 }, config.sendSticker),
    sendLocation: createMethod({ message_id: 1 }, config.sendLocation),
    getMe: createMethod({
      id: 1,
      is_bot: true,
      first_name: 'Test Bot',
      username: 'test_bot',
      can_join_groups: true,
      can_read_all_group_messages: true,
      supports_inline_queries: false
    }, config.getMe),
    getFile: createMethod({ 
      file_id: 'test_file', 
      file_size: 100, 
      file_path: 'test/path' 
    }, config.getFile),
    getFileLink: createMethod('https://test.com/file', config.getFileLink),
    getUpdates: createMethod([], config.getUpdates),
    setWebhook: createMethod(true, config.setWebhook),
    deleteWebhook: createMethod(true, config.deleteWebhook),
    getWebhookInfo: createMethod({ 
      url: '', 
      has_custom_certificate: false, 
      pending_update_count: 0 
    }, config.getWebhookInfo)
  }

  return {
    ...baseContext,
    update,
    telegram
  } as unknown as Context<Update>
} 