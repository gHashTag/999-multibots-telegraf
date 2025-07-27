import { Markup, Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { isValidImage } from '../../helpers/images'
import { getBotToken } from '@/handlers'
import { createImagesZip } from '../../helpers/images/createImagesZip'
import { logger } from '@/utils/logger'

export const morphingWizard = new Scenes.WizardScene<MyContext>(
  'morphing_wizard',

  // Step 1: Приветствие и инструкции
  async ctx => {
    const isRu = isRussianFromState(ctx)

    const welcomeMessage = isRu
      ? `🧬 <b>Добро пожаловать в Морфинг Студию!</b>

🎭 Здесь вы можете создать удивительную бесшовную склейку из ваших фотографий. 

<b>Как это работает:</b>
• Отправьте от 2 до 100 фотографий
• Мы создадим плавные переходы между кадрами
• Получите видео с красивым морфингом

<b>Требования к фотографиям:</b>
📷 Высокое качество (до 10MB каждая)
🎯 Похожие объекты или лица для лучшего эффекта
🔄 Разные ракурсы добавят динамичности

Готовы начать? Отправьте первую фотографию!`
      : `🧬 <b>Welcome to Morphing Studio!</b>

🎭 Here you can create amazing seamless transitions between your photos.

<b>How it works:</b>
• Send from 2 to 100 photos
• We'll create smooth transitions between frames
• Get a video with beautiful morphing effect

<b>Photo requirements:</b>
📷 High quality (up to 10MB each)
🎯 Similar objects or faces for better effect
🔄 Different angles will add dynamics

Ready to start? Send your first photo!`

    await ctx.reply(welcomeMessage, {
      parse_mode: 'HTML',
      ...Markup.keyboard([
        [Markup.button.text(isRu ? 'Отмена' : 'Cancel')],
      ]).resize(),
    })

    // Инициализируем массив изображений
    ctx.session.images = []
    ctx.session.morphingImages = []

    return ctx.wizard.next()
  },

  // Step 2: Сбор фотографий
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message

    // Проверка на отмену
    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    // Проверка команды /done
    if (message && 'text' in message && message.text === '/done') {
      if (
        !ctx.session.morphingImages ||
        ctx.session.morphingImages.length < 2
      ) {
        await ctx.reply(
          isRu
            ? `📸 Необходимо минимум 2 изображения для морфинга. Сейчас: ${ctx.session.morphingImages?.length || 0}`
            : `📸 Minimum 2 images required for morphing. Current: ${ctx.session.morphingImages?.length || 0}`
        )
        return
      }

      // Переходим к подтверждению
      const confirmMessage = isRu
        ? `✅ <b>Готово!</b>

Получено изображений: <b>${ctx.session.morphingImages.length}</b>

🧬 Создаем плавные переходы между кадрами:
${ctx.session.morphingImages.map((_, i) => `${i + 1} → ${i + 2 > ctx.session.morphingImages.length ? 1 : i + 2}`).join('\n')}

Это займет несколько минут. Начинаем обработку?`
        : `✅ <b>Ready!</b>

Images received: <b>${ctx.session.morphingImages.length}</b>

🧬 Creating smooth transitions between frames:
${ctx.session.morphingImages.map((_, i) => `${i + 1} → ${i + 2 > ctx.session.morphingImages.length ? 1 : i + 2}`).join('\n')}

This will take a few minutes. Start processing?`

      await ctx.reply(confirmMessage, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              isRu ? '🚀 Начать морфинг' : '🚀 Start morphing',
              'start_morphing'
            ),
            Markup.button.callback(
              isRu ? '❌ Отмена' : '❌ Cancel',
              'cancel_morphing'
            ),
          ],
        ]),
      })
      return ctx.wizard.next()
    }

    // Обработка фотографий
    if (message && 'photo' in message) {
      if (!ctx.session.morphingImages) {
        ctx.session.morphingImages = []
      }

      // Проверяем лимит
      if (ctx.session.morphingImages.length >= 100) {
        await ctx.reply(
          isRu
            ? '📸 Достигнут максимум изображений (100). Отправьте /done для продолжения.'
            : '📸 Maximum images reached (100). Send /done to continue.'
        )
        return
      }

      const photo = message.photo[message.photo.length - 1]
      const file = await ctx.telegram.getFile(photo.file_id)

      if (!file.file_path) {
        await ctx.reply(
          isRu ? '❌ Ошибка получения файла' : '❌ Error getting file'
        )
        return
      }

      const botToken = getBotToken(ctx)
      const response = await fetch(
        `https://api.telegram.org/file/bot${botToken}/${file.file_path}`
      )
      const buffer = Buffer.from(await response.arrayBuffer())
      const isValid = await isValidImage(buffer)

      if (!isValid) {
        await ctx.reply(
          isRu
            ? '❌ Файл не является корректным изображением.'
            : '❌ File is not a valid image.'
        )
        return
      }

      const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10 MB
      if (buffer.length > MAX_IMAGE_SIZE) {
        await ctx.reply(
          isRu
            ? '❌ Изображение слишком большое (max 10MB).'
            : '❌ Image too large (max 10MB).'
        )
        return
      }

      // Добавляем изображение в массив для морфинга
      ctx.session.morphingImages.push({
        buffer: Buffer.from(buffer),
        filename: `morph_frame_${ctx.session.morphingImages.length + 1}.jpg`,
      })

      // Также добавляем в обычный массив для совместимости
      if (!ctx.session.images) {
        ctx.session.images = []
      }
      ctx.session.images.push({
        buffer: Buffer.from(buffer),
        filename: `morph_frame_${ctx.session.images.length + 1}.jpg`,
      })

      const progressMessage = isRu
        ? `✅ Изображение ${ctx.session.morphingImages.length} добавлено.

📊 Прогресс: ${ctx.session.morphingImages.length}/100
${ctx.session.morphingImages.length >= 2 ? '✅ Готово к морфингу!' : '⏳ Нужно еще фото...'}

Отправьте еще фото или /done для завершения.`
        : `✅ Image ${ctx.session.morphingImages.length} added.

📊 Progress: ${ctx.session.morphingImages.length}/100
${ctx.session.morphingImages.length >= 2 ? '✅ Ready for morphing!' : '⏳ Need more photos...'}

Send more photos or /done to finish.`

      await ctx.reply(progressMessage)

      logger.info(
        `[Morphing Wizard] Image ${ctx.session.morphingImages.length} added`,
        {
          telegramId: ctx.from?.id,
          totalImages: ctx.session.morphingImages.length,
        }
      )
    } else {
      // Неподходящий тип сообщения
      await ctx.reply(
        isRu
          ? '📸 Пожалуйста, отправьте фото или /done для завершения сбора.'
          : '📸 Please send a photo or /done to finish collection.'
      )
    }

    return // Остаемся на том же шаге
  },

  // Step 3: Подтверждение и обработка
  async ctx => {
    const isRu = isRussianFromState(ctx)

    // Обработка callback кнопок
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data

      await ctx.answerCbQuery()

      if (data === 'start_morphing') {
        await ctx.editMessageReplyMarkup(undefined) // Убираем кнопки

        const processingMessage = isRu
          ? `🧬 <b>Начинаем магию морфинга!</b>

⏳ Создаем архив из ${ctx.session.morphingImages?.length} изображений...
🔄 Настраиваем последовательность переходов...
🎭 Применяем алгоритм бесшовной склейки...

Это может занять несколько минут. Мы уведомим вас, когда видео будет готово!`
          : `🧬 <b>Starting morphing magic!</b>

⏳ Creating archive from ${ctx.session.morphingImages?.length} images...
🔄 Setting up transition sequence...
🎭 Applying seamless blending algorithm...

This may take a few minutes. We'll notify you when the video is ready!`

        await ctx.reply(processingMessage, { parse_mode: 'HTML' })

        try {
          // Создаем архив изображений
          const zipPath = await createImagesZip(ctx.session.morphingImages)
          logger.info('[Morphing Wizard] ZIP created', {
            telegramId: ctx.from?.id,
            zipPath,
            imageCount: ctx.session.morphingImages.length,
          })

          // TODO: Здесь будет вызов сервиса морфинга
          // await callMorphingService(zipPath, ctx)

          await ctx.reply(
            isRu
              ? '🎉 Архив создан успешно! (Интеграция с сервисом морфинга будет добавлена в следующей версии)'
              : '🎉 Archive created successfully! (Morphing service integration will be added in the next version)'
          )
        } catch (error) {
          logger.error('[Morphing Wizard] Error processing morphing', {
            telegramId: ctx.from?.id,
            error: error.message,
          })

          await ctx.reply(
            isRu
              ? '❌ Произошла ошибка при обработке. Попробуйте еще раз.'
              : '❌ An error occurred during processing. Please try again.'
          )
        }

        return ctx.scene.leave()
      } else if (data === 'cancel_morphing') {
        await ctx.editMessageReplyMarkup(undefined)
        await ctx.reply(isRu ? '❌ Морфинг отменен.' : '❌ Morphing cancelled.')
        return ctx.scene.leave()
      }
    }

    return // Остаемся на шаге, ожидая callback
  }
)
