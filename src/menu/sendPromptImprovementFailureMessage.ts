import { MyContext } from '@/types'

export async function sendPromptImprovementFailureMessage(
  ctx: MyContext,
  isRu: boolean
): Promise<void> {
  const message = isRu
    ? '❌ Не удалось улучшить промпт'
    : '❌ Failed to improve prompt'

  await ctx.reply(message)
}
