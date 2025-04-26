/**
 * Мок для модуля telegraf/types
 */

// Экспортирую типы для кнопок и меню
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

export interface ReplyKeyboardRemove {
  remove_keyboard: true
  selective?: boolean
}

export interface ForceReply {
  force_reply: true
  selective?: boolean
  input_field_placeholder?: string
}

// Базовые типы сообщений
export interface Message {
  message_id: number
  from?: any
  chat: any
  date: number
  text?: string
  photo?: any[]
  audio?: any
  document?: any
  video?: any
  voice?: any
  caption?: string
  reply_markup?: any
}

// Другие необходимые типы
export interface Update {
  update_id: number
  message?: Message
  edited_message?: Message
  channel_post?: Message
  edited_channel_post?: Message
  callback_query?: any
  inline_query?: any
}

/**
 * Типы для моков библиотеки Telegraf
 */

// Базовые типы для Telegram API - переименованы из namespace в интерфейсы с префиксом
export interface tt_Update {
  update_id: number;
  message?: tt_Message;
  edited_message?: tt_Message;
  channel_post?: tt_Message;
  edited_channel_post?: tt_Message;
  callback_query?: tt_CallbackQuery;
  inline_query?: tt_InlineQuery;
  chosen_inline_result?: tt_ChosenInlineResult;
  poll?: tt_Poll;
  poll_answer?: tt_PollAnswer;
  shipping_query?: tt_ShippingQuery;
  pre_checkout_query?: tt_PreCheckoutQuery;
}

export interface tt_Message {
  message_id: number;
  from?: tt_User;
  chat: tt_Chat;
  date: number;
  text?: string;
  photo?: tt_PhotoSize[];
  video?: tt_Video;
  audio?: tt_Audio;
  document?: tt_Document;
  animation?: tt_Animation;
  voice?: tt_Voice;
  caption?: string;
  reply_markup?: tt_InlineKeyboardMarkup;
  [key: string]: any;
}

export interface tt_User {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface tt_Chat {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface tt_CallbackQuery {
  id: string;
  from: tt_User;
  message?: tt_Message;
  inline_message_id?: string;
  chat_instance: string;
  data?: string;
  game_short_name?: string;
}

export interface tt_InlineQuery {
  id: string;
  from: tt_User;
  query: string;
  offset: string;
}

export interface tt_ChosenInlineResult {
  result_id: string;
  from: tt_User;
  query: string;
}

export interface tt_Poll {
  id: string;
  question: string;
  options: tt_PollOption[];
  is_closed: boolean;
  is_anonymous: boolean;
  type: string;
}

export interface tt_PollOption {
  text: string;
  voter_count: number;
}

export interface tt_PollAnswer {
  poll_id: string;
  user: tt_User;
  option_ids: number[];
}

export interface tt_ShippingQuery {
  id: string;
  from: tt_User;
  invoice_payload: string;
  shipping_address: tt_ShippingAddress;
}

export interface tt_ShippingAddress {
  country_code: string;
  state: string;
  city: string;
  street_line1: string;
  street_line2: string;
  post_code: string;
}

export interface tt_PreCheckoutQuery {
  id: string;
  from: tt_User;
  currency: string;
  total_amount: number;
  invoice_payload: string;
}

export interface tt_PhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface tt_Video {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  duration: number;
  thumb?: tt_PhotoSize;
  mime_type?: string;
  file_size?: number;
}

export interface tt_Audio {
  file_id: string;
  file_unique_id: string;
  duration: number;
  performer?: string;
  title?: string;
  mime_type?: string;
  file_size?: number;
  thumb?: tt_PhotoSize;
}

export interface tt_Document {
  file_id: string;
  file_unique_id: string;
  thumb?: tt_PhotoSize;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface tt_Animation {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  duration: number;
  thumb?: tt_PhotoSize;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface tt_Voice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface tt_InlineKeyboardMarkup {
  inline_keyboard: tt_InlineKeyboardButton[][];
}

export interface tt_InlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
  web_app?: tt_WebAppInfo;
  login_url?: tt_LoginUrl;
  switch_inline_query?: string;
  switch_inline_query_current_chat?: string;
  pay?: boolean;
}

export interface tt_WebAppInfo {
  url: string;
}

export interface tt_LoginUrl {
  url: string;
  forward_text?: string;
  bot_username?: string;
  request_write_access?: boolean;
}

export interface TelegrafContext {
  update: tt_Update;
  updateType: string;
  message?: tt_Message;
  editedMessage?: tt_Message;
  inlineQuery?: tt_InlineQuery;
  chosenInlineResult?: tt_ChosenInlineResult;
  callbackQuery?: tt_CallbackQuery;
  channelPost?: tt_Message;
  editedChannelPost?: tt_Message;
  shippingQuery?: tt_ShippingQuery;
  preCheckoutQuery?: tt_PreCheckoutQuery;
  poll?: tt_Poll;
  pollAnswer?: tt_PollAnswer;
  scene?: {
    enter: (sceneId: string) => Promise<any>;
    reenter: () => Promise<any>;
    leave: () => Promise<any>;
    state: Record<string, any>;
  };
  wizard?: {
    next: () => Promise<any>;
    back: () => Promise<any>;
    selectStep: (stepIndex: number) => Promise<any>;
    step: number;
  };
  session?: Record<string, any>;
  [key: string]: any;
} 