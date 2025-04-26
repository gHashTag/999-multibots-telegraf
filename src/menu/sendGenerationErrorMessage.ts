import { type MyContext } from '../interfaces'
import { isRussian } from '@/helpers'
import { getTranslation } from '@/core'

export async function sendGenerationErrorMessage(
  ctx: MyContext,
  isRu: boolean
): Promise<void> {
  const message = isRu
    ? '❌ Произошла ошибка при генерации. Пожалуйста, попробуйте позже.'
    : '❌ An error occurred while generating. Please try again later.'

  await ctx.reply(message)
}
