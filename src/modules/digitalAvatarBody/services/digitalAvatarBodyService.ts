import { MyContext } from '@/interfaces'
import { DigitalAvatarBodyDependencies } from '../interfaces/DigitalAvatarBodyDependencies'
import { generateAvatarBodyAdapter } from '../adapters/avatarBodyGenerator'

export const processDigitalAvatarBody = async (
  ctx: MyContext,
  dependencies: DigitalAvatarBodyDependencies,
  inputData: any
): Promise<void> => {
  const isRu = dependencies.isRussian(ctx)

  if (!ctx.from || !ctx.botInfo) {
    await dependencies.sendGenericErrorMessage(ctx, isRu)
    return
  }

  const telegramId = ctx.from.id.toString()
  const username = ctx.from.username || 'unknown_user'
  const botName = ctx.botInfo.username

  try {
    const avatarBodyUrl = await generateAvatarBodyAdapter(
      telegramId,
      username,
      isRu,
      botName,
      inputData
    )

    await ctx.reply(
      isRu
        ? `Ваше цифровое тело аватара готово: ${avatarBodyUrl}`
        : `Your digital avatar body is ready: ${avatarBodyUrl}`
    )
  } catch (error) {
    console.error('Error generating digital avatar body:', error)
    await dependencies.sendGenericErrorMessage(ctx, isRu)
  }
}
