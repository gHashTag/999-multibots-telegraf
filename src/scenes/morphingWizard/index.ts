import { Markup, Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { getBotToken } from '@/handlers/getBotToken'
import { generateMorphing } from '../../services/generateMorphing'
import { shouldShowRubles } from '@/core/bot/shouldShowRubles'
import { logger } from '@/utils/logger'
import { calculateFinalPrice } from '@/price/helpers/calculateFinalPrice'
import { isValidImage } from '../../helpers/images'
import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import { ModeEnum } from '@/interfaces/modes'

// ✅ КОНСТАНТА ДЛЯ МОДЕЛИ МОРФИНГА
const MORPHING_MODEL_KEY = 'kling-v1.6-pro'

// ✅ Функция для создания ZIP из buffer массива
const createMorphingImagesZip = (
  images: { buffer: Buffer; filename: string }[]
): string => {
  try {
    const zip = new AdmZip()

    images.forEach((image, index) => {
      const filename = `morphing_image_${index + 1}.jpg`
      zip.addFile(filename, image.buffer)
      logger.info(`Added image ${index + 1} to ZIP`, {
        filename,
        size: image.buffer.length,
      })
    })

    const tempDir = path.join(process.cwd(), 'temp')
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    const zipPath = path.join(tempDir, `morphing_images_${Date.now()}.zip`)
    zip.writeZip(zipPath)

    logger.info('Created morphing images ZIP', {
      zipPath,
      imagesCount: images.length,
      zipSize: fs.statSync(zipPath).size,
    })

    return zipPath
  } catch (error) {
    logger.error('Error creating morphing images ZIP', {
      error: error instanceof Error ? error.message : 'Unknown error',
      imagesCount: images.length,
    })
    throw error
  }
}

// ✅ Функция для создания прогресс бара
const createProgressBar = (
  current: number,
  total: number = 10,
  length: number = 10
): string => {
  const filled = Math.floor((current / total) * length)
  const empty = length - filled
  return `[${'▓'.repeat(filled) + '░'.repeat(empty)}] ${current}/${total >= 99 ? '∞' : total}`
}

// ✅ Функция для создания сообщения о прогрессе
const createProgressMessage = (images: any[], isRu: boolean): string => {
  const count = images.length
  const progressBar = createProgressBar(count, 10, 10)

  const statusIcon = count >= 2 ? '✅' : '⏳'
  const statusText =
    count >= 2
      ? isRu
        ? 'Достаточно изображений для создания морфинга!'
        : 'Enough images to create morphing!'
      : isRu
        ? 'Загрузите еще изображения'
        : 'Upload more images'

  return isRu
    ? `🧬 <b>Морфинг - Загрузка изображений</b>

📸 <b>Загружено:</b> ${count} из минимум 2 изображений  
📊 <b>Прогресс:</b> ${progressBar}

${statusIcon} <b>${statusText}</b>

🎬 <b>Будет создано:</b> ${Math.max(0, count - 1)} видео переходов
💡 <b>Совет:</b> Больше изображений = больше переходов`
    : `🧬 <b>Morphing - Image Upload</b>

📸 <b>Uploaded:</b> ${count} of minimum 2 images  
📊 <b>Progress:</b> ${progressBar}

${statusIcon} <b>${statusText}</b>

🎬 <b>Will create:</b> ${Math.max(0, count - 1)} video transitions
💡 <b>Tip:</b> More images = more transitions`
}

// ✅ Функция для создания клавиатуры прогресса
const createProgressKeyboard = (images: any[], isRu: boolean) => {
  const canGenerate = images.length >= 2

  const keyboard = []

  if (canGenerate) {
    keyboard.push([
      Markup.button.callback(
        isRu ? '✅ Создать морфинг' : '✅ Create morphing',
        'morphing_start_generation'
      ),
    ])
  }

  keyboard.push([
    Markup.button.callback(
      isRu ? '🔄 Начать заново' : '🔄 Start over',
      'morphing_restart'
    ),
  ])

  return Markup.inlineKeyboard(keyboard)
}

// Создание Wizard Scene
export const morphingWizard = new Scenes.WizardScene<MyContext>(
  'morphing_wizard',

  // ✅ ШАГ 1: Приветствие и инструкции
  async ctx => {
    const isRu = isRussianFromState(ctx)

    logger.info('🧬 [MORPHING WIZARD] Step 1 - Scene Entry', {
      telegramId: ctx.from?.id,
      username: ctx.from?.username,
    })

    // Очищаем предыдущие данные
    if (ctx.session) {
      ctx.session.morphingImages = []
      ctx.session.morphingProgressMessageId = undefined
    }

    const welcomeMessage = isRu
      ? `🧬 <b>Добро пожаловать в Морфинг Студию!</b>

✨ Создавайте потрясающие видео переходы между изображениями
📸 Загрузите минимум 2 изображения для начала
🎯 Система создаст плавные переходы между всеми кадрами

<i>📤 Отправьте первое изображение:</i>`
      : `🧬 <b>Welcome to Morphing Studio!</b>

✨ Create stunning video transitions between images
📸 Upload minimum 2 images to start
🎯 System will create smooth transitions between all frames

<i>📤 Send your first image:</i>`

    await ctx.reply(welcomeMessage, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'morphing_cancel')],
      ]).reply_markup,
    })

    return ctx.wizard.next()
  },

  // ✅ ШАГ 2: Пакетная загрузка изображений
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message

    logger.info('🧬 [MORPHING WIZARD] Step 2 - Image Collection', {
      telegramId: ctx.from?.id,
      hasMessage: !!message,
      messageType: message ? Object.keys(message) : [],
      currentImagesCount: ctx.session?.morphingImages?.length || 0,
    })

    // Обработка отмены
    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    // Обработка фотографий
    if (message && 'photo' in message) {
      logger.info('🧬 [MORPHING WIZARD] Step 2 - Processing photo')

      if (!ctx.session.morphingImages) {
        ctx.session.morphingImages = []
      }

      const photo = message.photo[message.photo.length - 1]
      const file = await ctx.telegram.getFile(photo.file_id)

      if (!file.file_path) {
        await ctx.reply(
          isRu ? '❌ Ошибка получения файла' : '❌ Error getting file'
        )
        return
      }

      try {
        const botToken = getBotToken(ctx)
        const response = await fetch(
          `https://api.telegram.org/file/bot${botToken}/${file.file_path}`
        )
        const buffer = Buffer.from(await response.arrayBuffer())

        // Валидация изображения
        const isValid = await isValidImage(buffer)
        if (!isValid) {
          await ctx.reply(
            isRu
              ? '❌ Файл не является корректным изображением.'
              : '❌ File is not a valid image.'
          )
          return
        }

        // Проверка размера файла (максимум 10MB)
        const MAX_IMAGE_SIZE = 10 * 1024 * 1024
        if (buffer.length > MAX_IMAGE_SIZE) {
          await ctx.reply(
            isRu
              ? '❌ Изображение слишком большое (максимум 10MB).'
              : '❌ Image too large (maximum 10MB).'
          )
          return
        }

        // Добавляем изображение в сессию
        const imageIndex = ctx.session.morphingImages.length + 1
        ctx.session.morphingImages.push({
          buffer: Buffer.from(buffer),
          filename: `morphing_image_${imageIndex}.jpg`,
        })

        logger.info(
          `🧬 [MORPHING WIZARD] Image ${imageIndex} added successfully`,
          {
            telegramId: ctx.from?.id,
            totalImages: ctx.session.morphingImages.length,
            imageSize: buffer.length,
          }
        )

        // Создаем сообщение с прогрессом
        const progressMessage = createProgressMessage(
          ctx.session.morphingImages,
          isRu
        )
        const keyboard = createProgressKeyboard(
          ctx.session.morphingImages,
          isRu
        )

        // Обновляем сообщение о прогрессе или создаем новое
        if (ctx.session.morphingProgressMessageId) {
          try {
            await ctx.telegram.editMessageText(
              ctx.chat?.id,
              ctx.session.morphingProgressMessageId,
              undefined,
              progressMessage,
              {
                parse_mode: 'HTML',
                reply_markup: keyboard.reply_markup,
              }
            )
          } catch (error) {
            // Если не удалось обновить, создаем новое сообщение
            const sentMessage = await ctx.reply(progressMessage, {
              parse_mode: 'HTML',
              reply_markup: keyboard.reply_markup,
            })
            if ('message_id' in sentMessage) {
              ctx.session.morphingProgressMessageId = sentMessage.message_id
            }
          }
        } else {
          const sentMessage = await ctx.reply(progressMessage, {
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup,
          })
          if ('message_id' in sentMessage) {
            ctx.session.morphingProgressMessageId = sentMessage.message_id
          }
        }

        // Мотивационные сообщения на ключевых этапах
        if (imageIndex === 2) {
          setTimeout(async () => {
            await ctx.reply(
              isRu
                ? '🎉 Отлично! Уже можно создать морфинг. Добавьте еще изображения для большего количества переходов!'
                : '🎉 Great! You can now create morphing. Add more images for more transitions!'
            )
          }, 1000)
        } else if (imageIndex === 5) {
          setTimeout(async () => {
            await ctx.reply(
              isRu
                ? '⭐ Превосходно! 5 изображений дадут потрясающий результат!'
                : '⭐ Excellent! 5 images will give amazing results!'
            )
          }, 1000)
        }
      } catch (error) {
        logger.error('Error processing morphing image', {
          error: error instanceof Error ? error.message : 'Unknown error',
          telegramId: ctx.from?.id,
        })

        await ctx.reply(
          isRu
            ? '❌ Ошибка при обработке изображения. Попробуйте еще раз.'
            : '❌ Error processing image. Please try again.'
        )
      }

      return // Остаемся на том же шаге для загрузки еще изображений
    }

    // Если это не фото и не отмена - просим отправить фото
    if (message && 'text' in message && !message.text.startsWith('/')) {
      await ctx.reply(
        isRu
          ? '📸 Пожалуйста, отправьте изображение (не текст).'
          : '📸 Please send an image (not text).'
      )
    }

    return // Остаемся на том же шаге
  }
)

// ✅ ОБРАБОТЧИКИ КНОПОК

// Кнопка "Создать морфинг"
morphingWizard.action('morphing_start_generation', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    if (!ctx.session?.morphingImages || ctx.session.morphingImages.length < 2) {
      await ctx.reply(
        isRu
          ? '❌ Необходимо минимум 2 изображения для создания морфинга.'
          : '❌ Minimum 2 images required to create morphing.'
      )
      return
    }

    logger.info('🧬 [MORPHING WIZARD] Starting generation', {
      telegramId: ctx.from?.id,
      imagesCount: ctx.session.morphingImages.length,
    })

    // Показываем информацию о стоимости
    const imagesCount = ctx.session.morphingImages.length
    const transitionsCount = imagesCount - 1
    const finalPriceInStars = calculateFinalPrice(MORPHING_MODEL_KEY)
    const totalCost = finalPriceInStars * transitionsCount

    const costMessage = isRu
      ? `💰 <b>Информация о стоимости:</b>

📸 <b>Изображений:</b> ${imagesCount}  
🎬 <b>Видео переходов:</b> ${transitionsCount}
💫 <b>Стоимость за переход:</b> ${finalPriceInStars}⭐  
💎 <b>Общая стоимость:</b> ${totalCost}⭐

✨ Создаю потрясающий морфинг для вас...`
      : `💰 <b>Cost Information:</b>

📸 <b>Images:</b> ${imagesCount}  
🎬 <b>Video transitions:</b> ${transitionsCount}
💫 <b>Cost per transition:</b> ${finalPriceInStars}⭐  
💎 <b>Total cost:</b> ${totalCost}⭐

✨ Creating amazing morphing for you...`

    await ctx.editMessageText(costMessage, {
      parse_mode: 'HTML',
    })

    // Создаем ZIP файл с изображениями
    const zipPath = createMorphingImagesZip(ctx.session.morphingImages)

    // Вызываем сервис генерации морфинга
    await generateMorphing({
      filePath: zipPath,
      telegram_id: ctx.from!.id.toString(),
      is_ru: isRu,
      botName: ctx.botInfo?.username || 'ai_koshey_bot',
      imageCount: imagesCount,
      morphingType: 'seamless',
    })

    // Очищаем сессию и выходим из сцены
    if (ctx.session) {
      ctx.session.morphingImages = []
      ctx.session.morphingProgressMessageId = undefined
    }

    // Удаляем временный файл
    setTimeout(() => {
      try {
        if (fs.existsSync(zipPath)) {
          fs.unlinkSync(zipPath)
          logger.info('Temporary morphing ZIP file deleted', { zipPath })
        }
      } catch (error) {
        logger.error('Error deleting temporary ZIP file', { zipPath, error })
      }
    }, 60000) // Удаляем через минуту

    await ctx.scene.leave()
  } catch (error) {
    logger.error('Error in morphing generation', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })

    const isRu = isRussianFromState(ctx)
    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка при создании морфинга. Попробуйте позже.'
        : '❌ An error occurred while creating morphing. Please try again later.'
    )

    await ctx.scene.leave()
  }
})

// Кнопка "Начать заново"
morphingWizard.action('morphing_restart', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    await ctx.reply(
      isRu
        ? '🔄 Начинаем заново! Загрузка изображений сброшена.'
        : '🔄 Starting over! Image upload reset.'
    )

    // Перезапускаем сцену с самого начала
    await ctx.scene.reenter()
  } catch (error) {
    logger.error('Error restarting morphing wizard', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Кнопка "Отмена"
morphingWizard.action('morphing_cancel', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    await ctx.reply(
      isRu
        ? '❌ Создание морфинга отменено. Возвращаюсь в главное меню.'
        : '❌ Morphing creation cancelled. Returning to main menu.'
    )

    await ctx.scene.leave()
  } catch (error) {
    logger.error('Error cancelling morphing wizard', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

export default morphingWizard
