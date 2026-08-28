/**
 * System error handlers utility
 */

import { MyContext } from '@/interfaces'

export function handleCallbackQueryError(ctx: MyContext, error: any): void {
  console.error('Callback query error:', error)
  // Заглушка для обработки ошибок callback query
}

export function handleSystemError(error: any, context?: string): void {
  console.error('System error:', error, context)
  // Заглушка для обработки системных ошибок
}

export function sendGenericErrorMessage(
  ctx: MyContext,
  isRu: boolean,
  error?: any
): Promise<void> {
  const message = isRu ? 'Произошла ошибка' : 'An error occurred'
  return ctx.reply(message).catch(console.error)
}
