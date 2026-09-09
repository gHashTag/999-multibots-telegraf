import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { Markup } from 'telegraf'
import { avatarService } from '@/services/plan_b/avatar.service'
import { SUPPORT_HANDLE } from '@/config/support'

export const handleTechSupport = async (ctx: MyContext) => {
  const isRu = isRussianFromState(ctx)
  const telegramId = ctx.from?.id?.toString()
  let support: string = SUPPORT_HANDLE

  // ✅ ЗАЩИТА: Если avatarService недоступен, используем fallback
  try {
    if (telegramId) {
      const avatar = await avatarService.getAvatarByTelegramId(telegramId)
      if (avatar && avatar.support) {
        support = avatar.support
      }
    }
  } catch (error) {
    console.warn(
      '⚠️ [TechSupport] avatarService недоступен, используем fallback support:',
      error
    )
    // The default handle stays (fallback)
  }

  const supportMention = support.startsWith('@') ? support : `@${support}`

  const message = isRu
    ? `🛠 Для обращения в техподдержку, напишите ${supportMention}\n\n` +
      'Пожалуйста, опишите вашу проблему максимально подробно.'
    : `🛠 To contact tech support, write to ${supportMention}\n\n` +
      'Please describe your problem in as much detail as possible.'

  // ✅ ИСПРАВЛЕНО: Добавляем клавиатуру с кнопкой возврата в главное меню
  const keyboard = Markup.keyboard([
    [isRu ? '🏠 Главное меню' : '🏠 Main menu'],
  ]).resize()

  await ctx.reply(message, keyboard)
}
