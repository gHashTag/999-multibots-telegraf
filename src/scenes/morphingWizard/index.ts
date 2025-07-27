import { Markup, Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { generateMorphing } from '../../services/generateMorphing'
import { shouldShowRubles } from '@/core/bot/shouldShowRubles'
import { logger } from '@/utils/logger'
import { Composer } from 'telegraf'
import { calculateModeCost } from '@/price/helpers/modelsCost' // ✅ Используем старую функцию
import { ModeEnum } from '@/interfaces' // ✅ Правильный enum
import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'

// ✅ Функция для создания ZIP из Uint8Array[]
const createMorphingImagesZip = (images: Uint8Array[]): string => {
  const zip = new AdmZip()

  images.forEach((imageBuffer, index) => {
    const filename = `morphing_frame_${index + 1}.jpg`
    zip.addFile(filename, Buffer.from(imageBuffer))
  })

  // Создаем временный файл
  const tempDir = path.join(process.cwd(), 'temp')
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }

  const zipPath = path.join(tempDir, `morphing_${Date.now()}.zip`)
  fs.writeFileSync(zipPath, zip.toBuffer())

  return zipPath
}

console.log('🏗️ [MORPHING DEBUG] Creating morphingWizard scene with 4 steps')

export const morphingWizard = new Scenes.WizardScene<MyContext>(
  'morphing_wizard',

  // Step 1: Приветствие и инструкции
  async ctx => {
    console.log('🧬 [MORPHING DEBUG] Step 1 STARTED - Welcome step')
    const isRu = isRussianFromState(ctx)

    const welcomeMessage = isRu
      ? `🧬 <b>Добро пожаловать в Морфинг Студию!</b>

🎭 Здесь вы можете создать удивительную бесшовную склейку из ваших фотографий.

<b>Как это работает:</b>
• 📸 Отправьте от 2 до 100 фотографий
• 🔄 Мы создадим плавные переходы между кадрами
• 🎬 На выходе получите видео с морфингом
• ⚡ Используем модель Kling-v1.6 для качественного результата

<b>Рекомендации для лучшего результата:</b>
• Используйте схожие по композиции изображения
• Желательно одинаковое разрешение фотографий
• Избегайте слишком контрастных переходов

Готовы начать? Отправьте первую фотографию! 📷`
      : `🧬 <b>Welcome to Morphing Studio!</b>

🎭 Here you can create amazing seamless transitions from your photos.

<b>How it works:</b>
• 📸 Send 2 to 100 photos
• 🔄 We'll create smooth transitions between frames
• 🎬 Get a morphing video as output
• ⚡ Using Kling-v1.6 model for quality results

<b>Tips for best results:</b>
• Use images with similar composition
• Preferably same resolution photos
• Avoid too contrasting transitions

Ready to start? Send your first photo! 📷`

    await ctx.reply(welcomeMessage, {
      parse_mode: 'HTML',
      ...Markup.keyboard([
        [Markup.button.text(isRu ? '❌ Отмена' : '❌ Cancel')],
      ]).resize(),
    })

    // Инициализируем массив изображений
    ctx.session.morphingImages = []

    return ctx.wizard.next()
  },

  // Step 2: Сбор изображений
  async ctx => {
    console.log('🧬 [MORPHING DEBUG] Step 2 STARTED')
    const isRu = isRussianFromState(ctx)

    if (await handleHelpCancel(ctx)) {
      return ctx.scene.leave()
    }

    const message = ctx.message
    console.log(
      '🧬 [MORPHING DEBUG] Step 2 - Message type:',
      message ? Object.keys(message) : 'no message'
    )

    // ✅ ТОЛЬКО ФОТО - убираем обработку /done команды
    if (message && 'photo' in message) {
      console.log('🧬 [MORPHING DEBUG] Step 2 - PHOTO PROCESSING STARTED')
      const photos = message.photo
      console.log('🧬 [MORPHING DEBUG] Step 2 - Photo sizes:', photos.length)

      try {
        console.log('🧬 [MORPHING DEBUG] Step 2 - Getting photo file info')
        const photoInfo = await ctx.telegram.getFile(
          photos[photos.length - 1].file_id
        )
        const photoUrl = `https://api.telegram.org/file/bot${ctx.botInfo.token}/${photoInfo.file_path}`
        console.log(
          '🧬 [MORPHING DEBUG] Step 2 - Downloading image, file_path:',
          photoInfo.file_path
        )

        const response = await fetch(photoUrl)
        const imageBuffer = await response.arrayBuffer()
        const imageBufferUint8 = new Uint8Array(imageBuffer)
        console.log(
          '🧬 [MORPHING DEBUG] Step 2 - Image downloaded, size:',
          imageBufferUint8.length
        )

        console.log('🧬 [MORPHING DEBUG] Step 2 - Validating image...')
        const isValidImage = imageBufferUint8.length > 100
        console.log('Image header:', imageBufferUint8.slice(0, 4))

        if (!isValidImage) {
          const errorMessage = isRu
            ? '❌ Недействительное изображение. Попробуйте другое.'
            : '❌ Invalid image. Please try another one.'
          await ctx.reply(errorMessage)
          return
        }

        console.log(
          '🧬 [MORPHING DEBUG] Step 2 - Image is valid, checking size limit'
        )
        if (imageBufferUint8.length > 10 * 1024 * 1024) {
          const errorMessage = isRu
            ? '❌ Размер изображения слишком большой (максимум 10MB).'
            : '❌ Image size is too large (maximum 10MB).'
          await ctx.reply(errorMessage)
          return
        }

        console.log('🧬 [MORPHING DEBUG] Step 2 - Adding image to session')
        if (!ctx.session.morphingImages) {
          ctx.session.morphingImages = []
        }
        ctx.session.morphingImages.push(imageBufferUint8)
        console.log(
          '🧬 [MORPHING DEBUG] Step 2 - Image added successfully! Count:',
          ctx.session.morphingImages.length
        )

        // ✅ ПОКАЗЫВАЕМ ПРОГРЕСС И КНОПКИ КОГДА >= 2 ФОТО
        if (ctx.session.morphingImages.length >= 2) {
          const currentCount = ctx.session.morphingImages.length
          const maxCount = 5

          const progressMessage = isRu
            ? `🧬 <b>Морфинг</b>\n\n📸 Загружено: ${currentCount}/${maxCount} изображений\n\n` +
              `ℹ️ Вы можете добавить еще фото или подтвердить текущие.`
            : `🧬 <b>Morphing</b>\n\n📸 Uploaded: ${currentCount}/${maxCount} images\n\n` +
              `ℹ️ You can add more photos or confirm the current ones.`

          const buttons = [
            Markup.button.callback(
              isRu ? '✅ Подтвердить' : '✅ Confirm',
              'morphing_confirm'
            ),
            Markup.button.callback(
              isRu ? '❌ Начать заново' : '❌ Start Over',
              'morphing_cancel'
            ),
          ]

          const keyboard = Markup.inlineKeyboard(buttons)

          await ctx.replyWithHTML(progressMessage, keyboard)
          console.log(
            '🧬 [MORPHING DEBUG] Step 2 - ПОКАЗАНЫ КНОПКИ! Ждем callback от пользователя'
          )

          // ✅ НЕ ПЕРЕХОДИМ К STEP 3 СРАЗУ - ждем нажатия кнопки!
          return
        } else {
          // Меньше 2 фото - просим еще
          const needMoreMessage = isRu
            ? `🧬 Загружено: ${ctx.session.morphingImages.length}/5 фото\n\n📸 Загрузите еще минимум ${2 - ctx.session.morphingImages.length} изображение(я)`
            : `🧬 Uploaded: ${ctx.session.morphingImages.length}/5 photos\n\n📸 Upload at least ${2 - ctx.session.morphingImages.length} more image(s)`

          await ctx.reply(needMoreMessage)
          return
        }
      } catch (error) {
        console.error(
          '🧬 [MORPHING DEBUG] Step 2 - ERROR processing photo:',
          error
        )
        const errorMessage = isRu
          ? '❌ Ошибка при загрузке изображения. Попробуйте еще раз.'
          : '❌ Error uploading image. Please try again.'
        await ctx.reply(errorMessage)
        return
      }
    } else {
      // Не фото - просим загрузить фото
      const currentCount = ctx.session.morphingImages?.length || 0
      const messageText = isRu
        ? `🧬 Загружено: ${currentCount}/5 фото\n\n📸 Загрузите изображение`
        : `🧬 Uploaded: ${currentCount}/5 photos\n\n📸 Please upload an image`

      await ctx.reply(messageText)
      return
    }
  },

  // Step 3: Предпросмотр и подтверждение (Composer для обработки callback кнопок)
  (() => {
    const handleMorphingCallback = new Composer<MyContext>()

    // Обработка кнопки "✅ Подтвердить"
    handleMorphingCallback.action('morphing_confirm', async ctx => {
      console.log('🚨🚨🚨 [MORPHING DEBUG] Step 3 FUNCTION CALLED! 🚨🚨🚨')
      console.log('🧬 [MORPHING DEBUG] Step 3 STARTED - CONFIRM PRESSED')

      const isRu = isRussianFromState(ctx)
      await ctx.answerCbQuery() // ✅ ОБЯЗАТЕЛЬНО отвечаем на callback
      await ctx.editMessageReplyMarkup(undefined) // ✅ Убираем кнопки

      if (
        !ctx.session.morphingImages ||
        ctx.session.morphingImages.length < 2
      ) {
        const errorMessage = isRu
          ? '❌ Недостаточно изображений для морфинга. Минимум: 2'
          : '❌ Not enough images for morphing. Minimum: 2'
        await ctx.reply(errorMessage)
        return ctx.wizard.selectStep(1) // Возвращаем к сбору фото
      }

      const imageCount = ctx.session.morphingImages.length
      const showRubles = shouldShowRubles(ctx)

      // Рассчитываем стоимость
      const costResult = calculateModeCost({
        mode: ModeEnum.MorphingWizard,
        numImages: imageCount, // Передаем количество изображений
      })

      const costMessage = showRubles
        ? `💰 <b>Стоимость:</b> ${costResult.rubles} рублей`
        : `💰 <b>Стоимость:</b> ${costResult.stars} ⭐`

      const sequenceMessage = isRu
        ? `🧬 <b>Предпросмотр последовательности морфинга</b>\n\n📋 <b>Ваши изображения (${imageCount} шт.):</b>\n${
            ctx.session.morphingImages
              ?.map((_, index) => {
                if (index === imageCount - 1) {
                  // Последний кадр → Первый кадр (замыкаем цикл)
                  return `${index + 1}. Видео ${index + 1}: Кадр ${index + 1} → Кадр 1`
                } else {
                  // Обычный переход к следующему кадру
                  return `${index + 1}. Видео ${index + 1}: Кадр ${index + 1} → Кадр ${index + 2}`
                }
              })
              .join('\n') || ''
          }\n\n🎬 <b>Результат:</b> ${imageCount} отдельных видео с плавными переходами\n⏱️ <b>Время обработки:</b> ~5-10 минут за видео\n🤖 <b>Модель:</b> Kling-v1.6 (высокое качество)\n\n${costMessage}\n\n❓ Всё верно?`
        : `🧬 <b>Morphing Sequence Preview</b>\n\n📋 <b>Your images (${imageCount} pcs):</b>\n${
            ctx.session.morphingImages
              ?.map((_, index) => {
                if (index === imageCount - 1) {
                  // Last frame → First frame (loop)
                  return `${index + 1}. Video ${index + 1}: Frame ${index + 1} → Frame 1`
                } else {
                  // Regular transition to next frame
                  return `${index + 1}. Video ${index + 1}: Frame ${index + 1} → Frame ${index + 2}`
                }
              })
              .join('\n') || ''
          }\n\n🎬 <b>Result:</b> ${imageCount} separate videos with smooth transitions\n⏱️ <b>Processing time:</b> ~5-10 minutes per video\n🤖 <b>Model:</b> Kling-v1.6 (high quality)\n\n${costMessage}\n\n❓ Everything correct?`

      const confirmButtons = [
        Markup.button.callback(
          isRu ? '🚀 Начать обработку' : '🚀 Start Processing',
          'morphing_process'
        ),
        Markup.button.callback(
          isRu ? '📝 Изменить' : '📝 Modify',
          'morphing_back'
        ),
      ]

      const confirmKeyboard = Markup.inlineKeyboard(confirmButtons)
      await ctx.replyWithHTML(sequenceMessage, confirmKeyboard)

      console.log(
        '🧬 [MORPHING DEBUG] Step 3 - PREVIEW SHOWN, waiting for final confirmation'
      )
      return // Остаемся в Step 3 для обработки следующих кнопок
    })

    // Обработка кнопки "❌ Начать заново"
    handleMorphingCallback.action('morphing_cancel', async ctx => {
      console.log('🧬 [MORPHING DEBUG] Step 3 - CANCEL PRESSED')
      const isRu = isRussianFromState(ctx)
      await ctx.answerCbQuery()
      await ctx.editMessageReplyMarkup(undefined)

      // Очищаем данные сессии
      ctx.session.morphingImages = []

      const restartMessage = isRu
        ? '🔄 Начинаем заново. Загрузите изображения для морфинга:'
        : '🔄 Starting over. Upload images for morphing:'

      await ctx.reply(restartMessage)
      return ctx.wizard.selectStep(1) // Возвращаем к сбору фото
    })

    // Обработка кнопки "📝 Изменить"
    handleMorphingCallback.action('morphing_back', async ctx => {
      console.log('🧬 [MORPHING DEBUG] Step 3 - BACK PRESSED')
      const isRu = isRussianFromState(ctx)
      await ctx.answerCbQuery()
      await ctx.editMessageReplyMarkup(undefined)

      const backMessage = isRu
        ? '📝 Вы можете добавить еще изображения или изменить существующие:'
        : '📝 You can add more images or modify existing ones:'

      await ctx.reply(backMessage)
      return ctx.wizard.selectStep(1) // Возвращаем к сбору фото
    })

    // Обработка кнопки "🚀 Начать обработку"
    handleMorphingCallback.action('morphing_process', async ctx => {
      console.log(
        '🧬 [MORPHING DEBUG] Step 3 - PROCESS PRESSED - переход к Step 4'
      )
      const isRu = isRussianFromState(ctx)
      await ctx.answerCbQuery()
      await ctx.editMessageReplyMarkup(undefined)

      const processingMessage = isRu
        ? '🚀 Начинаем обработку морфинга...'
        : '🚀 Starting morphing processing...'

      await ctx.reply(processingMessage)
      return ctx.wizard.next() // Переходим к Step 4 (обработка)
    })

    // Fallback для неожиданных callback'ов
    handleMorphingCallback.use(async ctx => {
      console.log(
        '🧬 [MORPHING DEBUG] Step 3 - UNEXPECTED callback:',
        ctx.callbackQuery
      )
      await ctx.answerCbQuery('Неизвестная команда')
    })

    return handleMorphingCallback
  })(),

  // Step 4: Обработка и отправка на сервер
  async ctx => {
    console.log(
      '🧬 [MORPHING DEBUG] Step 4 STARTED - Processing and sending to server'
    )
    const isRu = isRussianFromState(ctx)

    await ctx.reply(
      isRu
        ? '🧬 Начинаю создание морфинга...\n⏳ Это может занять несколько минут.'
        : '🧬 Starting morphing creation...\n⏳ This may take several minutes.'
    )

    let zipPath: string | undefined
    try {
      console.log('🧬 [MORPHING DEBUG] Step 4 - Creating ZIP archive')
      // Создаем архив изображений
      zipPath = createMorphingImagesZip(ctx.session.morphingImages)
      console.log('🧬 [MORPHING DEBUG] Step 4 - ZIP created at:', zipPath)
      logger.info('[Morphing Wizard] ZIP created', {
        telegramId: ctx.from?.id,
        zipPath,
        imageCount: ctx.session.morphingImages.length,
      })

      // 🧬 Отправляем на сервер для морфинга
      console.log(
        '🧬 [MORPHING DEBUG] Step 4 - Sending to generateMorphing server'
      )
      const morphingResult = await generateMorphing(
        {
          filePath: zipPath,
          telegram_id: ctx.from?.id?.toString() || '',
          is_ru: isRu,
          botName: ctx.botInfo?.username || '',
          imageCount: ctx.session.morphingImages.length,
          morphingType: 'seamless', // Бесшовная склейка
        },
        ctx
      )

      console.log(
        '🧬 [MORPHING DEBUG] Step 4 - Morphing result:',
        morphingResult
      )
      logger.info('[Morphing Wizard] Morphing request sent', {
        telegramId: ctx.from?.id,
        result: morphingResult,
      })

      const successMessage = isRu
        ? `✅ Морфинг отправлен на обработку!

🎬 Ваш морфинг будет готов через 5-10 минут
📱 Мы пришлем уведомление, когда обработка завершится
🧬 Используемая модель: Kling-v1.6

Спасибо за использование Морфинг Студии! ✨`
        : `✅ Morphing sent for processing!

🎬 Your morphing will be ready in 5-10 minutes
📱 We'll send a notification when processing is complete
🧬 Model used: Kling-v1.6

Thank you for using Morphing Studio! ✨`

      await ctx.reply(successMessage)
    } catch (error) {
      logger.error('[Morphing Wizard] Error during processing', {
        telegramId: ctx.from?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      })

      const errorMessage = isRu
        ? '❌ Произошла ошибка при обработке морфинга. Попробуйте позже или обратитесь в поддержку.'
        : '❌ Error occurred during morphing processing. Please try again later or contact support.'

      await ctx.reply(errorMessage)
    } finally {
      // ✅ Очищаем временный ZIP файл если он был создан
      if (typeof zipPath === 'string' && fs.existsSync(zipPath)) {
        try {
          fs.unlinkSync(zipPath)
          console.log(
            '🧬 [MORPHING DEBUG] Step 4 - Temporary ZIP file cleaned:',
            zipPath
          )
        } catch (cleanupError) {
          console.error(
            '🧬 [MORPHING DEBUG] Step 4 - Failed to cleanup ZIP:',
            cleanupError
          )
        }
      }

      // Очищаем данные сессии
      ctx.session.morphingImages = []
      await ctx.scene.leave()
    }
  }
)
