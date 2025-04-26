/**
 * Мок для типа MyContext из telegram-bot.interface.ts
 */

import { Context } from 'telegraf'

// Определяем базовые типы
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

export interface Message {
  message_id: number
  date: number
  chat: Chat
  from?: User
  text?: string
}

export interface Update {
  update_id: number
  message?: Message
  callback_query?: {
    id: string
    from: User
    message?: Message
    data?: string
  }
}

// Определяем тип MyContext
export interface MyContext extends Context {
  session: {
    __scenes: {
      current: string | null
      state: Record<string, any>
    }
  }
  scene: {
    enter: (sceneId: string) => Promise<any>
    reenter: () => Promise<any>
    leave: () => Promise<any>
  }
  wizard: {
    next: () => void
    back: () => void
    selectStep: (step: number) => void
    cursor: number
    state: Record<string, any>
  }
  update: Update
  from?: User
  chat?: Chat
  message?: Message
  callbackQuery?: {
    data: string
    message?: {
      message_id: number
    }
  }
}
