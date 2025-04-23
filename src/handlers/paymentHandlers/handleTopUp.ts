import { handleBuy } from '@/handlers'

export async function handleTopUp(ctx) {
  try {
    console.log('CASE: handleTopUp - Начало обработки колбэка')
    const data = ctx.match[0]
    console.log('Полученные данные колбэка:', data)
    const isRu = ctx.from?.language_code === 'ru'
    console.log('Вызываем handleBuy с данными:', { data, isRu })
    await handleBuy({ ctx, data, isRu })
    console.log('CASE: handleTopUp - Успешно завершено')
    await ctx.scene.leave()
  } catch (error) {
    console.error('CASE: handleTopUp - Ошибка обработки:', error)
    // Отправляем пользователю сообщение об ошибке
    const isRu = ctx.from?.language_code === 'ru'
    await ctx.reply(
      isRu
        ? 'Произошла ошибка при обработке платежа. Пожалуйста, попробуйте позже.'
        : 'An error occurred while processing the payment. Please try again later.'
    )
  }
}
