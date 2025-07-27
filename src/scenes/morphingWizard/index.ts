import { Markup, Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { isValidImage } from '../../helpers/images'
import { getBotToken } from '@/handlers'
import { createImagesZip } from '../../helpers/images/createImagesZip'
import { generateMorphing } from '../../services/generateMorphing'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import { ModeEnum } from '@/interfaces'
import { shouldShowRubles } from '@/core/bot/shouldShowRubles'
import { logger } from '@/utils/logger'

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

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      console.log('🧬 [MORPHING DEBUG] Step 2 - CANCELLED by handleHelpCancel')
      return ctx.scene.leave()
    }

    const message = ctx.message
    console.log(
      '🧬 [MORPHING DEBUG] Step 2 - Message type:',
      message ? Object.keys(message) : 'no message'
    )

    // ОБРАБОТКА КОМАНДЫ /done - ПЕРЕХОД К ПРЕДПРОСМОТРУ
    if (message && 'text' in message && message.text === '/done') {
      console.log('🧬 [MORPHING DEBUG] Step 2 - /done command received!')

      if (
        !ctx.session.morphingImages ||
        ctx.session.morphingImages.length < 2
      ) {
        console.log(
          '🧬 [MORPHING DEBUG] Step 2 - Not enough images:',
          ctx.session.morphingImages?.length
        )
        await ctx.reply(
          isRu
            ? '⚠️ Минимум 2 изображения нужно для морфинга. Добавьте еще!'
            : '⚠️ Minimum 2 images required for morphing. Add more!'
        )
        return
      }

      console.log(
        '🧬 [MORPHING DEBUG] Step 2 - Current wizard cursor BEFORE next:',
        ctx.wizard.cursor
      )
      console.log('🧬 [MORPHING DEBUG] Step 2 - Calling ctx.wizard.next()...')

      try {
        const result = ctx.wizard.next()
        console.log(
          '🧬 [MORPHING DEBUG] Step 2 - ctx.wizard.next() result:',
          result
        )
        console.log(
          '🧬 [MORPHING DEBUG] Step 2 - Current wizard cursor AFTER next:',
          ctx.wizard.cursor
        )
        console.log('🧬 [MORPHING DEBUG] Step 2 - Moving to Step 3 (preview)')
        return result
      } catch (error) {
        console.error(
          '🧬 [MORPHING DEBUG] Step 2 - ERROR in ctx.wizard.next():',
          error
        )
        // Принудительно вызываем Step 3
        console.log('🧬 [MORPHING DEBUG] Step 2 - FORCING Step 3 manually...')
        return ctx.scene.reenter()
      }
    }

    // Обработка фотографий
    if (message && 'photo' in message) {
      console.log('🧬 [MORPHING DEBUG] Step 2 - PHOTO PROCESSING STARTED')
      console.log(
        '🧬 [MORPHING DEBUG] Step 2 - Photo sizes:',
        message.photo.length
      )

      // Проверяем лимит изображений
      if (
        ctx.session.morphingImages &&
        ctx.session.morphingImages.length >= 100
      ) {
        console.log('🧬 [MORPHING DEBUG] Step 2 - MAX IMAGES REACHED')
        await ctx.reply(
          isRu
            ? '📸 Достигнут максимум в 100 изображений. Используйте /done для завершения.'
            : '📸 Maximum of 100 images reached. Use /done to finish.'
        )
        return
      }

      console.log('🧬 [MORPHING DEBUG] Step 2 - Getting photo file info')
      const photo = message.photo[message.photo.length - 1]
      const file = await ctx.telegram.getFile(photo.file_id)

      if (!file.file_path) {
        console.log('🧬 [MORPHING DEBUG] Step 2 - ERROR: No file path')
        await ctx.reply(
          isRu ? '❌ Ошибка получения файла' : '❌ Error getting file'
        )
        return
      }

      console.log(
        '🧬 [MORPHING DEBUG] Step 2 - Downloading image, file_path:',
        file.file_path
      )
      const botToken = getBotToken(ctx)
      const response = await fetch(
        `https://api.telegram.org/file/bot${botToken}/${file.file_path}`
      )
      const buffer = Buffer.from(await response.arrayBuffer())

      console.log(
        '🧬 [MORPHING DEBUG] Step 2 - Image downloaded, size:',
        buffer.length
      )
      console.log('🧬 [MORPHING DEBUG] Step 2 - Validating image...')
      const isValid = await isValidImage(buffer)
      if (!isValid) {
        console.log(
          '🧬 [MORPHING DEBUG] Step 2 - ERROR: Image validation failed'
        )
        await ctx.reply(
          isRu
            ? '❌ Файл не является корректным изображением.'
            : '❌ File is not a valid image.'
        )
        return
      }

      console.log(
        '🧬 [MORPHING DEBUG] Step 2 - Image is valid, checking size limit'
      )
      const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10 MB
      if (buffer.length > MAX_IMAGE_SIZE) {
        console.log(
          '🧬 [MORPHING DEBUG] Step 2 - ERROR: Image too large:',
          buffer.length
        )
        await ctx.reply(
          isRu
            ? '❌ Изображение слишком большое (max 10MB).'
            : '❌ Image too large (max 10MB).'
        )
        return
      }

      console.log('🧬 [MORPHING DEBUG] Step 2 - Adding image to session')
      // Добавляем изображение
      if (!ctx.session.morphingImages) {
        ctx.session.morphingImages = []
        console.log(
          '🧬 [MORPHING DEBUG] Step 2 - Initialized morphingImages array'
        )
      }

      ctx.session.morphingImages.push({
        buffer: Buffer.from(buffer),
        filename: `morphing_frame_${ctx.session.morphingImages.length + 1}.jpg`,
      })

      const currentCount = ctx.session.morphingImages.length
      console.log(
        '🧬 [MORPHING DEBUG] Step 2 - Image added successfully! Count:',
        currentCount
      )

      await ctx.reply(
        isRu
          ? `✅ Изображение ${currentCount} добавлено! ${currentCount >= 2 ? 'Можете отправить еще или использовать /done для завершения.' : 'Отправьте еще минимум 1 изображение.'}`
          : `✅ Image ${currentCount} added! ${currentCount >= 2 ? 'You can send more or use /done to finish.' : 'Send at least 1 more image.'}`
      )

      logger.info(`[Morphing Wizard] Image ${currentCount} added`, {
        telegramId: ctx.from?.id,
        imageCount: currentCount,
      })
    } else {
      console.log(
        '🧬 [MORPHING DEBUG] Step 2 - No photo message, showing instruction'
      )
      await ctx.reply(
        isRu
          ? 'Пожалуйста, отправьте фото или /done для завершения сбора.'
          : 'Please send a photo or /done to finish collection.'
      )
    }

    return // Остаемся на том же шаге для сбора изображений
  },

  // Step 3: Предпросмотр последовательности и подтверждение стоимости
  async ctx => {
    console.log('🚨🚨🚨 [MORPHING DEBUG] Step 3 FUNCTION CALLED! 🚨🚨🚨')
    console.log('🧬 [MORPHING DEBUG] Step 3 STARTED')
    console.log(
      '🧬 [MORPHING DEBUG] Step 3 - Has callbackQuery:',
      !!ctx.callbackQuery
    )
    console.log('🧬 [MORPHING DEBUG] Step 3 - Has message:', !!ctx.message)

    const isRu = isRussianFromState(ctx)
    const showRubles = shouldShowRubles(ctx)

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      console.log('🧬 [MORPHING DEBUG] Step 3 - CANCELLED by handleHelpCancel')
      return ctx.scene.leave()
    }

    const message = ctx.message
    console.log(
      '🧬 [MORPHING DEBUG] Step 3 - Message type:',
      message ? Object.keys(message) : 'no message'
    )

    // Обработка кнопок подтверждения
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      console.log(
        '🧬 [MORPHING DEBUG] Step 3 - Processing callback:',
        ctx.callbackQuery.data
      )
      const data = ctx.callbackQuery.data
      await ctx.answerCbQuery()

      if (data === 'confirm_morphing') {
        console.log(
          '🧬 [MORPHING DEBUG] Step 3 - CONFIRMED morphing, moving to Step 4'
        )
        logger.info('[Morphing Wizard] User confirmed morphing', {
          telegramId: ctx.from?.id,
          imageCount: ctx.session.morphingImages?.length,
        })
        return ctx.wizard.next() // Переходим к обработке
      } else if (data === 'change_order') {
        await ctx.reply(
          isRu
            ? '🔄 Функция изменения порядка будет добавлена в следующих версиях. Пока пересоберите изображения в нужном порядке.'
            : '🔄 Order change feature will be added in future versions. Please recollect images in desired order for now.'
        )
        return ctx.wizard.selectStep(1) // Возвращаемся к сбору изображений
      } else if (data === 'cancel_morphing') {
        await ctx.reply(isRu ? '❌ Морфинг отменен' : '❌ Morphing cancelled')
        return ctx.scene.leave()
      }
    }

    // Показываем предпросмотр последовательности
    // (при первом входе в шаг или когда нет callback query)
    if (!ctx.callbackQuery) {
      console.log(
        '🧬 [MORPHING DEBUG] Step 3 - SHOWING PREVIEW (no callbackQuery)'
      )
      const imageCount = ctx.session.morphingImages?.length || 0
      console.log('🧬 [MORPHING DEBUG] Step 3 - Image count:', imageCount)

      // Рассчитываем стоимость
      const costResult = calculateModeCost({
        mode: ModeEnum.MorphingWizard,
        numImages: 1, // Фиксированная цена за морфинг
      })

      const costMessage = isRu
        ? `💰 <b>Стоимость морфинга:</b>
⭐ ${costResult.stars} звезд${showRubles ? ` (${costResult.rubles} ₽)` : ` ($${costResult.dollars})`}`
        : `💰 <b>Morphing cost:</b>
⭐ ${costResult.stars} stars${showRubles ? ` (${costResult.rubles} ₽)` : ` ($${costResult.dollars})`}`

      const sequenceMessage = isRu
        ? `🧬 <b>Предпросмотр последовательности морфинга</b>

📋 <b>Ваши изображения (${imageCount} шт.):</b>
${
  ctx.session.morphingImages
    ?.map(
      (_, index) =>
        `${index + 1}. Кадр ${index + 1} → ${index + 2 < imageCount ? `Кадр ${index + 2}` : 'Финал'}`
    )
    .join('\n') || ''
}

🎬 <b>Результат:</b> Плавная анимация переходов между кадрами
⏱️ <b>Время обработки:</b> ~5-10 минут
🤖 <b>Модель:</b> Kling-v1.6 (высокое качество)

${costMessage}

❓ Всё верно? Подтверждаете создание морфинга?`
        : `🧬 <b>Morphing Sequence Preview</b>

📋 <b>Your images (${imageCount} pcs):</b>
${
  ctx.session.morphingImages
    ?.map(
      (_, index) =>
        `${index + 1}. Frame ${index + 1} → ${index + 2 < imageCount ? `Frame ${index + 2}` : 'Final'}`
    )
    .join('\n') || ''
}

🎬 <b>Result:</b> Smooth transition animation between frames
⏱️ <b>Processing time:</b> ~5-10 minutes
🤖 <b>Model:</b> Kling-v1.6 (high quality)

${costMessage}

❓ Everything correct? Confirm morphing creation?`

      await ctx.reply(sequenceMessage, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              isRu ? '✅ Подтвердить' : '✅ Confirm',
              'confirm_morphing'
            ),
            Markup.button.callback(
              isRu ? '🔄 Изменить порядок' : '🔄 Change order',
              'change_order'
            ),
          ],
          [
            Markup.button.callback(
              isRu ? '❌ Отмена' : '❌ Cancel',
              'cancel_morphing'
            ),
          ],
        ]),
      })
    }

    return // Ждем подтверждения пользователя
  },

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

    try {
      console.log('🧬 [MORPHING DEBUG] Step 4 - Creating ZIP archive')
      // Создаем архив изображений
      const zipPath = await createImagesZip(ctx.session.morphingImages)
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
      // Очищаем данные сессии
      ctx.session.morphingImages = []
      await ctx.scene.leave()
    }
  }
)
