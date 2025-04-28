import { generateNeuroPhotoDirect } from './generateNeuroPhotoDirect'
import { isRussian } from '@/helpers/language'
import { MyContext, ModelUrl } from '@/interfaces'
import { logger } from '@/utils/logger'
import { InputMediaPhoto } from 'telegraf/types'
import { Markup } from 'telegraf'
import { ApiResponse } from '@/interfaces/api.interface'

export async function generateNeuroImage(
  prompt: string,
  model_url: ModelUrl,
  numImages: number,
  telegram_id: string,
  ctx: MyContext,
  botName: string
): Promise<{ data: string } | null> {
  if (!ctx.session.prompt) {
    throw new Error('Prompt not found')
  }

  if (!ctx.session.userModel) {
    throw new Error('User model not found')
  }

  if (!numImages) {
    throw new Error('Num images not found')
  }

  console.log('Starting generateNeuroImage with:', {
    prompt,
    model_url,
    numImages,
    telegram_id,
    botName,
  })

  try {
    const directResult: ApiResponse = await generateNeuroPhotoDirect(
      prompt,
      model_url,
      numImages,
      telegram_id,
      ctx as MyContext,
      botName
    )
    console.log(directResult, 'directResult')

    if (
      directResult &&
      directResult.success &&
      directResult.urls &&
      directResult.urls.length > 0
    ) {
      try {
        if (directResult.urls.length === 1) {
          await ctx.replyWithPhoto(directResult.urls[0])
          await ctx.telegram.sendMessage(
            telegram_id,
            isRussian(ctx)
              ? `Ваши изображения сгенерированы!\n\nЕсли хотите сгенерировать еще, то выберите количество изображений в меню 1️⃣, 2️⃣, 3️⃣, 4️⃣`
              : `Your images have been generated!\n\nIf you want to generate more, select the number of images in the menu 1️⃣, 2️⃣, 3️⃣, 4️⃣`,
            Markup.keyboard([
              [
                Markup.button.text('1️⃣'),
                Markup.button.text('2️⃣'),
                Markup.button.text('3️⃣'),
                Markup.button.text('4️⃣'),
              ],
              [
                Markup.button.text(
                  isRussian(ctx) ? '⬆️ Улучшить промпт' : '⬆️ Improve prompt'
                ),
                Markup.button.text(
                  isRussian(ctx) ? '📐 Изменить размер' : '📐 Change size'
                ),
              ],
              [
                Markup.button.text(
                  isRussian(ctx) ? '🏠 Главное меню' : '🏠 Main menu'
                ),
              ],
            ]).resize()
          )
        } else {
          const mediaGroup: ReadonlyArray<InputMediaPhoto> =
            directResult.urls.map(url => ({
              type: 'photo',
              media: url,
            }))
          await ctx.replyWithMediaGroup(mediaGroup)
        }
        logger.info({
          message:
            '✅ [generateNeuroImage] Фото успешно отправлено пользователю',
          description: 'Photo sent successfully to user',
          telegram_id,
          urls: directResult.urls,
        })
        return { data: directResult.message || 'Images generated successfully' }
      } catch (sendError) {
        logger.error({
          message:
            '❌ [generateNeuroImage] Ошибка при отправке фото пользователю',
          description: 'Error sending photo to user',
          error:
            sendError instanceof Error ? sendError.message : 'Unknown error',
          telegram_id,
          urls: directResult.urls,
        })
        return null
      }
    } else if (directResult && !directResult.success) {
      logger.warn({
        message:
          '⚠️ [generateNeuroImage] Генерация завершилась неуспешно, фото не отправлено',
        description: 'Generation was unsuccessful, photo not sent',
        telegram_id,
        directResult,
      })
      return null
    } else {
      logger.error('Unexpected result from generateNeuroPhotoDirect', {
        directResult,
      })
      return null
    }
  } catch (error) {
    console.error('Ошибка при генерации нейроизображения:', error)

    if (ctx.reply) {
      await ctx.reply(
        isRussian(ctx)
          ? 'Произошла ошибка при генерации изображения. Пожалуйста, попробуйте позже.'
          : 'An error occurred during image generation. Please try again later.'
      )
    }

    return null
  }
}
