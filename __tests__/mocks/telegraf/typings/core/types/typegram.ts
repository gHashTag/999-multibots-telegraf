/**
 * Мок для типов telegraf typegram
 */

// Базовые типы для чата
export interface User {
  id: number
  first_name: string
  is_bot: boolean
  username?: string
  last_name?: string
}

export interface Chat {
  id: number
  type: string
  first_name?: string
  username?: string
  title?: string
}

// Типы сообщений
export interface Message {
  message_id: number
  date: number
  chat: Chat
  from?: User
  text?: string
}

// Типы для клавиатур
export interface InlineKeyboardMarkup {
  inline_keyboard: Array<
    Array<{
      text: string
      callback_data?: string
      url?: string
    }>
  >
}

export interface ReplyKeyboardMarkup {
  keyboard: Array<
    Array<{
      text: string
      request_contact?: boolean
      request_location?: boolean
    }>
  >
  resize_keyboard?: boolean
  one_time_keyboard?: boolean
  selective?: boolean
}

export interface ReplyKeyboardRemove {
  remove_keyboard: true
  selective?: boolean
}

export interface ForceReply {
  force_reply: true
  selective?: boolean
}

// Типы для Update
export interface Update {
  update_id: number
  message?: Message
  callback_query?: CallbackQuery
}

export interface CallbackQuery {
  id: string
  from: User
  message?: Message
  data?: string
}

// Экспортируем все типы для совместимости с импортами в проекте
