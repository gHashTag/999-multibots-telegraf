import { Middleware } from 'telegraf'
import { MyContext } from '@/interfaces'

/**
 * Безопасно вызывает middleware-обработчик с контекстом
 * @param handler Обработчик для вызова
 * @param ctx Контекст для передачи в обработчик
 */
export async function invokeHandler(
  handler: Middleware<MyContext>,
  ctx: MyContext
): Promise<void> {
  if (typeof handler === 'function') {
    await handler(ctx, () => Promise.resolve())
  } else if (handler && typeof handler.middleware === 'function') {
    await handler.middleware(ctx, () => Promise.resolve())
  } else {
    throw new Error('Invalid handler provided')
  }
} 