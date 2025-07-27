import { Markup, Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { getBotToken } from '@/handlers/getBotToken' // ✅ Добавляю импорт
import { generateMorphing } from '../../services/generateMorphing'
import { shouldShowRubles } from '@/core/bot/shouldShowRubles'
import { logger } from '@/utils/logger'
import { calculateModeCost } from '@/price/helpers/modelsCost' // ✅ Используем старую функцию
import { ModeEnum } from '@/interfaces' // ✅ Правильный enum
import { calculateServiceCost } from '@/price/helpers/calculateServiceCost' // ✅ Добавляю импорт себестоимости
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

// ✅ ВЫНЕСЕННАЯ ФУНКЦИЯ STEP 3 ДЛЯ ПРИНУДИТЕЛЬНОГО ВЫЗОВА
async function executeStep3Logic(ctx: MyContext) {
  console.log('🚨🚨🚨 [MORPHING DEBUG] Step 3 FUNCTION CALLED! 🚨🚨🚨')
  console.log('🧬 [MORPHING DEBUG] Step 3 STARTED - PREVIEW DISPLAY')

  const isRu = isRussianFromState(ctx)

  if (!ctx.session.morphingImages || ctx.session.morphingImages.length < 2) {
    const errorMessage = isRu
      ? '❌ Недостаточно изображений для морфинга. Минимум: 2'
      : '❌ Not enough images for morphing. Minimum: 2'
    await ctx.reply(errorMessage)
    return ctx.wizard.selectStep(0) // ✅ Возвращаем к Step 1 (индекс 0)
  }

  const imageCount = ctx.session.morphingImages.length
  const showRubles = false // ✅ ПРИНУДИТЕЛЬНО ИСПОЛЬЗУЕМ ЗВЕЗДЫ вместо shouldShowRubles(ctx)

  // Рассчитываем стоимость
  const costResult = calculateModeCost({
    mode: ModeEnum.MorphingWizard,
    numImages: imageCount,
  })

  const cost = showRubles ? costResult.rubles : costResult.stars
  const currency = showRubles ? 'руб' : '⭐'

  // Формируем последовательность переходов
  const sequenceMessage = []
  for (let i = 0; i < imageCount; i++) {
    const nextIndex = (i + 1) % imageCount
    const videoNumber = i + 1
    sequenceMessage.push(
      `${videoNumber}. Кадр ${i + 1} → Кадр ${nextIndex + 1}`
    )
  }

  const previewMessage = isRu
    ? `🧬 Морфинг\n\n📸 Загружено: ${imageCount} изображений\n🎥 Будет создано: ${imageCount} видео переходов\n\n📋 Последовательность:\n${sequenceMessage.join('\n')}\n\n💰 Стоимость: ${cost} ${currency}\n\nℹ️ Подтвердите создание морфинга:`
    : `🧬 Morphing\n\n📸 Uploaded: ${imageCount} images\n🎥 Will create: ${imageCount} transition videos\n\n📋 Sequence:\n${sequenceMessage.join('\n')}\n\n💰 Cost: ${cost} ${currency}\n\nℹ️ Confirm morphing creation:`

  await ctx.reply(
    previewMessage,
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          isRu ? '🚀 Создать' : '🚀 Create',
          'morphing_process'
        ),
        Markup.button.callback(
          isRu ? '📝 Изменить' : '📝 Edit',
          'morphing_back'
        ),
      ],
    ])
  )
}

// ✅ ВЫНЕСЕННАЯ ФУНКЦИЯ STEP 4 ДЛЯ ПРИНУДИТЕЛЬНОГО ВЫЗОВА
async function executeStep4Logic(ctx: MyContext) {
  console.log(
    '🧬 [MORPHING DEBUG] Step 4 STARTED - Processing and sending to server'
  )
  const isRu = isRussianFromState(ctx)

  await ctx.reply(
    isRu
      ? '🧬 Начинаю создание морфинга... ✨'
      : '🧬 Starting morphing creation... ✨'
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

    console.log('🧬 [MORPHING DEBUG] Step 4 - Morphing result:', morphingResult)
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

console.log('🏗️ [MORPHING DEBUG] Creating morphingWizard scene with 4 steps')

export const morphingWizard = new Scenes.WizardScene<MyContext>(
  'morphing_wizard',
  // Step 1: Приветствие
  async ctx => {
    console.log('🧬 [MORPHING DEBUG] Step 1 STARTED - Welcome step')

    const isRu = isRussianFromState(ctx)

    // Инициализируем сессию
    if (!ctx.session.morphingImages) {
      ctx.session.morphingImages = []
    }

    const welcomeMessage = isRu
      ? '🧬 Морфинг\n\nЗагрузите изображения для создания видео переходов между ними.\n\n📸 Отправьте фотографии (минимум 2):'
      : '🧬 Morphing\n\nUpload images to create transition videos between them.\n\n📸 Send photos (minimum 2):'

    await ctx.reply(welcomeMessage)
    return ctx.wizard.next()
  },

  // Step 2: Сбор изображений
  async ctx => {
    console.log('🧬 [MORPHING DEBUG] Step 2 STARTED')
    const isRu = isRussianFromState(ctx)

    if (await handleHelpCancel(ctx)) {
      return ctx.scene.leave()
    }

    // ✅ ОБРАБОТКА CALLBACK КНОПОК ПРЯМО В STEP 2
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      console.log(
        '🧬 [MORPHING DEBUG] Step 2 - CALLBACK RECEIVED:',
        ctx.callbackQuery.data
      )

      await ctx.answerCbQuery() // ✅ ОБЯЗАТЕЛЬНО отвечаем на callback
      await ctx.editMessageReplyMarkup(undefined) // ✅ Убираем кнопки

      if (ctx.callbackQuery.data === 'morphing_confirm') {
        console.log('🚨🚨🚨 [MORPHING DEBUG] CONFIRM BUTTON PRESSED! 🚨🚨🚨')

        if (
          !ctx.session.morphingImages ||
          ctx.session.morphingImages.length < 2
        ) {
          const errorMessage = isRu
            ? '❌ Недостаточно изображений для морфинга. Минимум: 2'
            : '❌ Not enough images for morphing. Minimum: 2'
          await ctx.reply(errorMessage)
          return ctx.wizard.selectStep(0) // ✅ Возвращаем к Step 1 (индекс 0)
        }

        // ✅ ПРИНУДИТЕЛЬНО ВЫЗЫВАЕМ STEP 3 ЛОГИКУ!
        console.log(
          '🧬 [MORPHING DEBUG] Step 2 - MANUALLY CALLING STEP 3 LOGIC'
        )
        return await executeStep3Logic(ctx)
      }

      if (ctx.callbackQuery.data === 'morphing_cancel') {
        console.log('🧬 [MORPHING DEBUG] Step 2 - CANCEL PRESSED')

        // ✅ Очищаем данные сессии ВСЕ
        ctx.session.morphingImages = []
        ctx.session.morphingButtonsMessageId = undefined

        const restartMessage = isRu
          ? '🔄 Начинаем заново. Загрузите изображения для морфинга:'
          : '🔄 Starting over. Upload images for morphing:'

        await ctx.reply(restartMessage)
        return ctx.wizard.selectStep(0) // ✅ Возвращаем к Step 1 (индекс 0)
      }

      // ✅ ОБРАБОТКА morphing_process В STEP 2 (так как callback попадает сюда!)
      if (ctx.callbackQuery.data === 'morphing_process') {
        console.log(
          '🚨🚨🚨 [MORPHING DEBUG] Step 2 - PROCESS BUTTON PRESSED! 🚨🚨🚨'
        )

        if (
          !ctx.session.morphingImages ||
          ctx.session.morphingImages.length < 2
        ) {
          const errorMessage = isRu
            ? '❌ Недостаточно изображений для морфинга. Минимум: 2'
            : '❌ Not enough images for morphing. Minimum: 2'
          await ctx.reply(errorMessage)
          return ctx.wizard.selectStep(0) // ✅ Возвращаем к Step 1 (индекс 0)
        }

        // ✅ ПРИНУДИТЕЛЬНО ВЫЗЫВАЕМ STEP 4 ЛОГИКУ!
        console.log(
          '🧬 [MORPHING DEBUG] Step 2 - MANUALLY CALLING STEP 4 LOGIC'
        )
        return await executeStep4Logic(ctx) // ✅ Принудительный вызов Step 4
      }

      // ✅ ОБРАБОТКА morphing_back В STEP 2
      if (ctx.callbackQuery.data === 'morphing_back') {
        console.log('🧬 [MORPHING DEBUG] Step 2 - BACK PRESSED')

        // ✅ Сбрасываем ID кнопок для создания новых
        ctx.session.morphingButtonsMessageId = undefined

        const backMessage = isRu
          ? '📝 Вы можете добавить еще изображения или изменить существующие:'
          : '📝 You can add more images or modify existing ones:'

        await ctx.reply(backMessage)
        return ctx.wizard.selectStep(0) // ✅ Возвращаем к Step 1 (индекс 0)
      }

      return // ✅ Завершаем обработку callback
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

        if (!photoInfo.file_path) {
          console.log(
            '🧬 [MORPHING DEBUG] Step 2 - ERROR: No file path in photoInfo'
          )
          const errorMessage = isRu
            ? '❌ Ошибка получения информации о файле.'
            : '❌ Error getting file information.'
          await ctx.reply(errorMessage)
          return
        }

        const botToken = getBotToken(ctx) // ✅ Правильный способ получения токена
        const photoUrl = `https://api.telegram.org/file/bot${botToken}/${photoInfo.file_path}`
        console.log(
          '🧬 [MORPHING DEBUG] Step 2 - Downloading image, photoUrl:',
          photoUrl
        )
        console.log(
          '🧬 [MORPHING DEBUG] Step 2 - Bot token length:',
          botToken.length
        )

        const response = await fetch(photoUrl)

        if (!response.ok) {
          console.log(
            '🧬 [MORPHING DEBUG] Step 2 - ERROR: HTTP',
            response.status,
            response.statusText
          )
          const errorMessage = isRu
            ? `❌ Ошибка скачивания изображения: ${response.status}`
            : `❌ Error downloading image: ${response.status}`
          await ctx.reply(errorMessage)
          return
        }

        const imageBuffer = await response.arrayBuffer()
        const imageBufferUint8 = new Uint8Array(imageBuffer)
        console.log(
          '🧬 [MORPHING DEBUG] Step 2 - Image downloaded, size:',
          imageBufferUint8.length
        )
        console.log('🧬 [MORPHING DEBUG] Step 2 - Response headers:', {
          'content-type': response.headers.get('content-type'),
          'content-length': response.headers.get('content-length'),
          status: response.status,
        })

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

          const progressMessage = isRu
            ? `🧬 <b>Морфинг</b>\n\n📸 Загружено: ${currentCount} изображений\n\n` +
              `ℹ️ Вы можете добавить еще фото или подтвердить текущие для создания ${currentCount} видео переходов.`
            : `🧬 <b>Morphing</b>\n\n📸 Uploaded: ${currentCount} images\n\n` +
              `ℹ️ You can add more photos or confirm current ones to create ${currentCount} transition videos.`

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

          // ✅ ПРОВЕРЯЕМ - есть ли уже сообщение с кнопками?
          if (ctx.session.morphingButtonsMessageId) {
            // Обновляем существующее сообщение
            try {
              await ctx.telegram.editMessageText(
                ctx.chat!.id,
                ctx.session.morphingButtonsMessageId,
                undefined,
                progressMessage,
                {
                  parse_mode: 'HTML',
                  reply_markup: keyboard.reply_markup,
                }
              )
              console.log(
                '🧬 [MORPHING DEBUG] Step 2 - ОБНОВЛЕНО существующее сообщение с кнопками'
              )
            } catch (error) {
              console.log(
                '🧬 [MORPHING DEBUG] Step 2 - Ошибка обновления, создаем новое:',
                error
              )
              // Если не удалось обновить - создаем новое
              const newMessage = await ctx.replyWithHTML(
                progressMessage,
                keyboard
              )
              ctx.session.morphingButtonsMessageId = newMessage.message_id
            }
          } else {
            // Создаем первое сообщение с кнопками
            const newMessage = await ctx.replyWithHTML(
              progressMessage,
              keyboard
            )
            ctx.session.morphingButtonsMessageId = newMessage.message_id
            console.log(
              '🧬 [MORPHING DEBUG] Step 2 - СОЗДАНО первое сообщение с кнопками, ID:',
              newMessage.message_id
            )
          }

          // ✅ НЕ ПЕРЕХОДИМ К STEP 3 СРАЗУ - ждем нажатия кнопки!
          return
        } else {
          // Меньше 2 фото - просим еще
          const needMoreMessage = isRu
            ? `🧬 Загружено: ${ctx.session.morphingImages.length} фото\n\n📸 Загрузите еще минимум ${2 - ctx.session.morphingImages.length} изображение(я) для создания морфинга`
            : `🧬 Uploaded: ${ctx.session.morphingImages.length} photos\n\n📸 Upload at least ${2 - ctx.session.morphingImages.length} more image(s) to create morphing`

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
        ? `🧬 Загружено: ${currentCount} фото\n\n📸 Загрузите изображение для создания морфинга`
        : `🧬 Uploaded: ${currentCount} photos\n\n📸 Please upload an image to create morphing`

      await ctx.reply(messageText)
      return
    }
  },

  // Step 3: Предпросмотр и подтверждение
  async ctx => {
    console.log('🚨🚨🚨 [MORPHING DEBUG] Step 3 FUNCTION CALLED! 🚨🚨🚨')
    console.log('🧬 [MORPHING DEBUG] Step 3 STARTED - PREVIEW DISPLAY')

    const isRu = isRussianFromState(ctx)

    // ✅ ОБРАБОТКА CALLBACK КНОПОК В STEP 3
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      console.log(
        '🧬 [MORPHING DEBUG] Step 3 - CALLBACK RECEIVED:',
        ctx.callbackQuery.data
      )

      await ctx.answerCbQuery() // ✅ ОБЯЗАТЕЛЬНО отвечаем на callback
      await ctx.editMessageReplyMarkup(undefined) // ✅ Убираем кнопки

      if (ctx.callbackQuery.data === 'morphing_process') {
        console.log(
          '🧬 [MORPHING DEBUG] Step 3 - PROCESS PRESSED - переход к Step 4'
        )

        const processingMessage = isRu
          ? '🚀 Начинаем обработку морфинга...'
          : '🚀 Starting morphing processing...'

        await ctx.reply(processingMessage)
        return ctx.wizard.next() // ✅ Переходим к Step 4
      }

      if (ctx.callbackQuery.data === 'morphing_back') {
        console.log('🧬 [MORPHING DEBUG] Step 3 - BACK PRESSED')

        // ✅ Сбрасываем ID кнопок для создания новых
        ctx.session.morphingButtonsMessageId = undefined

        const backMessage = isRu
          ? '📝 Вы можете добавить еще изображения или изменить существующие:'
          : '📝 You can add more images or modify existing ones:'

        await ctx.reply(backMessage)
        return ctx.wizard.selectStep(0) // ✅ Возвращаем к Step 1 (индекс 0)
      }

      return // ✅ Завершаем обработку callback
    }

    // ✅ ЕСЛИ ПОПАЛИ В STEP 3 НЕ ИЗ CALLBACK - ПОКАЗЫВАЕМ ПРЕДПРОСМОТР
    console.log('🧬 [MORPHING DEBUG] Step 3 - DIRECT CALL - SHOWING PREVIEW')

    if (!ctx.session.morphingImages || ctx.session.morphingImages.length < 2) {
      const errorMessage = isRu
        ? '❌ Недостаточно изображений для морфинга. Минимум: 2'
        : '❌ Not enough images for morphing. Minimum: 2'
      await ctx.reply(errorMessage)
      return ctx.wizard.selectStep(0) // ✅ Возвращаем к Step 1 (индекс 0)
    }

    const imageCount = ctx.session.morphingImages.length
    const showRubles = false // ✅ ПРИНУДИТЕЛЬНО ИСПОЛЬЗУЕМ ЗВЕЗДЫ вместо shouldShowRubles(ctx)

    // ✅ ИСПОЛЬЗУЕМ СЕБЕСТОИМОСТЬ ИЗ SERVICE_COST_CONFIG (как в проекте!)
    const costInStars = calculateServiceCost('morphing_seamless', {
      num_images: imageCount,
    })
    const cost = costInStars // Показываем себестоимость напрямую
    const currency = '⭐' // Всегда звезды для себестоимости

    // Формируем последовательность переходов
    const sequenceMessage = []
    for (let i = 0; i < imageCount; i++) {
      const nextIndex = (i + 1) % imageCount
      const videoNumber = i + 1
      sequenceMessage.push(
        `${videoNumber}. Кадр ${i + 1} → Кадр ${nextIndex + 1}`
      )
    }

    const previewMessage = isRu
      ? `🧬 Морфинг\n\n📸 Загружено: ${imageCount} изображений\n🎥 Будет создано: ${imageCount} видео переходов\n\n📋 Последовательность:\n${sequenceMessage.join('\n')}\n\n💰 Стоимость: ${cost} ${currency}\n\nℹ️ Подтвердите создание морфинга:`
      : `🧬 Morphing\n\n📸 Uploaded: ${imageCount} images\n🎥 Will create: ${imageCount} transition videos\n\n📋 Sequence:\n${sequenceMessage.join('\n')}\n\n💰 Cost: ${cost} ${currency}\n\nℹ️ Confirm morphing creation:`

    await ctx.reply(
      previewMessage,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            isRu ? '🚀 Создать' : '🚀 Create',
            'morphing_process'
          ),
          Markup.button.callback(
            isRu ? '📝 Изменить' : '📝 Edit',
            'morphing_back'
          ),
        ],
      ])
    )
  },

  // Step 4: Обработка и отправка на сервер
  async ctx => {
    console.log(
      '🧬 [MORPHING DEBUG] Step 4 STARTED - Processing and sending to server'
    )
    const isRu = isRussianFromState(ctx)

    await ctx.reply(
      isRu
        ? '🧬 Начинаю создание морфинга... ✨'
        : '🧬 Starting morphing creation... ✨'
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
