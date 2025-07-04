import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { Markup } from 'telegraf'
import { avatarService } from '@/services/plan_b/avatar.service'

export const handleTechSupport = async (ctx: MyContext) => {
  const isRu = isRussianFromState(ctx)
  const telegramId = ctx.from?.id?.toString()
  let support = 'neuro_sage'

  if (telegramId) {
    const avatar = await avatarService.getAvatarByTelegramId(telegramId)
    if (avatar && avatar.support) {
      support = avatar.support
    }
  }

  const supportMention = support.startsWith('@') ? support : `@${support}`

  const message = isRu
    ? `🛠 Для обращения в техподдержку, напишите ${supportMention}\n\n` +
      'Пожалуйста, опишите вашу проблему максимально подробно.\n\nДля возврата в главное меню, нажмите /menu'
    : `🛠 To contact tech support, write to ${supportMention}\n\n` +
      'Please describe your problem in as much detail as possible.\n\nTo return to the main menu, click /menu'

  await ctx.reply(message, Markup.removeKeyboard())
}
