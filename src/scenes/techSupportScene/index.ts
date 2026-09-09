import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { Markup } from 'telegraf'
import { avatarService } from '@/services/plan_b/avatar.service'
import { SUPPORT_HANDLE } from '@/config/support'

export const techSupportScene = new Scenes.BaseScene<MyContext>(
  'techSupportScene'
)

techSupportScene.enter(async ctx => {
  const isRu = isRussianFromState(ctx)
  const telegramId = ctx.from?.id

  logger.info('🛠 [TechSupport] Tech support screen opened', {
    telegramId,
    currentLanguage: isRu ? 'ru' : 'en',
  })

  let support: string = SUPPORT_HANDLE

  // ✅ ЗАЩИТА: Если avatarService недоступен, используем fallback
  try {
    if (telegramId) {
      const avatar = await avatarService.getAvatarByTelegramId(
        telegramId.toString()
      )
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

  // Создаем клавиатуру с кнопкой "Назад"
  const keyboard = {
    inline_keyboard: [
      [{ text: '◀️ Назад в меню', callback_data: 'back_to_menu' }],
    ],
  }

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  })
})

// Обработчик кнопки "Назад"
techSupportScene.action('back_to_menu', async ctx => {
  await ctx.answerCbQuery()
  await ctx.scene.leave()
  const { showMainMenu } = await import('@/navigation')
  await showMainMenu(ctx)
})

export default techSupportScene
