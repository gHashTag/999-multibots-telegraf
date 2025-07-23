import { Markup, Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers/language'
import { getUserPhotoUrl } from '@/middlewares/getUserPhotoUrl'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'

// Промпты для мужчин и женщин на основе предоставленного шаблона
const createPromptByGender = (gender: 'male' | 'female'): string => {
  const basePrompt = `[Digital cinematic still. Medium close-up] An vary fashionable, magnetic 40-year-old person with sharp features stands against a serene, pastel mint background. They wear clear glasses of pastel mint color. They wear a tailored, Italian-style Tiffany pastel mint blazer directly on their BARE chest, accentuating their confident and sophisticated look. Their hands hold a book titled "VIBE CODING" its cover with a gentle pastel Tiffany white light. The book is the clear focal point of the frame— their fingers delicately presenting it to the viewer. Behind their head, a large, soft orange halo creates a saint-like aura, blending harmoniously with the pastel mint background. The lighting is soft and diffuse, enhancing the tranquil, refined atmosphere. Their expression is calm and composed, inviting attention to the book as the centerpiece of the scene. The entire color palette is unified by soothing Tiffany blue and soft orange hues, mirroring the atmosphere and mood of the reference image.`

  if (gender === 'male') {
    return basePrompt.replace(
      'An vary fashionable, magnetic 40-year-old person with sharp features',
      'An vary fashionable, magnetic 40-year-old bald man with sharp features and a flawlessly sculpted beard'
    ).replace(/their|they/g, (match) => match === 'they' ? 'he' : 'his')
  } else {
    return basePrompt.replace(
      'An vary fashionable, magnetic 40-year-old person with sharp features',
      'An vary fashionable, magnetic 40-year-old elegant woman with refined features and perfect makeup'
    ).replace(/their|they/g, (match) => match === 'they' ? 'she' : 'her')
  }
}

export const avatarTransformScene = new Scenes.WizardScene<MyContext>(
  ModeEnum.AvatarTransform,
  async ctx => {
    const isRu = isRussian(ctx)
    const telegramId = ctx.from?.id?.toString() || 'unknown'

    logger.info('[AvatarTransformScene] Starting avatar transformation', {
      telegramId,
      step: 'initial'
    })

    try {
      logger.info('[AvatarTransformScene] Getting user photo', {
        telegramId,
        step: 'fetching_photo'
      })

      // Получаем URL фотографии пользователя
      const userPhotoUrl = await getUserPhotoUrl(ctx, ctx.from?.id || 0)
      
      logger.info('[AvatarTransformScene] Got user photo URL', {
        telegramId,
        hasPhotoUrl: !!userPhotoUrl,
        step: 'got_photo_url'
      })
      
      if (!userPhotoUrl) {
        // Если у пользователя нет фото профиля
        await ctx.reply(
          isRu
            ? '❌ У вас нет фотографии профиля\n\n🎭 Для создания магнетического образа мне нужно ваше фото\n\n💡 Что делать:'
            : '❌ You don\'t have a profile photo\n\n🎭 I need your photo to create a magnetic look\n\n💡 What to do:',
          Markup.keyboard([
            [
              isRu ? '📸 Загрузить фото' : '📸 Upload photo',
              isRu ? '⏩ Пропустить' : '⏩ Skip'
            ]
          ]).resize()
        )
        return ctx.wizard.next()
      }

      // ✨ Показываем превью фото пользователя с улучшенным текстом
      logger.info('[AvatarTransformScene] Sending user photo preview', {
        telegramId,
        step: 'sending_preview'
      })

      try {
        await ctx.replyWithPhoto(userPhotoUrl, {
          caption: isRu
            ? '✨ *Магнетическая трансформация VIBE CODING*\n\n📸 Это ваше текущее фото\n🎨 Превратим его в стильный образ с книгой "VIBE CODING"\n\n💫 *Особенности трансформации:*\n• Профессиональный кинематографический стиль\n• Элегантный образ с книгой в руках\n• Стильный пиджак Tiffany цвета\n• Святой ореол за головой\n• Пастельная mint палитра\n\n🎯 Выберите действие:'
            : '✨ *Magnetic VIBE CODING Transformation*\n\n📸 This is your current photo\n🎨 Let\'s transform it into a stylish look with "VIBE CODING" book\n\n💫 *Transformation features:*\n• Professional cinematic style\n• Elegant look with book in hands\n• Stylish Tiffany blazer\n• Saint halo behind head\n• Pastel mint palette\n\n🎯 Choose action:',
          parse_mode: 'Markdown',
          reply_markup: Markup.keyboard([
            [
              isRu ? '🎨 Создать магнетический образ' : '🎨 Create magnetic look',
              isRu ? '📸 Загрузить другое фото' : '📸 Upload different photo'
            ],
            [isRu ? '⏩ Пропустить' : '⏩ Skip']
          ]).resize().reply_markup
        })
      } catch (photoError) {
        logger.warn('[AvatarTransformScene] Failed to send photo, falling back to text', {
          telegramId,
          error: photoError
        })
        
        // Fallback: если не удалось отправить фото, показываем текстовое сообщение
        await ctx.reply(
          isRu
            ? '✨ *Магнетическая трансформация VIBE CODING*\n\n📸 Я вижу у вас есть фото профиля\n🎨 Превратим его в стильный образ с книгой\n\n🎯 Выберите действие:'
            : '✨ *Magnetic VIBE CODING Transformation*\n\n📸 I see you have a profile photo\n🎨 Let\'s transform it into a stylish look with book\n\n🎯 Choose action:',
          {
            parse_mode: 'Markdown',
            reply_markup: Markup.keyboard([
              [
                isRu ? '🎨 Создать магнетический образ' : '🎨 Create magnetic look',
                isRu ? '📸 Загрузить другое фото' : '📸 Upload different photo'
              ],
              [isRu ? '⏩ Пропустить' : '⏩ Skip']
            ]).resize().reply_markup
          }
        )
      }

      // Сохраняем URL в сессии
      ctx.session.kontextImageUrl = userPhotoUrl
      return ctx.wizard.next()
    } catch (error) {
      logger.error('[AvatarTransformScene] Error in initial step:', error)
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при обработке фотографии\n\n🔄 Попробуйте позже или обратитесь в поддержку'
          : '❌ An error occurred while processing the photo\n\n🔄 Please try again later or contact support'
      )
      return ctx.scene.leave()
    }
  },
  // Шаг 2: Обработка выбора действия
  async ctx => {
    const isRu = isRussian(ctx)
    const telegramId = ctx.from?.id?.toString() || 'unknown'

    if (!ctx.message || !('text' in ctx.message)) {
      return
    }

    const text = ctx.message.text

    // Пользователь решил пропустить
    if (text === (isRu ? '⏩ Пропустить' : '⏩ Skip')) {
      await ctx.reply(
        isRu 
          ? '👋 Хорошо, возвращаемся в главное меню\n\n💡 Вы всегда можете вернуться к трансформации через /start' 
          : '👋 Okay, returning to main menu\n\n💡 You can always return to transformation via /start'
      )
      return ctx.scene.enter(ModeEnum.StartScene)
    }

    // Пользователь хочет создать магнетический образ
    if (text === (isRu ? '🎨 Создать магнетический образ' : '🎨 Create magnetic look') || text === (isRu ? '🎨 Преобразовать текущее' : '🎨 Transform current')) {
      if (!ctx.session.kontextImageUrl) {
        await ctx.reply(
          isRu
            ? '❌ Извините, не удалось найти ваше фото\n\n🔄 Попробуйте загрузить новое'
            : '❌ Sorry, could not find your photo\n\n🔄 Try uploading a new one'
        )
        return
      }

      // Переходим к выбору пола
      await ctx.reply(
        isRu
          ? '👤 *Выбор стиля для вашего образа*\n\n🎨 Для создания идеального образа мне нужно знать ваш пол, чтобы адаптировать стиль трансформации\n\n💫 Выберите подходящий вариант:'
          : '👤 *Style Selection for Your Look*\n\n🎨 To create the perfect look, I need to know your gender to adapt the transformation style\n\n💫 Choose the appropriate option:',
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.keyboard([
            [
              isRu ? '👨‍💼 Мужской образ' : '👨‍💼 Male look',
              isRu ? '👩‍💼 Женский образ' : '👩‍💼 Female look'
            ],
            [isRu ? '🔙 Назад' : '🔙 Back']
          ]).resize().reply_markup
        }
      )
      return ctx.wizard.next() // Переходим к шагу выбора пола
    }

    // Пользователь хочет загрузить новое фото
    if (
      text === (isRu ? '📸 Загрузить фото' : '📸 Upload photo') ||
      text === (isRu ? '📸 Загрузить другое фото' : '📸 Upload different photo')
    ) {
      await ctx.reply(
        isRu
          ? '📸 *Загрузка нового фото*\n\n💡 Отправьте мне фотографию, которую хотите преобразовать\n\n✨ *Рекомендации:*\n• Четкое фото лица\n• Хорошее освещение\n• Минимум 512x512 пикселей'
          : '📸 *Upload New Photo*\n\n💡 Send me the photo you would like to transform\n\n✨ *Recommendations:*\n• Clear face photo\n• Good lighting\n• Minimum 512x512 pixels',
        { parse_mode: 'Markdown' }
      )
      return ctx.wizard.selectStep(3) // Переходим к шагу загрузки фото
    }
  },
  // Шаг 3: Выбор пола для адаптации промпта
  async ctx => {
    const isRu = isRussian(ctx)
    const telegramId = ctx.from?.id?.toString() || 'unknown'

    if (!ctx.message || !('text' in ctx.message)) {
      return
    }

    const text = ctx.message.text

    // Назад к предыдущему шагу
    if (text === (isRu ? '🔙 Назад' : '🔙 Back')) {
      return ctx.wizard.back()
    }

    let gender: 'male' | 'female' | null = null

    if (text === (isRu ? '👨‍💼 Мужской образ' : '👨‍💼 Male look')) {
      gender = 'male'
    } else if (text === (isRu ? '👩‍💼 Женский образ' : '👩‍💼 Female look')) {
      gender = 'female'
    }

    if (!gender) {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, выберите один из предложенных вариантов'
          : '❌ Please choose one of the suggested options'
      )
      return
    }

    // Сохраняем выбор пола в сессии
    ctx.session.selectedGender = gender

    const genderText = isRu 
      ? (gender === 'male' ? 'мужской' : 'женский')
      : (gender === 'male' ? 'male' : 'female')

    await ctx.reply(
      isRu
        ? `✨ *Начинаю магнетическую трансформацию*\n\n👤 Выбранный стиль: ${genderText} образ\n🎨 Модель: FLUX Kontext Max\n💎 Стоимость: ~6⭐\n\n🚀 Создаю ваш стильный образ с книгой "VIBE CODING"...`
        : `✨ *Starting Magnetic Transformation*\n\n👤 Selected style: ${genderText} look\n🎨 Model: FLUX Kontext Max\n💎 Cost: ~6⭐\n\n🚀 Creating your stylish look with "VIBE CODING" book...`,
      { 
        parse_mode: 'Markdown',
        reply_markup: { remove_keyboard: true }
      }
    )

    try {
      const prompt = createPromptByGender(gender)
      
      logger.info('[AvatarTransformScene] Starting generation with gender-specific prompt', {
        telegramId,
        gender,
        promptLength: prompt.length
      })
      
      // Используем Flux Context Max для генерации изображения
      const { generateFluxKontext } = await import('@/services/generateFluxKontext')
      
      await generateFluxKontext({
        prompt,
        inputImageUrl: ctx.session.kontextImageUrl!,
        modelType: 'max', // Используем max модель
        telegram_id: telegramId,
        username: ctx.from?.username || 'unknown',
        is_ru: isRu,
        ctx
      })

      await ctx.reply(
        isRu
          ? '🎉 *Трансформация завершена!*\n\n✨ Ваш магнетический образ готов\n📚 Теперь вы — истинный VIBE CODER\n\n💡 Хотите создать еще один образ? Используйте /start'
          : '🎉 *Transformation Complete!*\n\n✨ Your magnetic look is ready\n📚 Now you are a true VIBE CODER\n\n💡 Want to create another look? Use /start',
        { parse_mode: 'Markdown' }
      )
      
      return ctx.scene.enter(ModeEnum.StartScene)
    } catch (error) {
      logger.error('[AvatarTransformScene] Error generating image:', error)
      await ctx.reply(
        isRu
          ? '❌ *Ошибка трансформации*\n\n🔄 Произошла ошибка при создании образа\n💡 Попробуйте позже или обратитесь в поддержку'
          : '❌ *Transformation Error*\n\n🔄 An error occurred while creating the look\n💡 Please try again later or contact support',
        { parse_mode: 'Markdown' }
      )
      return ctx.scene.enter(ModeEnum.StartScene)
    }
  },
  // Шаг 4: Обработка загруженной фотографии (для случая когда пользователь загружает новое фото)
  async ctx => {
    const isRu = isRussian(ctx)
    const telegramId = ctx.from?.id?.toString() || 'unknown'

    if (!ctx.message || !('photo' in ctx.message)) {
      await ctx.reply(
        isRu
          ? '📸 Пожалуйста, отправьте фотографию\n\n💡 Или используйте /start чтобы начать заново'
          : '📸 Please send a photo\n\n💡 Or use /start to start over'
      )
      return
    }

    try {
      const photo = ctx.message.photo[ctx.message.photo.length - 1]
      const file = await ctx.telegram.getFile(photo.file_id)
      const photoUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${file.file_path}`

      // Сохраняем новое фото в сессии
      ctx.session.kontextImageUrl = photoUrl

      await ctx.reply(
        isRu
          ? '✅ *Фото получено!*\n\n🎨 Теперь выберите стиль для вашего образа:'
          : '✅ *Photo received!*\n\n🎨 Now choose the style for your look:',
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.keyboard([
            [
              isRu ? '👨‍💼 Мужской образ' : '👨‍💼 Male look',
              isRu ? '👩‍💼 Женский образ' : '👩‍💼 Female look'
            ],
            [isRu ? '🔙 Назад' : '🔙 Back']
          ]).resize().reply_markup
        }
      )

      // Переходим к шагу выбора пола
      return ctx.wizard.selectStep(2)
    } catch (error) {
      logger.error('[AvatarTransformScene] Error processing uploaded photo:', error)
      await ctx.reply(
        isRu
          ? '❌ *Ошибка обработки фото*\n\n🔄 Произошла ошибка при обработке фотографии\n💡 Попробуйте загрузить другое фото или используйте /start'
          : '❌ *Photo Processing Error*\n\n🔄 An error occurred while processing the photo\n💡 Try uploading another photo or use /start',
        { parse_mode: 'Markdown' }
      )
      return ctx.scene.enter(ModeEnum.StartScene)
    }
  }
)

export default avatarTransformScene
