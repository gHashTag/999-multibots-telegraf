import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'

import { isValidImage } from '../../helpers/images'
import { isRussian } from '@/helpers/language'
import { handleHelpCancel } from '@/navigation'
import { getBotToken } from '@/handlers'
import { telegramFileApiFor } from '@/services/telegramApi'
import { sanitizeModelName } from '@/helpers/sanitizeModelName'

export const trainFluxModelWizard = new Scenes.WizardScene<MyContext>(
  'trainFluxModelWizard',

  // ✅ Шаг 1: Загрузка множественных фото для LoRA обучения (минимум 10)
  // УБРАНЫ первые 3 шага - данные берутся из digitalAvatarBodyWizard
  async ctx => {
    const isRu = isRussian(ctx)
    console.log('Scene: IMAGE COLLECTION (direct from digitalAvatarBodyWizard)')

    // Start each training from an empty photo set. images accumulates via .push
    // across the scene; leaving a prior training's Buffers here would blend them
    // into the next paid training (a wrong/blended avatar the user paid for) and
    // leak memory. Reset on Step-1 entry (runs once per scene entry). iter201.
    ctx.session.images = []

    // ✅ Инициализируем необходимые данные из session
    if (!ctx.session.username) {
      if (ctx.from?.username) {
        ctx.session.username = ctx.from.username
      } else {
        ctx.session.username = `user${ctx.from?.id || 'unknown'}`
      }
    }

    if (!ctx.session.targetUserId && ctx.from?.id) {
      ctx.session.targetUserId = ctx.from.id
    }

    // ✅ Устанавливаем значения по умолчанию для совместимости
    // (если пользователь не проходил trainFluxModelWizard сначала)
    if (!ctx.session.gender) {
      ctx.session.gender = 'male' // значение по умолчанию
      console.log('[trainFluxModelWizard] Using default gender: male')
    }

    if (!ctx.session.modelName) {
      ctx.session.modelName = 'digital_avatar_model'
      ctx.session.triggerWord = ctx.session.modelName.toUpperCase()
      console.log(
        '[trainFluxModelWizard] Using default model name: digital_avatar_model'
      )
    }

    console.log(`[trainFluxModelWizard] Model data initialized:`, {
      gender: ctx.session.gender,
      modelName: ctx.session.modelName,
      username: ctx.session.username,
      targetUserId: ctx.session.targetUserId,
    })

    await ctx.reply(
      isRu
        ? `✅ Модель: "${ctx.session.modelName}"\n\n🔄 <b>ЭТАП: Обучение LoRA модели</b>\n\n📸 Загрузите изображения для обучения ИИ-модели (минимум 10). Это нужно для создания LoRA модели на основе ваших фото.\n\n<i>❗ Это цифровой аватар - используйте 10+ разных фото для качественного обучения.</i>\n\nОтправьте /done когда закончите.\n\nВам потребуется минимум 10 фотографий, которые соответствуют следующим критериям:\n\n   - 📷 <b>Четкость и качество изображения:</b> Фотографии должны быть четкими и высококачественными.\n\n   - 🔄 <b>Разнообразие ракурсов:</b> Используйте фотографии, сделанные с разных ракурсов.\n\n   - 😊 <b>Разнообразие выражений лиц:</b> Включите фотографии с различными выражениями лиц.\n\n   - 💡 <b>Разнообразие освещения:</b> Используйте фотографии, сделанные при разных условиях освещения.\n\n   - 🏞️ <b>Фон и окружение:</b> Фон на фотографиях должен быть нейтральным.\n\n   - 👗 <b>Разнообразие стилей одежды:</b> Включите фотографии в разных нарядах.\n\n   - 🎯 <b>Лицо в центре кадра:</b> Убедитесь, что ваше лицо занимает центральное место на фотографии.\n\n   - 🚫 <b>Минимум постобработки:</b> Избегайте фотографий с сильной постобработкой.\n\n   - ⏳ <b>Разнообразие возрастных периодов:</b> Включите фотографии, сделанные в разные возрастные периоды.`
        : `✅ Model: "${ctx.session.modelName}"\n\n🔄 <b>STAGE: LoRA Model Training</b>\n\n📸 Now upload images for AI model training (minimum 10 images). This is needed to create a LoRA model based on your photos.\n\n<i>❗ This is digital avatar - use 10+ different photos for quality training.</i>\n\nSend /done when finished.\n\nYou will need at least 10 photos that meet the following criteria:\n\n   - 📷 <b>Clear and high-quality image:</b> Photos should be clear and of high quality.\n\n   - 🔄 <b>Variety of angles:</b> Use photos taken from different angles.\n\n   - 😊 <b>Variety of facial expressions:</b> Include photos with different facial expressions.\n\n   - 💡 <b>Variety of lighting conditions:</b> Use photos taken under different lighting conditions.\n\n   - 🏞️ <b>Background and environment:</b> The background in the photos should be neutral.\n\n   - 👗 <b>Variety of clothing styles:</b> Include photos in different outfits.\n\n   - 🎯 <b>Face in center of frame:</b> Make sure your face occupies a central place in the photo.\n\n   - 🚫 <b>Minimal post-processing:</b> Avoid photos with heavy post-processing.\n\n   - ⏳ <b>Variety of age periods:</b> Include photos taken at different age periods.`,
      {
        ...Markup.keyboard([
          [Markup.button.text(isRu ? 'Отмена' : 'Cancel')],
        ]).resize(),
        parse_mode: 'HTML',
      }
    )

    console.log('Proceeding to image upload step (Step 1 of wizard)')
    return ctx.wizard.next()
  },

  // Step 2: Handle Image Collection (тоже самое что было Step 4 в оригинале)
  async ctx => {
    console.log('Scene: IMAGES')
    const isRu = isRussian(ctx)
    const message = ctx.message
    console.log('message', message)
    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    if (message && 'text' in message && message.text === '/done') {
      console.log('Received /done command')
      if (!ctx.session.images || ctx.session.images.length < 10) {
        // Check if images array exists
        await ctx.reply(
          isRu
            ? `📸 Необходимо минимум 10 изображений. Сейчас: ${
                ctx.session.images?.length || 0
              }`
            : `📸 Minimum 10 images required. Current: ${
                ctx.session.images?.length || 0
              }`
        )
        return
      }
      console.log('Proceeding to upload scene')
      // Pass necessary data including gender to the next scene if needed
      // ctx.scene.enter('uploadTrainFluxModelScene', { gender: ctx.session.gender }); // Example if state is passed
      return ctx.scene.enter('uploadTrainFluxModelScene', {
        ...((ctx.scene.state as object) || {}),
        gender: ctx.session.gender,
      })
    }

    if (message && 'photo' in message) {
      // Initialize images array if it doesn't exist
      if (!ctx.session.images) {
        ctx.session.images = []
      }
      // Process the uploaded photo
      const photo = message.photo[message.photo.length - 1]

      try {
        const file = await ctx.telegram.getFile(photo.file_id)

        if (!file.file_path) {
          console.error(
            '[trainFluxModelWizard] File path not found for photo:',
            photo.file_id
          )
          await ctx.reply(
            isRu
              ? '❌ Ошибка получения файла. Попробуйте загрузить фото еще раз.'
              : '❌ Error getting file. Please try uploading the photo again.'
          )
          return
        }
        const botToken = getBotToken(ctx)
        const response = await fetch(
          `${telegramFileApiFor(botToken)}/${file.file_path}`
        )

        if (!response.ok) {
          console.error(
            '[trainFluxModelWizard] Failed to download photo:',
            response.status
          )
          await ctx.reply(
            isRu
              ? '❌ Ошибка загрузки фото. Попробуйте еще раз.'
              : '❌ Failed to download photo. Please try again.'
          )
          return
        }

        const buffer = Buffer.from(await response.arrayBuffer())
        const isValid = await isValidImage(buffer)

        if (!isValid) {
          console.error('[trainFluxModelWizard] Invalid image format')
          await ctx.reply(
            isRu
              ? '❌ Файл не является корректным изображением. Поддерживаются JPG, PNG, WEBP.'
              : '❌ File is not a valid image. Supported formats: JPG, PNG, WEBP.'
          )
          return
        }
        const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10 MB
        if (buffer.length > MAX_IMAGE_SIZE) {
          await ctx.reply(
            isRu
              ? '❌ Изображение слишком большое (максимум 10MB). Попробуйте уменьшить размер или качество.'
              : '❌ Image too large (max 10MB). Try reducing size or quality.'
          )
          return
        }

        // ✅ Telegram automatically compresses images to optimal size
        // No additional compression needed
        console.log(`📸 Image size from Telegram: ${buffer.length} bytes`)
        console.log(
          `📊 Image ${ctx.session.images.length + 1}/10: ${(buffer.length / 1024).toFixed(2)} KB`
        )

        // Cap the collected-image count. Each push holds a full Buffer (up to
        // 10MB) in ctx.session.images, which lives in the shared in-memory
        // MemorySessionStore of the whole multi-bot process. The /done check
        // only enforces a MINIMUM of 10 images; nothing stopped a user from
        // sending photos past that, so RSS climbed until the container
        // OOM-killed every bot. Training needs >= 10; 30 is generous headroom.
        const MAX_TRAINING_IMAGES = 30
        if (ctx.session.images.length >= MAX_TRAINING_IMAGES) {
          await ctx.reply(
            isRu
              ? '❌ Достигнут лимит изображений (максимум 30). Отправьте /done для завершения.'
              : '❌ Image limit reached (max 30). Send /done to finish.'
          )
          return
        }

        ctx.session.images.push({
          buffer: buffer,
          filename: `a_photo_of_${ctx.session.username}x${
            ctx.session.images.length + 1
          }.jpg`,
        })

        await ctx.reply(
          isRu
            ? `✅ Изображение ${ctx.session.images.length} добавлено. ${ctx.session.images.length < 10 ? `Нужно еще ${10 - ctx.session.images.length} фото.` : 'Отправьте /done для завершения.'}`
            : `✅ Image ${ctx.session.images.length} added. ${ctx.session.images.length < 10 ? `Need ${10 - ctx.session.images.length} more photos.` : 'Send /done to finish.'}`
        )
        console.log(`Image ${ctx.session.images.length} added successfully`)
      } catch (error) {
        console.error('[trainFluxModelWizard] Error processing photo:', error)
        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка при обработке фото. Попробуйте загрузить другое изображение.'
            : '❌ Error processing photo. Please try uploading a different image.'
        )
      }
    } else {
      // Handle cases where it's neither /done nor a photo
      await ctx.reply(
        isRu
          ? 'Пожалуйста, отправьте фото или /done.'
          : 'Please send a photo or /done.'
      )
    }
    // Stay on the same step to collect more images
    return
  }
)

export default trainFluxModelWizard
