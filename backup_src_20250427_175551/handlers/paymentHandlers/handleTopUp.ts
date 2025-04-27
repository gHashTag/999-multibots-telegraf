import { handleBuy } from '@/handlers'
import type { MyContext } from '@/interfaces'

export async function handleTopUp(ctx: MyContext) {
  try {
    console.log('CASE: handleTopUp - Начало обработки колбэка')
    await handleBuy(ctx)
    console.log('CASE: handleTopUp - Успешно завершено')
  } catch (error) {
    console.error('CASE: handleTopUp - Ошибка обработки:', error)
    const isRu = ctx.from?.language_code === 'ru'
    await ctx.reply(
      isRu
        ? 'Произошла ошибка при обработке платежа. Пожалуйста, попробуйте позже.'
        : 'An error occurred while processing the payment. Please try again later.'
    )
    await ctx.scene.leave()
  }
}
