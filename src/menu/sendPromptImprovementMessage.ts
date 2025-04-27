import { MyContext } from '../interfaces'

export async function sendPromptImprovementMessage(
  ctx: MyContext,
  isRu: boolean
): Promise<void> {
  const message = isRu
    ? '⏳ Начинаю улучшение промпта...'
    : '⏳ Starting prompt improvement...'

  await ctx.reply(message)
}
