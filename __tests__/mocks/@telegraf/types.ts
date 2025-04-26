/**
 * Мок для @telegraf/types
 */

// Базовые типы для сообщений
export interface Message {
  message_id: number
  from?: User
  chat: Chat
  date: number
  text?: string
  photo?: PhotoSize[]
  [key: string]: any
}

export interface User {
  id: number
  is_bot: boolean
  first_name: string
  last_name?: string
  username?: string
  [key: string]: any
}

export interface Chat {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
  title?: string
  username?: string
  first_name?: string
  last_name?: string
  [key: string]: any
}

export interface PhotoSize {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  file_size?: number
}

// Типы для кнопок и клавиатур
export interface InlineKeyboardButton {
  text: string
  url?: string
  callback_data?: string
  web_app?: any
  login_url?: any
  switch_inline_query?: string
  switch_inline_query_current_chat?: string
  callback_game?: any
  pay?: boolean
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][]
}

export interface ReplyKeyboardMarkup {
  keyboard: any[][]
  resize_keyboard?: boolean
  one_time_keyboard?: boolean
  selective?: boolean
  input_field_placeholder?: string
  persistent?: boolean
}

// Типы для контекста и обновлений
export interface Update {
  update_id: number
  message?: Message
  edited_message?: Message
  channel_post?: Message
  edited_channel_post?: Message
  callback_query?: CallbackQuery
  [key: string]: any
}

export interface CallbackQuery {
  id: string
  from: User
  message?: Message
  inline_message_id?: string
  chat_instance: string
  data?: string
  game_short_name?: string
}

// Тип для контекста Telegraf
export interface Context {
  update: Update
  telegram: any
  message?: Message
  editedMessage?: Message
  callbackQuery?: CallbackQuery
  chat?: Chat
  from?: User
  state: any
  session: any
  
  reply: (text: string, extra?: any) => Promise<Message>
  replyWithHTML: (text: string, extra?: any) => Promise<Message>
  replyWithMarkdown: (text: string, extra?: any) => Promise<Message>
  replyWithPhoto: (photo: string | any, extra?: any) => Promise<Message>
  deleteMessage: (messageId?: number) => Promise<boolean>
  answerCallbackQuery: (text?: string) => Promise<boolean>
  
  [key: string]: any
} 