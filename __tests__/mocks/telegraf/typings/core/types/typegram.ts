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
  [key: string]: any
}

export interface Chat {
  id: number
  type: string
  first_name?: string
  username?: string
  title?: string
  last_name?: string
  [key: string]: any
}

// Типы сообщений
export interface Message {
  message_id: number
  date: number
  chat: Chat
  from?: User
  text?: string
  photo?: Array<PhotoSize>
  [key: string]: any
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

export interface PhotoSize {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  file_size?: number
}

// Экспортируем все типы для совместимости с импортами в проекте
