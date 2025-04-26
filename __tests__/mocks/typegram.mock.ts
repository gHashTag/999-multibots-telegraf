/**
 * Мок типов из telegraf/typings/core/types/typegram
 */

export interface InlineKeyboardMarkup {
  inline_keyboard: Array<
    Array<{
      text: string
      callback_data?: string
      url?: string
      switch_inline_query?: string
      switch_inline_query_current_chat?: string
      pay?: boolean
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

// Другие типы можно добавить по мере необходимости
