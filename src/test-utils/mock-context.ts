/**
 * Мок-объект контекста Telegraf для тестирования
 */
export interface MockContext {
  from?: any
  message?: any
  chat?: any
  match?: RegExpExecArray | null
  telegram_id?: string
  bot_name?: string
  reply?: (text: string) => Promise<any>
  replyWithHTML?: (text: string) => Promise<any>
  editMessageText?: (text: string, extra?: any) => Promise<any>
  answerCbQuery?: (text?: string) => Promise<true>
  botInfo?: any
}
