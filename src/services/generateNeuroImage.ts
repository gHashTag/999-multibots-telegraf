import { generateNeuroPhotoDirect } from './generateNeuroPhotoDirect'
import { isRussian } from '@/helpers/language'
import type { MyContext, ModelUrl } from '@/interfaces'
import { logger } from '@/utils/logger'
import { InputMediaPhoto } from 'telegraf/types'

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
    // Используем прямую генерацию через generateNeuroPhotoDirect
    const directResult = await generateNeuroPhotoDirect(
      prompt,
      model_url,
      numImages,
      telegram_id,
      ctx as MyContext,
      botName
      // Передаем опцию disable_telegram_sending, если мы в неправильном окружении
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
            {
              reply_markup: {
                keyboard: [
                  [
                    { text: '1️⃣' },
                    { text: '2️⃣' },
                    { text: '3️⃣' },
                    { text: '4️⃣' },
                  ],
                  [
                    {
                      text: isRussian(ctx)
                        ? '⬆️ Улучшить промпт'
                        : '⬆️ Improve prompt',
                    },
                    {
                      text: isRussian(ctx)
                        ? '📐 Изменить размер'
                        : '📐 Change size',
                    },
                  ],
                  [
                    {
                      text: isRussian(ctx) ? '🏠 Главное меню' : '🏠 Main menu',
                    },
                  ],
                ],
                resize_keyboard: true,
                one_time_keyboard: false,
              },
            }
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
      }
    } else if (directResult && !directResult.success) {
      logger.warn({
        message:
          '⚠️ [generateNeuroImage] Генерация завершилась неуспешно, фото не отправлено',
        description: 'Generation was unsuccessful, photo not sent',
        telegram_id,
        directResult,
      })
    }

    return directResult
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
