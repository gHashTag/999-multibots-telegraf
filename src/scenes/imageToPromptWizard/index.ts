import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'

import { createHelpCancelKeyboard } from '@/menu'
import { imageToPromptFunction } from '@/price/helpers/imageToPrompt'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { getBotToken } from '@/handlers'
import { handleMenu } from '@/handlers/handleMenu'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { inngest } from '@/inngest-functions/clients'
import { v4 as uuidv4 } from 'uuid'
import { calculateModeCost } from '@/price/helpers/modelsCost'

if (!process.env.HUGGINGFACE_TOKEN) {
  throw new Error('HUGGINGFACE_TOKEN is not set')
}

export const imageToPromptWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.ImageToPrompt,
  async ctx => {
    logger.info('🎯 Запуск сцены image_to_prompt', {
      description: 'Starting image_to_prompt scene',
      telegram_id: ctx.from?.id,
      bot_name: ctx.botInfo?.username,
    })

    const isRu = ctx.from?.language_code === 'ru'

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    await ctx.reply(
      isRu
        ? 'Пожалуйста, отправьте изображение для генерации промпта'
        : 'Please send an image to generate a prompt',
      {
        reply_markup: createHelpCancelKeyboard(isRu).reply_markup,
      }
    )
    ctx.wizard.next()
    return
  },
  async ctx => {
    const isRu = ctx.from?.language_code === 'ru'
    const telegram_id = ctx.from?.id.toString()
    const botName = ctx.botInfo?.username

    logger.info('📸 Ожидание фото', {
      description: 'Waiting for photo',
      telegram_id,
      bot_name: botName,
    })

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    const imageMsg = ctx.message
    if (!imageMsg || !('photo' in imageMsg) || !imageMsg.photo) {
      logger.error('❌ Фото не найдено в сообщении', {
        description: 'No photo in message',
        telegram_id,
        bot_name: botName,
      })
      await ctx.reply(
        isRu ? 'Пожалуйста, отправьте изображение' : 'Please send an image'
      )
      return ctx.scene.leave()
    }

    if (!telegram_id || !botName) {
      logger.error('❌ Отсутствуют необходимые данные', {
        description: 'Missing required data',
        telegram_id,
        bot_name: botName,
      })
      await ctx.reply(
        isRu
          ? 'Произошла ошибка. Пожалуйста, попробуйте позже.'
          : 'An error occurred. Please try again later.'
      )
      return ctx.scene.leave()
    }

    try {
      const photoSize = imageMsg.photo[imageMsg.photo.length - 1]
      const file = await ctx.telegram.getFile(photoSize.file_id)
      ctx.session.mode = ModeEnum.ImageToPrompt
      const botToken = getBotToken(ctx)
      const imageUrl = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`

      // Рассчитываем стоимость операции
      const cost = calculateModeCost({
        mode: ModeEnum.ImageToPrompt,
        steps: 1,
      })

      logger.info('💰 Рассчитана стоимость операции', {
        description: 'Cost calculated',
        cost_per_image: cost.stars,
        telegram_id,
        botName,
      })

      // Отправляем событие в Inngest (Plan A)
      const eventId = `image-to-prompt-${telegram_id}-${Date.now()}-${uuidv4()}`
      logger.info('📝 Подготовка события', {
        description: 'Preparing event',
        eventId,
        telegram_id,
        botName,
      })

      try {
        await inngest.send({
          id: eventId,
          name: 'image/to-prompt.generate',
          data: {
            image: imageUrl,
            telegram_id,
            username: ctx.from?.username,
            is_ru: isRu,
            bot_name: botName,
            cost_per_image: cost.stars,
            metadata: {
              service_type: ModeEnum.ImageToPrompt,
              bot_name: botName,
              language: isRu ? 'ru' : 'en',
              environment: process.env.NODE_ENV,
            },
          },
        })
        logger.info('✅ Событие успешно отправлено', {
          description: 'Event sent successfully',
          eventId,
          telegram_id,
          botName,
          environment: process.env.NODE_ENV,
        })
        ctx.wizard.next()
        return
      } catch (inngestError) {
        logger.warn('⚠️ Inngest (Plan A) не сработал, переключаюсь на Plan B', {
          description: 'Plan A failed, switching to Plan B',
          error: inngestError instanceof Error ? inngestError.message : String(inngestError),
          telegram_id,
          botName,
        })
        // --- PLAN B ---
        try {
          const planBModule = await import('@/services/plan_b/generateImageToPrompt')
          const generateImageToPrompt = planBModule.generateImageToPrompt
          const botResult = require('@/core/bot').getBotByName(botName).bot
          const username = ctx.from?.username || ''
          const result = await generateImageToPrompt(
            imageUrl,
            telegram_id,
            username,
            isRu,
            botResult,
            botName
          )
          logger.info('✅ Plan B (generateImageToPrompt) успешно выполнен', {
            description: 'Plan B success',
            telegram_id,
            botName,
            result,
          })
         
          return ctx.scene.leave()
        } catch (planBError) {
          logger.error('❌ Ошибка в Plan B (generateImageToPrompt)', {
            description: 'Plan B error',
            telegram_id,
            botName,
            error: planBError instanceof Error ? planBError.message : String(planBError),
          })
          await ctx.reply(
            isRu
              ? 'Произошла ошибка при обработке изображения (Plan B). Пожалуйста, попробуйте позже или обратитесь в поддержку.'
              : 'An error occurred while processing the image (Plan B). Please try again later or contact support.'
          )
          return ctx.scene.leave()
        }
      }
    } catch (error) {
      logger.error('❌ Ошибка при обработке изображения', {
        description: 'Error processing image',
        telegram_id,
        bot_name: botName,
        error: error instanceof Error ? error.message : 'Unknown error',
      })

      await ctx.reply(
        isRu
          ? 'Произошла ошибка при обработке изображения. Пожалуйста, попробуйте позже или обратитесь в поддержку.'
          : 'An error occurred while processing the image. Please try again later or contact support.'
      )
      return ctx.scene.leave()
    }
    return
  },
  async ctx => {
    await handleMenu(ctx)
    ctx.scene.leave()
    return
  }
)

export default imageToPromptWizard
