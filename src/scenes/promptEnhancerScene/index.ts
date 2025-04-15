import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers/language'
import { logger } from '@/utils/logger'
import { handleHelpCancel } from '@/handlers'
import { enhancePrompt } from '@/services/enhancePrompt'

export const promptEnhancerScene = new Scenes.WizardScene<MyContext>(
  'promptEnhancerScene',
  // Шаг 1: Запрос промпта для улучшения
  async (ctx) => {
    const isRu = isRussian(ctx)
    
    await ctx.reply(
      isRu 
        ? '✍️ Пожалуйста, отправьте промпт, который нужно улучшить\n\nПромпт - это текстовое описание для генерации изображения или видео'
        : '✍️ Please send the prompt you want to enhance\n\nA prompt is a text description for generating an image or video',
      {
        reply_markup: { remove_keyboard: true }
      }
    )
    
    return ctx.wizard.next()
  },
  // Шаг 2: Обработка промпта
  async (ctx) => {
    const isRu = isRussian(ctx)
    
    // Проверяем отмену операции
    if (await handleHelpCancel(ctx)) {
      return ctx.scene.leave()
    }
    
    // Проверяем наличие текста
    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, отправьте текстовый промпт'
          : '❌ Please send a text prompt'
      )
      return
    }
    
    const prompt = ctx.message.text
    
    try {
      // Отправляем сообщение о начале обработки
      await ctx.reply(
        isRu
          ? '🔄 Улучшаю промпт...'
          : '🔄 Enhancing prompt...'
      )
      
      // Улучшаем промпт
      const enhancedPrompt = await enhancePrompt(prompt, isRu)
      
      // Отправляем улучшенный промпт
      await ctx.reply(
        isRu
          ? `✨ Улучшенная версия:\n\n${enhancedPrompt}\n\nТеперь этот промпт должен давать лучшие результаты при генерации.`
          : `✨ Enhanced version:\n\n${enhancedPrompt}\n\nThis prompt should now give better results when generating.`
      )
      
      logger.info({
        message: 'Промпт успешно улучшен',
        description: 'Prompt enhancement completed successfully',
        telegram_id: ctx.from?.id,
      })
      
    } catch (error) {
      logger.error('Error in promptEnhancerScene:', error)
      
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при улучшении промпта. Пожалуйста, попробуйте позже.'
          : '❌ An error occurred while enhancing the prompt. Please try again later.'
      )
    }
    
    return ctx.scene.leave()
  }
) 