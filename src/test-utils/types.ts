import { Context } from 'telegraf'

/**
 * Мок-контекст для тестирования Telegraf
 */
export interface MockContext {
  from?: any
  message?: any
  chat?: any
  reply: (text: string) => Promise<any>
  replyWithHTML: (text: string) => Promise<any>
  replyWithMarkdown: (text: string) => Promise<any>
  deleteMessage: (messageId: number) => Promise<boolean>
  editMessageText: (text: string, extra?: any) => Promise<any>
  editMessageReplyMarkup: (markup: any) => Promise<any>
  answerCallbackQuery: (text?: string) => Promise<boolean>
  session: any
}

/**
 * Интерфейс для результатов тестов
 */
export interface TestResult {
  name: string
  success: boolean
  message: string
  error?: string
}
