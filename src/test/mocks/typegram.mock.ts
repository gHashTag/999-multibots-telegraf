// Мокаем типы typegram для тестов

export interface ReplyKeyboardMarkup {
  keyboard: any[][]
  resize_keyboard?: boolean
  one_time_keyboard?: boolean
  selective?: boolean
}

export interface InlineKeyboardMarkup {
  inline_keyboard: any[][]
}

export interface InlineKeyboardButton {
  text: string
  url?: string
  callback_data?: string
  web_app?: {
    url: string
  }
  login_url?: {
    url: string
    forward_text?: string
    bot_username?: string
    request_write_access?: boolean
  }
  switch_inline_query?: string
  switch_inline_query_current_chat?: string
  callback_game?: {}
  pay?: boolean
}

export interface CallbackQuery {
  id: string
  from: User
  message?: Message
  inline_message_id?: string
  chat_instance?: string
  data?: string
  game_short_name?: string
}

export interface User {
  id: number
  is_bot: boolean
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
}

export interface Message {
  message_id: number
  from?: User
  chat: Chat
  date: number
  text?: string
  photo?: any[]
  caption?: string
  document?: any
  audio?: any
  reply_to_message?: Message
  reply_markup?: any
}

export interface TextMessage extends Message {
  text: string
}

export interface PhotoMessage extends Message {
  photo: any[]
}

export interface PhotoSize {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  file_size?: number
}

export interface Video {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  duration: number
  thumb?: PhotoSize
  file_name?: string
  mime_type?: string
  file_size?: number
}

export interface Voice {
  file_id: string
  file_unique_id: string
  duration: number
  mime_type?: string
  file_size?: number
}

export interface Document {
  file_id: string
  file_unique_id: string
  thumb?: PhotoSize
  file_name?: string
  mime_type?: string
  file_size?: number
}

export interface Chat {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
  title?: string
  username?: string
  first_name?: string
  last_name?: string
}

export interface MessageEntity {
  type: string
  offset: number
  length: number
  url?: string
  user?: User
  language?: string
}

export interface Update {
  update_id: number
  message?: Message
  edited_message?: Message
  callback_query?: CallbackQuery
}

export interface ExtraReplyMessage {
  parse_mode?: 'Markdown' | 'HTML'
  reply_markup?: any
  disable_web_page_preview?: boolean
  disable_notification?: boolean
  reply_to_message_id?: number
}

export interface UserFromGetMe {
  id: number
  is_bot: boolean
  first_name: string
  username: string
  can_join_groups: boolean
  can_read_all_group_messages: boolean
  supports_inline_queries: boolean
}

// Экспортируем только типы, не значения
// Ничего не экспортируем по умолчанию, так как это интерфейсы
