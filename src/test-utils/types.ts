import { Context } from 'telegraf'
import { Update, UserFromGetMe } from 'telegraf/typings/core/types/typegram'

/**
 * Интерфейс результата выполнения теста
 */
export interface TestResult {
  // Название теста
  name: string

  // Успешно ли выполнен тест
  success: boolean

  // Сообщение о результате теста
  message: string

  // Подробная информация о результате теста (опционально)
  details?: any

  // Информация об ошибке, если тест не прошел (опционально)
  error?: string
}

/**
 * Мок-объект контекста Telegraf для тестирования
 */
export interface MockContext extends Partial<Context<Update>> {
  from?: {
    id: number
    [key: string]: any
  }
  botInfo?: UserFromGetMe
  reply: (message: string, extra?: any) => Promise<any>
}
