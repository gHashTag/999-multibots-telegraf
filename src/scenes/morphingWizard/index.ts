import { Markup, Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { getBotToken } from '@/handlers/getBotToken'
import { generateMorphing } from '../../services/generateMorphing'
import { shouldShowRubles } from '@/core/bot/shouldShowRubles'
import { logger } from '@/utils/logger'
import { calculateFinalPrice } from '@/price/helpers/calculateFinalPrice'
import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'

// ✅ КОНСТАНТА ДЛЯ МОДЕЛИ МОРФИНГА
const MORPHING_MODEL_KEY = 'kling-v1.6-pro'

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

// ✅ Функция для создания клавиатуры с прогрессом
const createProgressKeyboard = (currentCount: number, isRu: boolean) => {
  const buttons = []

  if (currentCount >= 2) {
    // Достаточно изображений - показываем кнопки действий
    buttons.push([
      Markup.button.callback(
        isRu ? '✅ Создать морфинг' : '✅ Create Morphing',
        'morphing_create'
      ),
    ])
    buttons.push([
      Markup.button.callback(
        isRu ? '🔄 Начать заново' : '🔄 Start Over',
        'morphing_restart'
      ),
    ])
  } else {
    // Нужно больше изображений
    buttons.push([
      Markup.button.callback(
        isRu ? '🔄 Начать заново' : '🔄 Start Over',
        'morphing_restart'
      ),
    ])
  }

  return Markup.inlineKeyboard(buttons)
}

// ✅ Функция для создания сообщения с прогрессом
const createProgressMessage = (currentCount: number, isRu: boolean): string => {
  const progressBar =
    '▓'.repeat(Math.min(currentCount, 10)) +
    '░'.repeat(Math.max(0, 10 - currentCount))

  const baseMessage = isRu
    ? `🧬 <b>Морфинг - Загрузка изображений</b>

📸 <b>Загружено:</b> ${currentCount} из минимум 2 изображений
📊 <b>Прогресс:</b> [${progressBar}] ${currentCount}/∞

${
  currentCount < 2
    ? '⚠️ <i>Загрузите еще минимум ' +
      (2 - currentCount) +
      ' изображение(я)</i>'
    : '✅ <i>Достаточно изображений для создания морфинга!</i>'
}

🎥 <b>Будет создано:</b> ${Math.max(currentCount, 2)} видео переходов
💡 <b>Совет:</b> Больше изображений = больше переходов`
    : `🧬 <b>Morphing - Image Upload</b>

📸 <b>Uploaded:</b> ${currentCount} of minimum 2 images  
📊 <b>Progress:</b> [${progressBar}] ${currentCount}/∞

${
  currentCount < 2
    ? '⚠️ <i>Upload at least ' + (2 - currentCount) + ' more image(s)</i>'
    : '✅ <i>Enough images to create morphing!</i>'
}

🎥 <b>Will create:</b> ${Math.max(currentCount, 2)} transition videos
💡 <b>Tip:</b> More images = more transitions`

  return baseMessage
}

export const morphingWizard = new Scenes.WizardScene<MyContext>(
  'morphing_wizard',

  // Step 1: Вход в сцену и инициализация
  async ctx => {
    console.log('🧬 [MORPHING WIZARD] Step 1 - Scene Entry')
    const isRu = isRussianFromState(ctx)

    // Инициализируем массив изображений
    ctx.session.morphingImages = []
    ctx.session.morphingProgressMessageId = undefined

    const welcomeMessage = isRu
      ? `🧬 <b>Добро пожаловать в Морфинг Студию!</b>

🎬 Создавайте потрясающие видео переходы между изображениями
📸 Загрузите минимум 2 изображения для начала
✨ Система создаст плавные переходы между всеми кадрами

<i>📱 Отправьте первое изображение:</i>`
      : `🧬 <b>Welcome to Morphing Studio!</b>

🎬 Create amazing video transitions between images
📸 Upload minimum 2 images to start
✨ System will create smooth transitions between all frames

<i>📱 Send your first image:</i>`

    await ctx.replyWithHTML(welcomeMessage, Markup.removeKeyboard())
    return ctx.wizard.next()
  },

  // Step 2: Сбор изображений
  async ctx => {
    console.log('🧬 [MORPHING WIZARD] Step 2 - Image Collection')
    const isRu = isRussianFromState(ctx)

    // Проверяем отмену
    if (await handleHelpCancel(ctx)) {
      return ctx.scene.leave()
    }

    // ✅ ОБРАБОТКА CALLBACK КНОПОК
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      await ctx.answerCbQuery()

      const callbackData = ctx.callbackQuery.data
      console.log('🧬 [MORPHING WIZARD] Step 2 - Callback:', callbackData)

      if (callbackData === 'morphing_create') {
        // Переходим к предпросмотру
        if (
          !ctx.session.morphingImages ||
          ctx.session.morphingImages.length < 2
        ) {
          const errorMessage = isRu
            ? '❌ Недостаточно изображений для морфинга. Минимум: 2'
            : '❌ Not enough images for morphing. Minimum: 2'
          await ctx.reply(errorMessage)
          return
        }

        console.log('🧬 [MORPHING WIZARD] Moving to Step 3 - Preview')
        return ctx.wizard.next()
      }

      if (callbackData === 'morphing_restart') {
        // Перезапускаем процесс
        ctx.session.morphingImages = []
        ctx.session.morphingProgressMessageId = undefined

        const restartMessage = isRu
          ? '🔄 Начинаем заново. Отправьте первое изображение:'
          : '🔄 Starting over. Send your first image:'

        await ctx.reply(restartMessage)
        return ctx.wizard.selectStep(0) // Возврат к Step 1
      }

      return
    }

    // ✅ ОБРАБОТКА ФОТОГРАФИЙ
    if (ctx.message && 'photo' in ctx.message) {
      console.log('🧬 [MORPHING WIZARD] Step 2 - Processing photo')

      try {
        const photos = ctx.message.photo
        const photoInfo = await ctx.telegram.getFile(
          photos[photos.length - 1].file_id
        )

        if (!photoInfo.file_path) {
          const errorMessage = isRu
            ? '❌ Ошибка получения информации о файле.'
            : '❌ Error getting file information.'
          await ctx.reply(errorMessage)
          return
        }

        const botToken = getBotToken(ctx)
        const photoUrl = `https://api.telegram.org/file/bot${botToken}/${photoInfo.file_path}`

        const response = await fetch(photoUrl)
        if (!response.ok) {
          const errorMessage = isRu
            ? `❌ Ошибка скачивания изображения: ${response.status}`
            : `❌ Error downloading image: ${response.status}`
          await ctx.reply(errorMessage)
          return
        }

        const imageBuffer = await response.arrayBuffer()
        const imageBufferUint8 = new Uint8Array(imageBuffer)

        // Валидация размера
        if (imageBufferUint8.length > 10 * 1024 * 1024) {
          const errorMessage = isRu
            ? '❌ Размер изображения слишком большой (максимум 10MB).'
            : '❌ Image size too large (maximum 10MB).'
          await ctx.reply(errorMessage)
          return
        }

        // Добавляем изображение в сессию
        if (!ctx.session.morphingImages) {
          ctx.session.morphingImages = []
        }
        ctx.session.morphingImages.push(imageBufferUint8)

        const currentCount = ctx.session.morphingImages.length
        console.log(
          `🧬 [MORPHING WIZARD] Image ${currentCount} added successfully`
        )

        // ✅ ПОКАЗЫВАЕМ ОБНОВЛЕННЫЙ ПРОГРЕСС
        const progressMessage = createProgressMessage(currentCount, isRu)
        const keyboard = createProgressKeyboard(currentCount, isRu)

        // Обновляем или создаем сообщение с прогрессом
        if (ctx.session.morphingProgressMessageId) {
          try {
            await ctx.telegram.editMessageText(
              ctx.chat!.id,
              ctx.session.morphingProgressMessageId,
              undefined,
              progressMessage,
              {
                parse_mode: 'HTML',
                reply_markup: keyboard.reply_markup,
              }
            )
          } catch (error) {
            // Если не удалось обновить - создаем новое
            const newMessage = await ctx.replyWithHTML(
              progressMessage,
              keyboard
            )
            ctx.session.morphingProgressMessageId = newMessage.message_id
          }
        } else {
          // Создаем первое сообщение с прогрессом
          const newMessage = await ctx.replyWithHTML(progressMessage, keyboard)
          ctx.session.morphingProgressMessageId = newMessage.message_id
        }

        // Дополнительное сообщение для мотивации
        if (currentCount === 1) {
          await ctx.reply(
            isRu
              ? '🎉 Отлично! Отправьте еще минимум 1 изображение для создания морфинга.'
              : '🎉 Great! Send at least 1 more image to create morphing.'
          )
        } else if (currentCount >= 2) {
          await ctx.reply(
            isRu
              ? `✨ Превосходно! У вас ${currentCount} изображений. Можете добавить еще или создать морфинг.`
              : `✨ Excellent! You have ${currentCount} images. Add more or create morphing.`
          )
        }
      } catch (error) {
        console.error('🧬 [MORPHING WIZARD] Error processing photo:', error)
        const errorMessage = isRu
          ? '❌ Ошибка при загрузке изображения. Попробуйте еще раз.'
          : '❌ Error uploading image. Please try again.'
        await ctx.reply(errorMessage)
      }

      return
    }

    // Не фото - показываем подсказку
    const currentCount = ctx.session.morphingImages?.length || 0
    const hintMessage = isRu
      ? `📸 Пожалуйста, отправьте изображение.\n\nТекущий прогресс: ${currentCount} из минимум 2`
      : `📸 Please send an image.\n\nCurrent progress: ${currentCount} of minimum 2`

    await ctx.reply(hintMessage)
  },

  // Step 3: Предпросмотр и подтверждение
  async ctx => {
    console.log('🧬 [MORPHING WIZARD] Step 3 - Preview & Confirmation')
    const isRu = isRussianFromState(ctx)

    // ✅ ОБРАБОТКА CALLBACK КНОПОК
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      await ctx.answerCbQuery()

      const callbackData = ctx.callbackQuery.data

      if (callbackData === 'morphing_confirm_create') {
        console.log('🧬 [MORPHING WIZARD] Moving to Step 4 - Processing')
        return ctx.wizard.next()
      }

      if (callbackData === 'morphing_back_to_upload') {
        return ctx.wizard.selectStep(1) // Возврат к Step 2
      }

      return
    }

    // Проверяем достаточность изображений
    if (!ctx.session.morphingImages || ctx.session.morphingImages.length < 2) {
      const errorMessage = isRu
        ? '❌ Недостаточно изображений для морфинга. Минимум: 2'
        : '❌ Not enough images for morphing. Minimum: 2'
      await ctx.reply(errorMessage)
      return ctx.wizard.selectStep(1) // Возврат к Step 2
    }

    const imageCount = ctx.session.morphingImages.length

    // ✅ РАСЧЕТ СТОИМОСТИ
    const singleMorphingCost = calculateFinalPrice(MORPHING_MODEL_KEY)
    const totalCost = singleMorphingCost * imageCount
    const currency = '⭐'

    // Формируем последовательность переходов
    const sequenceLines = []
    for (let i = 0; i < imageCount; i++) {
      const nextIndex = (i + 1) % imageCount
      sequenceLines.push(`   ${i + 1}. Кадр ${i + 1} → Кадр ${nextIndex + 1}`)
    }

    const previewMessage = isRu
      ? `🧬 <b>Предпросмотр Морфинга</b>

📸 <b>Загружено изображений:</b> ${imageCount}
🎥 <b>Будет создано видео:</b> ${imageCount} переходов
💰 <b>Стоимость:</b> ${totalCost} ${currency}

📋 <b>Последовательность переходов:</b>
${sequenceLines.join('\n')}

<i>🎬 Все готово для создания морфинга!</i>`
      : `🧬 <b>Morphing Preview</b>

📸 <b>Images uploaded:</b> ${imageCount}
🎥 <b>Videos to create:</b> ${imageCount} transitions  
💰 <b>Cost:</b> ${totalCost} ${currency}

📋 <b>Transition sequence:</b>
${sequenceLines.join('\n')}

<i>🎬 Ready to create morphing!</i>`

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          isRu ? '🚀 Создать морфинг' : '🚀 Create Morphing',
          'morphing_confirm_create'
        ),
      ],
      [
        Markup.button.callback(
          isRu ? '📝 Изменить изображения' : '📝 Edit Images',
          'morphing_back_to_upload'
        ),
      ],
    ])

    await ctx.replyWithHTML(previewMessage, keyboard)
  },

  // Step 4: Обработка и отправка на сервер
  async ctx => {
    console.log('🧬 [MORPHING WIZARD] Step 4 - Processing & Server Upload')
    const isRu = isRussianFromState(ctx)

    const processingMessage = isRu
      ? '🧬 Начинаю создание морфинга... ✨\n\nЭто может занять несколько секунд.'
      : '🧬 Starting morphing creation... ✨\n\nThis may take a few seconds.'

    await ctx.reply(processingMessage)

    let zipPath: string | undefined

    try {
      // Создаем ZIP архив
      zipPath = createMorphingImagesZip(ctx.session.morphingImages)
      console.log('🧬 [MORPHING WIZARD] ZIP created at:', zipPath)

      // Отправляем на сервер
      const morphingResult = await generateMorphing({
        filePath: zipPath,
        telegram_id: ctx.from?.id?.toString() || '',
        is_ru: isRu,
        botName: ctx.botInfo?.username || '',
        imageCount: ctx.session.morphingImages.length,
        morphingType: 'seamless',
      })

      console.log('🧬 [MORPHING WIZARD] Morphing result:', morphingResult)
      logger.info('[Morphing Wizard] Success', {
        telegramId: ctx.from?.id,
        result: morphingResult,
      })

      const successMessage = isRu
        ? `✅ <b>Морфинг отправлен на обработку!</b>

🎬 Ваш морфинг будет готов через <b>5-10 минут</b>
📱 Мы пришлем уведомление, когда обработка завершится
🧬 Используемая модель: <b>Kling-v1.6</b>

<i>Спасибо за использование Морфинг Студии! ✨</i>`
        : `✅ <b>Morphing sent for processing!</b>

🎬 Your morphing will be ready in <b>5-10 minutes</b>
📱 We'll send a notification when processing is complete  
🧬 Model used: <b>Kling-v1.6</b>

<i>Thank you for using Morphing Studio! ✨</i>`

      await ctx.replyWithHTML(successMessage)
    } catch (error) {
      console.error('🧬 [MORPHING WIZARD] Error:', error)
      logger.error('[Morphing Wizard] Error', {
        telegramId: ctx.from?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      })

      const errorMessage = isRu
        ? '❌ Произошла ошибка при обработке морфинга. Попробуйте позже или обратитесь в поддержку.'
        : '❌ Error occurred during morphing processing. Please try again later or contact support.'

      await ctx.reply(errorMessage)
    } finally {
      // Очищаем временный файл
      if (zipPath && fs.existsSync(zipPath)) {
        try {
          fs.unlinkSync(zipPath)
          console.log('🧬 [MORPHING WIZARD] Temp file cleaned:', zipPath)
        } catch (cleanupError) {
          console.error('🧬 [MORPHING WIZARD] Cleanup error:', cleanupError)
        }
      }

      // Очищаем сессию и выходим
      ctx.session.morphingImages = []
      ctx.session.morphingProgressMessageId = undefined
      await ctx.scene.leave()
    }
  }
)
