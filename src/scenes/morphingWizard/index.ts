import { Markup, Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { isValidImage } from '../../helpers/images'
import { getBotToken } from '@/handlers'
import { createImagesZip } from '../../helpers/images/createImagesZip'
import { generateMorphing } from '../../services/generateMorphing'
import { logger } from '@/utils/logger'

export const morphingWizard = new Scenes.WizardScene<MyContext>(
  'morphing_wizard',

  // Step 1: Приветствие
  async ctx => {
    logger.info('🧬 [Morphing Wizard] Step 1 ENTERED - Welcome step', {
      telegramId: ctx.from?.id,
    })

    const isRu = isRussianFromState(ctx)

    const welcomeMessage = isRu
      ? `🧬 <b>Добро пожаловать в Морфинг Студию!</b>

🎭 Здесь вы можете создать удивительную бесшовную склейку из ваших фотографий.

<b>Как это работает:</b>
• 📸 Отправьте от 2 до 100 фотографий
• 🧬 Мы создадим плавные переходы между кадрами  
• 📹 На выходе получите видео с морфингом
• ⚡ Используем модель Kling-v1.6 для качественного результата

Готовы начать? Отправьте фотографии и напишите /done когда закончите!`
      : `🧬 <b>Welcome to Morphing Studio!</b>

🎭 Here you can create amazing seamless blending from your photos.

<b>How it works:</b>
• 📸 Send from 2 to 100 photos
• 🧬 We'll create smooth transitions between frames
• 📹 Get a video with morphing as result
• ⚡ Using Kling-v1.6 model for quality results

Ready to start? Send your photos and write /done when finished!`

    await ctx.reply(welcomeMessage, {
      parse_mode: 'HTML',
      ...Markup.keyboard([[isRu ? '❌ Отмена' : '❌ Cancel']]).resize(),
    })

    // Инициализируем массив для изображений морфинга
    if (!ctx.session.morphingImages) {
      ctx.session.morphingImages = []
    }

    return ctx.wizard.next()
  },

  // Step 2: Сбор изображений и обработка
  async ctx => {
    logger.info('🧬 [Morphing Wizard] Step 2 ENTERED - Collection step', {
      telegramId: ctx.from?.id,
    })

    const isRu = isRussianFromState(ctx)

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    const message = ctx.message

    // Проверяем команду завершения сбора
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

      // Начинаем обработку
      await ctx.reply(
        isRu
          ? '🧬 Начинаю создание морфинга...\n⏳ Это может занять несколько минут.'
          : '🧬 Starting morphing creation...\n⏳ This may take several minutes.'
      )

      try {
        // Создаем архив изображений
        const zipPath = await createImagesZip(ctx.session.morphingImages)
        logger.info('[Morphing Wizard] ZIP created', {
          telegramId: ctx.from?.id,
          zipPath,
          imageCount: ctx.session.morphingImages.length,
        })

        // 🧬 Отправляем на сервер для морфинга
        const morphingResult = await generateMorphing(
          {
            filePath: zipPath,
            telegram_id: ctx.from?.id?.toString() || '',
            is_ru: isRu,
            botName: ctx.botInfo?.username || '',
            imageCount: ctx.session.morphingImages.length,
            morphingType: 'seamless',
          },
          ctx
        )

        const successMessage = isRu
          ? `✅ Морфинг отправлен на обработку!

🎬 Ваш морфинг будет готов через 5-10 минут
📱 Мы пришлем уведомление, когда обработка завершится

Спасибо за использование Морфинг Студии! ✨`
          : `✅ Morphing sent for processing!

🎬 Your morphing will be ready in 5-10 minutes  
📱 We'll send a notification when processing is complete

Thank you for using Morphing Studio! ✨`

        await ctx.reply(successMessage, Markup.removeKeyboard())
      } catch (error) {
        console.error('Ошибка при обработке команды /done:', error)

        const errorMessage = isRu
          ? '❌ Произошла ошибка при обработке морфинга. Попробуйте позже.'
          : '❌ Error occurred during morphing processing. Please try again later.'

        await ctx.reply(errorMessage)
      } finally {
        // Очищаем данные сессии
        ctx.session.morphingImages = []
      }

      return ctx.scene.leave()
    }

    // Обработка фотографий
    if (message && 'photo' in message) {
      // Проверяем лимит изображений
      if (
        ctx.session.morphingImages &&
        ctx.session.morphingImages.length >= 100
      ) {
        await ctx.reply(
          isRu
            ? '📸 Достигнут максимум в 100 изображений. Используйте /done для завершения.'
            : '📸 Maximum of 100 images reached. Use /done to finish.'
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

      // Добавляем изображение
      if (!ctx.session.morphingImages) {
        ctx.session.morphingImages = []
      }

      ctx.session.morphingImages.push({
        buffer: Buffer.from(buffer),
        filename: `morphing_frame_${ctx.session.morphingImages.length + 1}.jpg`,
      })

      const currentCount = ctx.session.morphingImages.length

      await ctx.reply(
        isRu
          ? `✅ Изображение ${currentCount} добавлено! ${currentCount >= 2 ? 'Можете отправить еще или использовать /done для завершения.' : 'Отправьте еще минимум 1 изображение.'}`
          : `✅ Image ${currentCount} added! ${currentCount >= 2 ? 'You can send more or use /done to finish.' : 'Send at least 1 more image.'}`
      )
    } else {
      await ctx.reply(
        isRu
          ? 'Пожалуйста, отправьте фото или /done для завершения сбора.'
          : 'Please send a photo or /done to finish collection.'
      )
    }

    return // Остаемся на том же шаге для сбора изображений
  }
)
