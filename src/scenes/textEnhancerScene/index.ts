import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers/language'
import { logger } from '@/utils/logger'
import { handleHelpCancel } from '@/handlers'
import { enhanceText } from '@/services/enhanceText'

export const textEnhancerScene = new Scenes.WizardScene<MyContext>(
  'textEnhancerScene',
  // Шаг 1: Запрос текста для улучшения
  async ctx => {
    const isRu = isRussian(ctx)

    await ctx.reply(
      isRu
        ? '✍️ Пожалуйста, отправьте текст, который нужно улучшить'
        : '✍️ Please send the text you want to enhance',
      {
        reply_markup: { remove_keyboard: true },
      }
    )

    return ctx.wizard.next()
  },
  // Шаг 2: Обработка текста
  async ctx => {
    const isRu = isRussian(ctx)

    // Проверяем отмену операции
    if (await handleHelpCancel(ctx)) {
      return ctx.scene.leave()
    }

    // Проверяем наличие текста
    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, отправьте текстовое сообщение'
          : '❌ Please send a text message'
      )
      return
    }

    const text = ctx.message.text

    try {
      // Отправляем сообщение о начале обработки
      await ctx.reply(isRu ? '🔄 Улучшаю текст...' : '🔄 Enhancing text...')

      // Улучшаем текст
      const enhancedText = await enhanceText(text, isRu)

      // Отправляем улучшенный текст
      await ctx.reply(
        isRu
          ? `✨ Улучшенная версия:\n\n${enhancedText}`
          : `✨ Enhanced version:\n\n${enhancedText}`
      )

      logger.info({
        message: 'Текст успешно улучшен',
        description: 'Text enhancement completed successfully',
        telegram_id: ctx.from?.id,
      })
    } catch (error) {
      logger.error('Error in textEnhancerScene:', error)

      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при улучшении текста. Пожалуйста, попробуйте позже.'
          : '❌ An error occurred while enhancing the text. Please try again later.'
      )
    }

    return ctx.scene.leave()
  }
)
