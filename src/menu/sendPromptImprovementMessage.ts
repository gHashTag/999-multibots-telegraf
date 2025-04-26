import { type MyContext } from '../interfaces'
import { Markup } from 'telegraf'
import { isRussian } from '@/helpers'
import { getTranslation } from '@/core'

export async function sendPromptImprovementMessage(
  ctx: MyContext,
  isRu: boolean
): Promise<void> {
  const message = isRu
    ? '⏳ Начинаю улучшение промпта...'
    : '⏳ Starting prompt improvement...'

  await ctx.reply(message)
}
