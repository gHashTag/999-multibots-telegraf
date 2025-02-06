import { MyContext } from '../interfaces'

export async function sendGenericErrorMessage(
  ctx: MyContext,
  isRu: boolean,
  error?: Error
): Promise<void> {
  const baseMessage = isRu
    ? '❌ Произошла ошибка. Пожалуйста, попробуйте позже.'
    : '❌ An error occurred. Please try again later.'

  const errorMessage = error
    ? `\n${isRu ? 'Ошибка:' : 'Error:'} ${error.message}`
    : ''

  await ctx.reply(baseMessage + errorMessage)
  throw error
}
