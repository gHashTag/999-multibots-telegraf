import type { MyContext } from '../interfaces'

export async function sendGenerationErrorMessage(
  ctx: MyContext,
  isRu: boolean
): Promise<void> {
  const message = isRu
    ? '❌ Произошла ошибка при генерации. Пожалуйста, попробуйте позже.'
    : '❌ An error occurred while generating. Please try again later.'

  await ctx.reply(message)
}
