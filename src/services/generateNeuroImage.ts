import { generateNeuroPhotoDirect } from './generateNeuroPhotoDirect'
import { isRussian } from '@/helpers/language'
import { MyContext, ModelUrl } from '@/interfaces'
import { logger } from '@/utils/logger'
import { InputMediaPhoto } from 'telegraf/types'
import { Markup } from 'telegraf'

// Определяем интерфейс для результата
interface GenerateNeuroImageResult {
  success: boolean
  urls?: string[]
  data?: any // Можно уточнить, если известна структура data от generateNeuroPhotoDirect
  error?: string
  message?: string // Поле message также может присутствовать в результате generateNeuroPhotoDirect
}

export async function generateNeuroImage(
  prompt: string,
  model_url: ModelUrl,
  numImages: number,
  telegram_id: string,
  ctx: MyContext,
  botName: string
): Promise<GenerateNeuroImageResult | null> {
  if (!ctx.session.prompt) {
    throw new Error('Prompt not found')
  }

  // --- DEBUG LOG ---
  // console.log(
  //   '>>> generateNeuroImage: Called with',
  //   {
  //     telegram_id: telegram_id,
  //     numImages: numImages,
  //     promptSample: prompt ? prompt.substring(0, 70) + '...' : 'null',
  //     model_url: model_url,
  //     botName: botName,
  //     userModelFromSession: ctx.session.userModel ? String(ctx.session.userModel).substring(0,70) + '...' : 'null'
  //   }
  // );
  // --- END DEBUG LOG ---

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
    userModelFromSession: ctx.session.userModel
      ? String(ctx.session.userModel).substring(0, 70) + '...'
      : 'null',
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
      for (const url of directResult.urls) {
        try {
          await ctx.replyWithPhoto(url)
          logger.info({
            message: `✅ [generateNeuroImage] Фото (${url}) успешно отправлено пользователю (вызов Telegram API выполнен)`,
            telegram_id: telegram_id,
            url: url,
          })
        } catch (photoError: any) {
          logger.error({
            message: `❌ [generateNeuroImage] Ошибка при отправке фото (${url}) пользователю`,
            error: {
              message: photoError.message,
              stack: photoError.stack,
              description: photoError.description, // Telegraf errors often have this
              code: photoError.code, // And this
            },
            telegram_id: telegram_id,
            prompt: prompt,
            url: url,
          })
          // Пока не будем отправлять пользователю сообщение об ошибке отправки конкретного фото, чтобы не засорять чат.
          // Если все фото не отправятся, общее сообщение об ошибке из вызывающей функции должно покрыть это.
        }
      }
      // Если все фото успешно отправлены (или по крайней мере попытки отправки сделаны)
      logger.info({
        message: '✅ [generateNeuroImage] Фото успешно отправлено пользователю',
        description: 'Photo sent successfully to user',
        telegram_id,
        urls: directResult.urls,
      })

      // ВОССТАНАВЛИВАЕМ ОТПРАВКУ КЛАВИАТУРЫ
      await ctx.telegram.sendMessage(
        telegram_id, // Используем telegram_id для отправки напрямую, а не ctx.reply, чтобы избежать путаницы с текущим контекстом сцены
        isRussian(ctx)
          ? 'Ваши изображения сгенерированы!\n\nЕсли хотите сгенерировать еще, выберите количество изображений в меню ниже или введите новый промпт.'
          : 'Your images have been generated!\n\nIf you want to generate more, select the number of images in the menu below or enter a new prompt.',
        Markup.keyboard([
          [
            Markup.button.text('1️⃣'),
            Markup.button.text('2️⃣'),
            Markup.button.text('3️⃣'),
            Markup.button.text('4️⃣'),
          ],
          // Восстанавливаем кнопки "Улучшить промпт" и "Изменить размер", а "Новый промпт" убираем, чтобы соответствовать исходному скриншоту Гуру
          [
            Markup.button.text(
              isRussian(ctx) ? '⬆️ Улучшить промпт' : '⬆️ Improve prompt'
            ),
          ],
          [
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
