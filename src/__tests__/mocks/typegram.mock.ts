// src/__tests__/mocks/typegram.mock.ts
// Minimal mock for Telegraf types to satisfy imports during testing.
// We don't need actual type implementations here, just the exports.

// Mock common types that might be imported
export declare namespace Telegram {
  // Add basic type declarations as needed by your interfaces
}

export declare namespace Scenes {
  interface SceneContext {}
  // Add other scene related types if imported directly
}

export declare namespace Markup {
  // Add markup related types if imported directly
}

// Mock specific types often imported
export interface User {
  id: number
  is_bot: boolean
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
}

export interface Chat {
  id: number
  type: string
  // Add other chat properties as needed
}

export declare namespace Chat {
  interface PrivateChat extends Chat {
    type: 'private'
    username?: string
    first_name?: string
    last_name?: string
  }
  // Add other chat types like GroupChat, SupergroupChat etc. if needed
}

export interface Message {
  message_id: number
  chat: Chat
  from?: User
  date: number
  // Add common message subtypes or properties
  text?: string
  photo?: any[] // Adjust type as needed
  // ... other message types
}

export declare namespace Message {
  interface TextMessage extends Message {
    text: string
  }
  // Add other specific message types
}

export interface Update {
  update_id: number
  message?: Message
  callback_query?: CallbackQuery
  // Add other update types (inline_query, etc.)
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

// Export other commonly used types as empty interfaces/types
export type UpdateType = any
export type MessageSubTypes = any
export type Opts = any

// Add any other specific type exports that cause errors
