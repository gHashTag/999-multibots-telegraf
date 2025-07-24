import { Markup, Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers/language'
import { getUserPhotoUrl } from '@/middlewares/getUserPhotoUrl'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { sendPhotoWithFallback } from '@/helpers/sendPhotoWithFallback'
import { checkAvatarTransformUsage } from '@/core/supabase/checkAvatarTransformUsage'
import { markAvatarTransformUsed } from '@/core/supabase/markAvatarTransformUsed'
import { getBotNameByToken } from '@/core/bot'
import { generateFluxKontext } from '@/services/generateFluxKontext'

// Герои для выбора (по полу)
const MARVEL_HEROES = {
  male: [
    'Человек-паук',
    'Железный человек',
    'Капитан Америка',
    'Тор',
    'Доктор Стрэндж', // ✅ ЗАМЕНИЛ "Чёрная вдова" на позитивного героя
    'Соколиный глаз', // ✅ НОВЫЙ СТИЛЬ
    'Звёздный лорд', // ✅ НОВЫЙ СТИЛЬ
  ],
  female: [
    'Капитан Марвел',
    'Скарлет Витч',
    'Алая ведьма',
    'Гамора', // ✅ НОВЫЙ СТИЛЬ
    'Шури', // ✅ НОВЫЙ СТИЛЬ
    'Валькирия', // ✅ НОВЫЙ СТИЛЬ
  ],
}

// Функция для создания детального промпта с конкретным героем
const createMarvelPromptByGender = (
  gender: 'male' | 'female',
  heroName: string
): string => {
  const baseSettings = `[Cinematic portrait photography. Medium shot. Aspect ratio 9:16. Professional studio lighting with dramatic effects]`

  // Детальные промпты для каждого героя с уникальными атрибутами
  const heroPrompts: Record<string, string> = {
    // МУЖСКИЕ ГЕРОИ - БЕЗОПАСНЫЕ, НО УЗНАВАЕМЫЕ ПРОМПТЫ
    'Человек-паук': `${baseSettings} A charismatic ${gender === 'male' ? 'man' : 'woman'} in red and blue athletic outfit with web-like patterns. ${gender === 'male' ? 'Athletic build' : 'Athletic silhouette'}. Stylish clear glasses. Dynamic pose with hands positioned as if casting webs. Background with urban cityscape elements and geometric web patterns in blue and red colors. Superhero aesthetic with confident expression and energetic atmosphere.`,

    'Железный человек': `${baseSettings} A confident ${gender === 'male' ? 'man' : 'woman'} in sleek red and gold high-tech styled outfit. ${gender === 'male' ? 'Strong jawline' : 'Elegant features'}. Circular glowing element on chest area. One hand raised with glowing palm effect. Background with technological elements and holographic displays in blue and gold. Modern tech aesthetic with sharp, clean lines.`,

    'Капитан Америка': `${baseSettings} A heroic ${gender === 'male' ? 'man' : 'woman'} in blue outfit with white star emblem. ${gender === 'male' ? 'Strong patriotic stance' : 'Confident patriotic pose'}. Holding a circular shield-like prop. Red, white and blue color palette throughout. Background with patriotic elements and geometric patterns. Classic heroic lighting with strong shadows and highlights.`,

    Тор: `${baseSettings} A mighty ${gender === 'male' ? 'man' : 'woman'} in Nordic-inspired outfit with flowing cape. ${gender === 'male' ? 'Powerful build' : 'Regal presence'}. Long flowing hair with golden highlights. Holding a hammer-like prop with lightning-inspired lighting effects. Background with stormy sky elements and Norse-style geometric patterns. Dramatic lighting with electric blue accents.`,

    'Доктор Стрэндж': `${baseSettings} A mystical ${gender === 'male' ? 'man' : 'woman'} in elegant dark blue outfit with golden trim and mystical symbols. ${gender === 'male' ? 'Distinguished goatee' : 'Mystical elegance'}. Hands positioned in magical gestures with orange and golden light effects. Floating geometric mandalas and mystical symbols in background. Rich colors with deep blues, golds, and warm orange magical energy.`,

    'Соколиный глаз': `${baseSettings} A skilled ${gender === 'male' ? 'man' : 'woman'} in tactical purple and black outfit with precision gear. ${gender === 'male' ? 'Sharp focused expression' : 'Precise archer stance'}. Holding a bow-like prop with arrows visible. Target-like patterns in background with purple and silver accents. Urban rooftop setting with precise lighting and clean composition.`,

    'Звёздный лорд': `${baseSettings} A charismatic ${gender === 'male' ? 'man' : 'woman'} in stylish red leather jacket with tech elements. ${gender === 'male' ? 'Confident smirk' : 'Adventure-ready pose'}. Retro-futuristic headphones around neck. Holding dual energy blaster props. Background with cosmic elements and 80s-inspired neon colors. Mix of retro and space aesthetics with pink, blue, and gold lighting.`,

    // ЖЕНСКИЕ ГЕРОИ - БЕЗОПАСНЫЕ, НО УЗНАВАЕМЫЕ ПРОМПТЫ
    'Капитан Марвел': `${baseSettings} A powerful ${gender === 'male' ? 'man' : 'woman'} in cosmic-themed outfit with red, blue and gold colors. ${gender === 'male' ? 'Cosmic power stance' : 'Strong cosmic warrior pose'}. Hands glowing with golden energy effects. Short practical hair with golden highlights. Background with cosmic elements and star patterns. Dramatic lighting with golden energy flowing around the figure.`,

    'Скарлет Витч': `${baseSettings} A mystical ${gender === 'male' ? 'man' : 'woman'} in elegant red outfit with flowing cape and mystical accessories. ${gender === 'male' ? 'Mystical commanding presence' : 'Graceful mystical pose'}. Hands surrounded by crimson energy effects and floating particles. Long flowing hair with red highlights. Background with magical symbols and red energy patterns. Dramatic lighting with warm reds and mystical atmosphere.`,

    'Алая ведьма': `${baseSettings} A magical ${gender === 'male' ? 'man' : 'woman'} in dark red mystical robes with intricate golden patterns. ${gender === 'male' ? 'Powerful sorcerer stance' : 'Enchanting magical pose'}. Hands creating swirling red energy with magical particles. Detailed mystical jewelry and accessories. Background with ancient magical symbols and swirling red energy. Rich deep colors with crimson and gold magical effects.`,

    Гамора: `${baseSettings} A fierce ${gender === 'male' ? 'man' : 'woman'} in tactical black and silver outfit with cosmic warrior elements. ${gender === 'male' ? 'Battle-ready stance' : 'Warrior goddess pose'}. Holding dual blade-like props. Short practical hair with subtle green highlights. Background with cosmic battlefield elements and purple-pink nebula effects. Dramatic sci-fi lighting with sharp contrasts.`,

    Шури: `${baseSettings} A brilliant ${gender === 'male' ? 'man' : 'woman'} in advanced tech outfit with purple and gold accents inspired by African patterns. ${gender === 'male' ? 'Genius inventor pose' : 'Tech princess stance'}. Hands interacting with holographic interfaces and tech gadgets. Modern braided hairstyle with tech accessories. Background with futuristic lab elements and purple holographic displays. Clean tech aesthetic with purple and gold lighting.`,

    Валькирия: `${baseSettings} A noble ${gender === 'male' ? 'man' : 'woman'} in warrior outfit with blue and silver colors and flowing cape. ${gender === 'male' ? 'Asgardian warrior stance' : 'Noble warrior queen pose'}. Holding a sword-like prop with regal bearing. Hair in warrior braids with metallic accessories. Background with Asgardian palace elements and golden architectural details. Regal lighting with blue and gold royal colors.`,
  }

  // Если промпт для героя не найден, используем общий
  return (
    heroPrompts[heroName] ||
    `${baseSettings} A confident ${gender === 'male' ? 'man' : 'woman'} in modern stylish outfit inspired by ${heroName}. Professional studio lighting with bright, warm tones. Clean background with subtle color effects matching ${heroName}'s signature palette. The person wears fashionable glasses and has a charismatic expression. High-quality portrait photography with premium aesthetic.`
  )
}

export const avatarTransformScene = new Scenes.WizardScene<MyContext>(
  ModeEnum.AvatarTransform,
  async ctx => {
    const isRu = isRussian(ctx)
    const telegramId = ctx.from?.id?.toString() || 'unknown'

    logger.info('[AvatarTransformScene] Starting avatar transformation', {
      telegramId,
      step: 'initial',
    })

    // 🛡️ ПРОВЕРЯЕМ ЛИМИТ ИСПОЛЬЗОВАНИЯ ФУНКЦИИ
    logger.info('[AvatarTransformScene] Checking usage limit', {
      telegramId,
      step: 'checking_limit',
    })

    const usageCheck = await checkAvatarTransformUsage(telegramId)

    logger.info('[AvatarTransformScene] Usage limit check result', {
      telegramId,
      canUse: usageCheck.canUse,
      isAdmin: usageCheck.isAdmin,
      hasUsedBefore: usageCheck.hasUsedBefore,
      step: 'limit_checked',
    })

    // Если пользователь не может использовать (уже использовал и не админ)
    if (!usageCheck.canUse) {
      logger.info(
        '[AvatarTransformScene] User exceeded limit, showing subscription offer',
        {
          telegramId,
          hasUsedBefore: usageCheck.hasUsedBefore,
          step: 'limit_exceeded',
        }
      )

      await ctx.reply(
        isRu
          ? `🚫 <b>Лимит демонстрации исчерпан</b>\n\n😊 Вы уже использовали бесплатную AI-трансформацию!\n\n🎯 <b>Чтобы продолжить использование:</b>\n💰 Оформите подписку и получите:\n\n✨ <b>Безлимитные трансформации</b>\n🎨 <b>Сотни стилей на выбор</b>\n🖼️ <b>Все возможности бота</b>\n🚀 <b>Новые функции каждую неделю</b>\n\n💎 Используйте /start → 💫 Оформить подписку`
          : `🚫 <b>Demo limit reached</b>\n\n😊 You've already used the free AI transformation!\n\n🎯 <b>To continue using:</b>\n💰 Get a subscription and receive:\n\n✨ <b>Unlimited transformations</b>\n🎨 <b>Hundreds of styles to choose</b>\n🖼️ <b>All bot capabilities</b>\n🚀 <b>New features every week</b>\n\n💎 Use /start → 💫 Subscribe`,
        {
          parse_mode: 'HTML',
          reply_markup: Markup.keyboard([
            [isRu ? '💫 Оформить подписку' : '💫 Subscribe'],
            [isRu ? '🏠 Главное меню' : '🏠 Main menu'],
          ]).resize().reply_markup,
        }
      )

      // Возвращаемся в главное меню
      // 🛠️ ИСПРАВЛЕНИЕ: Полностью выходим из сцены перед переходом
      await ctx.scene.leave()
      return ctx.scene.enter(ModeEnum.MainMenu)
    }

    // Логируем статус пользователя (админ или первое использование)
    if (usageCheck.isAdmin) {
      logger.info('[AvatarTransformScene] Admin user - unlimited access', {
        telegramId,
        step: 'admin_access',
      })
    } else {
      logger.info(
        '[AvatarTransformScene] Regular user - first time usage allowed',
        {
          telegramId,
          step: 'first_usage',
        }
      )
    }

    try {
      logger.info('[AvatarTransformScene] Getting user photo', {
        telegramId,
        step: 'fetching_photo',
      })

      // 🎯 ЛИДMАГНЕТ: Делаем первое использование БЕСПЛАТНЫМ
      ctx.session.bypass_payment_check = true

      logger.info(
        '[AvatarTransformScene] Lead magnet enabled - FREE transformation',
        {
          telegramId,
          step: 'lead_magnet_enabled',
        }
      )

      // Получаем URL фотографии пользователя
      logger.info('[AvatarTransformScene] Getting user photo...', {
        telegramId,
        step: 'getting_photo',
      })

      const userPhotoUrl = await getUserPhotoUrl(ctx, ctx.from?.id || 0)

      logger.info('[AvatarTransformScene] Got user photo URL', {
        telegramId,
        photoUrl: userPhotoUrl ? 'obtained' : 'failed',
        step: 'photo_obtained',
      })

      try {
        // 🎨 ПОКАЗЫВАЕМ ПРЕВЬЮ АВАТАРКИ ПОЛЬЗОВАТЕЛЯ
        const photoSent = await sendPhotoWithFallback(ctx, userPhotoUrl, {
          caption: isRu
            ? `🤖 <b>Добро пожаловать в AI-трансформацию!</b>\n\n👋 Привет! Я покажу вам мощь нашей AI-технологии!\n\n📸 <b>Это ваше текущее фото профиля</b>\n🎨 Сейчас я продемонстрирую как наш бот может трансформировать любого человека в любой образ\n\n🌟 <b>Демо возможностей бота:</b>\n• Трансформация в стиле популярных персонажей\n• Кинематографическое качество обработки\n• Профессиональная AI-генерация FLUX Kontext Max\n• Любые образы на ваш выбор (в полной версии)\n\n🎁 <b>Это БЕСПЛАТНАЯ демонстрация возможностей!</b>\n💰 <b>Полный доступ ко всем функциям бота - после покупки</b>\n\n🎯 Выберите действие:`
            : `🤖 <b>Welcome to AI Transformation!</b>\n\n👋 Hello! I'll show you the power of our AI technology!\n\n📸 <b>This is your current profile photo</b>\n🎨 Now I'll demonstrate how our bot can transform any person into any style\n\n🌟 <b>Bot capabilities demo:</b>\n• Transformation in popular character styles\n• Cinematic quality processing\n• Professional AI generation FLUX Kontext Max\n• Any styles of your choice (in full version)\n\n🎁 <b>This is a FREE demonstration of capabilities!</b>\n💰 <b>Full access to all bot functions - after purchase</b>\n\n🎯 Choose action:`,
          parse_mode: 'HTML',
          reply_markup: Markup.keyboard([
            [isRu ? '🎨 Использовать мой аватар' : '🎨 Use my avatar'],
            [
              isRu ? '📸 Загрузить своё фото' : '📸 Upload my photo',
              isRu ? '⏩ Пропустить' : '⏩ Skip',
            ],
          ]).resize().reply_markup,
        })

        // Если фото не удалось отправить, отправляем текстовое сообщение
        if (!photoSent) {
          logger.warn(
            '[AvatarTransformScene] Photo fallback failed, sending text message'
          )

          await ctx.reply(
            isRu
              ? `🤖 <b>Добро пожаловать в AI-трансформацию!</b>\n\n👋 Привет! Я покажу вам мощь нашей AI-технологии!\n\n📸 <b>Это ваше текущее фото профиля</b>\n🎨 Сейчас я продемонстрирую как наш бот может трансформировать любого человека в любой образ\n\n🌟 <b>Демо возможностей бота:</b>\n• Трансформация в стиле популярных персонажей\n• Кинематографическое качество обработки\n• Профессиональная AI-генерация FLUX Kontext Max\n• Любые образы на ваш выбор (в полной версии)\n\n🎁 <b>Это БЕСПЛАТНАЯ демонстрация возможностей!</b>\n💰 <b>Полный доступ ко всем функциям бота - после покупки</b>\n\n🎯 Выберите действие:`
              : `🤖 <b>Welcome to AI Transformation!</b>\n\n👋 Hello! I'll show you the power of our AI technology!\n\n📸 <b>This is your current profile photo</b>\n🎨 Now I'll demonstrate how our bot can transform any person into any style\n\n🌟 <b>Bot capabilities demo:</b>\n• Transformation in popular character styles\n• Cinematic quality processing\n• Professional AI generation FLUX Kontext Max\n• Any styles of your choice (in full version)\n\n🎁 <b>This is a FREE demonstration of capabilities!</b>\n💰 <b>Full access to all bot functions - after purchase</b>\n\n🎯 Choose action:`,
            {
              parse_mode: 'HTML',
              reply_markup: Markup.keyboard([
                [isRu ? '🎨 Использовать мой аватар' : '🎨 Use my avatar'],
                [
                  isRu ? '📸 Загрузить своё фото' : '📸 Upload my photo',
                  isRu ? '⏩ Пропустить' : '⏩ Skip',
                ],
              ]).resize().reply_markup,
            }
          )
        }
      } catch (photoError) {
        logger.warn(
          '[AvatarTransformScene] Failed to send photo, falling back to text',
          {
            telegramId,
            error: photoError,
          }
        )

        // Fallback: если не удалось отправить фото, показываем текстовое сообщение
        await ctx.reply(
          isRu
            ? `🤖 <b>Добро пожаловать в AI-трансформацию!</b>\n\n👋 Привет! Я покажу вам мощь нашей AI-технологии!\n\n📸 <b>Это ваше текущее фото профиля</b>\n🎨 Сейчас я продемонстрирую как наш бот может трансформировать любого человека в любой образ\n\n🌟 <b>Демо возможностей бота:</b>\n• Трансформация в стиле популярных персонажей\n• Кинематографическое качество обработки\n• Профессиональная AI-генерация FLUX Kontext Max\n• Любые образы на ваш выбор (в полной версии)\n\n🎁 <b>Это БЕСПЛАТНАЯ демонстрация возможностей!</b>\n💰 <b>Полный доступ ко всем функциям бота - после покупки</b>\n\n🎯 Выберите действие:`
            : `🤖 <b>Welcome to AI Transformation!</b>\n\n👋 Hello! I'll show you the power of our AI technology!\n\n📸 <b>This is your current profile photo</b>\n🎨 Now I'll demonstrate how our bot can transform any person into any style\n\n🌟 <b>Bot capabilities demo:</b>\n• Transformation in popular character styles\n• Cinematic quality processing\n• Professional AI generation FLUX Kontext Max\n• Any styles of your choice (in full version)\n\n🎁 <b>This is a FREE demonstration of capabilities!</b>\n💰 <b>Full access to all bot functions - after purchase</b>\n\n🎯 Choose action:`,
          {
            parse_mode: 'Markdown',
            reply_markup: Markup.keyboard([
              [
                isRu
                  ? '🎨 Создать магнетический образ'
                  : '🎨 Create magnetic look',
                isRu ? '📸 Загрузить другое фото' : '📸 Upload different photo',
              ],
              [isRu ? '⏩ Пропустить' : '⏩ Skip'],
            ]).resize().reply_markup,
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
      // 🛠️ ИСПРАВЛЕНИЕ: Полностью выходим из сцены перед переходом
      await ctx.scene.leave()
      return ctx.scene.enter(ModeEnum.StartScene)
    }

    // Пользователь хочет использовать свой аватар
    if (
      text === (isRu ? '🎨 Использовать мой аватар' : '🎨 Use my avatar') ||
      text ===
        (isRu ? '🎨 Создать магнетический образ' : '🎨 Create magnetic look') // Обратная совместимость
    ) {
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
          ? `👤 <b>Выбор стиля для вашего образа</b>\n\n🧬 Для создания идеального образа мне нужно знать ваш пол, чтобы адаптировать стиль трансформации\n\n👇 Выберите подходящий вариант:`
          : `👤 <b>Style selection for your look</b>\n\n🧬 To create the perfect look, I need to know your gender to adapt the transformation style\n\n👇 Choose the appropriate option:`,
        {
          parse_mode: 'HTML',
          reply_markup: Markup.keyboard([
            [
              isRu ? '👨‍💼 Мужской образ' : '👨‍💼 Male look',
              isRu ? '👩‍💼 Женский образ' : '👩‍💼 Female look',
            ],
            [isRu ? '🔙 Назад' : '🔙 Back'],
          ]).resize().reply_markup,
        }
      )
      return ctx.wizard.next() // Переходим к шагу выбора пола
    }

    // Пользователь хочет загрузить новое фото
    if (
      text === (isRu ? '📸 Загрузить фото' : '📸 Upload photo') ||
      text ===
        (isRu ? '📸 Загрузить другое фото' : '📸 Upload different photo') ||
      text === (isRu ? '📸 Загрузить своё фото' : '📸 Upload my photo')
    ) {
      await ctx.reply(
        isRu
          ? `📸 <b>Загрузка нового фото</b>\n\n💡 Отправьте мне фотографию, которую хотите преобразовать\n\n✨ <b>Рекомендации:</b>\n• Четкое фото лица\n• Хорошее освещение\n• Минимум 512x512 пикселей`
          : `📸 <b>Upload New Photo</b>\n\n💡 Send me the photo you would like to transform\n\n✨ <b>Recommendations:</b>\n• Clear face photo\n• Good lighting\n• Minimum 512x512 pixels`,
        { parse_mode: 'HTML' }
      )
      return ctx.wizard.selectStep(3) // Переходим к шагу загрузки фото
    }
  },
  // Шаг 3: Обработка выбора пола и показ кнопок героев
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

    logger.info('[AvatarTransformScene] Processing gender selection', {
      telegramId,
      receivedText: text,
      isRu,
    })

    if (text === (isRu ? '👨‍💼 Мужской образ' : '👨‍💼 Male look')) {
      gender = 'male'
      logger.info('[AvatarTransformScene] Male gender selected')
    } else if (text === (isRu ? '👩‍💼 Женский образ' : '👩‍💼 Female look')) {
      gender = 'female'
      logger.info('[AvatarTransformScene] Female gender selected')
    }

    if (!gender) {
      logger.info('[AvatarTransformScene] No valid gender selected:', { text })
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, выберите один из предложенных вариантов'
          : '❌ Please choose one of the suggested options'
      )
      return
    }

    logger.info('[AvatarTransformScene] Gender validated, proceeding:', {
      gender,
    })

    // Сохраняем выбор пола в сессии
    ctx.session.selectedGender = gender

    // Создаем кнопки для выбора героев
    const primaryHeroes = MARVEL_HEROES[gender]
    const alternativeHeroes =
      MARVEL_HEROES[gender === 'male' ? 'female' : 'male']

    // 🌍 ЛОКАЛИЗАЦИЯ КНОПОК ДЛЯ ГЕРОЕВ
    const getHeroButtonText = (heroName: string, isPrimary: boolean) => {
      const heroTranslations: Record<string, { ru: string; en: string }> = {
        'Человек-паук': { ru: '🎨 Человек-паук', en: '🎨 Spider-Man' },
        'Железный человек': { ru: '🎨 Железный человек', en: '🎨 Iron Man' },
        'Капитан Америка': {
          ru: '🎨 Капитан Америка',
          en: '🎨 Captain America',
        },
        Тор: { ru: '🎨 Тор', en: '🎨 Thor' },
        'Доктор Стрэндж': { ru: '🎨 Доктор Стрэндж', en: '🎨 Doctor Strange' },
        'Соколиный глаз': { ru: '🎨 Соколиный глаз', en: '🎨 Hawkeye' },
        'Звёздный лорд': { ru: '🎨 Звёздный лорд', en: '🎨 Star Lord' },
        // ЖЕНСКИЕ ГЕРОИ - БЕЗОПАСНЫЕ, НО УЗНАВАЕМЫЕ ПРОМПТЫ
        'Капитан Марвел': { ru: '✨ Капитан Марвел', en: '✨ Captain Marvel' },
        'Скарлет Витч': { ru: '✨ Скарлет Витч', en: '✨ Scarlet Witch' },
        'Алая ведьма': { ru: '✨ Алая ведьма', en: '✨ Wanda Maximoff' },
        Гамора: { ru: '✨ Гамора', en: '✨ Gamora' },
        Шури: { ru: '✨ Шури', en: '✨ Shuri' },
        Валькирия: { ru: '✨ Валькирия', en: '✨ Valkyrie' },
      }

      const translation = heroTranslations[heroName]
      if (translation) {
        return isRu ? translation.ru : translation.en
      }

      // Фолбэк для неизвестных героев
      const icon = isPrimary ? '🎨' : '✨'
      return `${icon} ${heroName}`
    }

    const heroButtons = [
      // Первый ряд - основные герои для выбранного пола
      primaryHeroes.slice(0, 3).map(hero => getHeroButtonText(hero, true)),
      // Второй ряд - оставшиеся основные герои
      primaryHeroes.slice(3, 5).map(hero => getHeroButtonText(hero, true)),
      // Третий ряд - альтернативные герои (противоположного пола)
      alternativeHeroes.slice(0, 2).map(hero => getHeroButtonText(hero, false)),
      // Четвертый ряд - случайный выбор
      [isRu ? '🎲 Случайный стиль' : '🎲 Random style'],
      // Пятый ряд - назад
      [isRu ? '🔙 Назад' : '🔙 Back'],
    ]

    logger.info('[AvatarTransformScene] Creating hero selection keyboard:', {
      gender,
      primaryHeroesCount: primaryHeroes.length,
      alternativeHeroesCount: alternativeHeroes.length,
      buttonsStructure: heroButtons,
    })

    try {
      await ctx.reply(
        isRu
          ? `🤖 <b>Демонстрация AI-возможностей</b>\n\n🎯 Сейчас я покажу вам как наш бот трансформирует людей!\n\n💡 <b>Выберите пример для демонстрации:</b>\nЭто лишь небольшая часть того, что умеет наш бот\n\n🌟 <b>Популярные примеры для ${gender === 'male' ? 'мужчин' : 'женщин'}:</b>\n${primaryHeroes
              .slice(0, 5)
              .map((hero, i) => `${i + 1}. Стиль "${hero}"`)
              .join(
                '\n'
              )}\n\n⚡ <b>Дополнительные примеры:</b>\n${alternativeHeroes
              .slice(0, 2)
              .map(hero => `• Стиль "${hero}"`)
              .join(
                '\n'
              )}\n\n💰 <b>В полной версии доступны ЛЮБЫЕ образы!</b>\n🚀 <b>Технология: FLUX Kontext Max</b>`
          : `🤖 <b>AI Capabilities Demonstration</b>\n\n🎯 Now I'll show you how our bot transforms people!\n\n💡 <b>Choose an example for demonstration:</b>\nThis is just a small part of what our bot can do\n\n🌟 <b>Popular examples for ${gender === 'male' ? 'men' : 'women'}:</b>\n${primaryHeroes
              .slice(0, 5)
              .map((hero, i) => `${i + 1}. "${hero}" style`)
              .join(
                '\n'
              )}\n\n⚡ <b>Additional examples:</b>\n${alternativeHeroes
              .slice(0, 2)
              .map(hero => `• "${hero}" style`)
              .join(
                '\n'
              )}\n\n💰 <b>In full version ANY styles available!</b>\n🚀 <b>Technology: FLUX Kontext Max</b>`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            keyboard: heroButtons,
            resize_keyboard: true,
            one_time_keyboard: false,
          },
        }
      )

      logger.info(
        '[AvatarTransformScene] Hero selection message sent successfully!'
      )
    } catch (error) {
      logger.error(
        '[AvatarTransformScene] Failed to send hero selection message:',
        error
      )
    }

    return ctx.wizard.next() // Переходим к следующему шагу - выбору героя
  },
  // Шаг 4: Обработка выбора героя и генерация
  async ctx => {
    const isRu = isRussian(ctx)
    const telegramId = ctx.from?.id?.toString() || 'unknown'

    // 🔍 ПРОВЕРЯЕМ ТИП СООБЩЕНИЯ ПЕРЕД ПОЛУЧЕНИЕМ ТЕКСТА
    if (!ctx.message || !('text' in ctx.message)) {
      logger.warn('[AvatarTransformScene] No text message received', {
        telegramId,
        messageType: ctx.message ? 'non-text' : 'no-message',
      })
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, используйте кнопки для выбора'
          : '❌ Please use buttons for selection'
      )
      return
    }

    const receivedText = ctx.message.text

    logger.info('[AvatarTransformScene] Processing hero selection', {
      telegramId,
      receivedText,
      step: 'hero_selection',
    })

    // Проверяем кнопку "Назад"
    if (receivedText === (isRu ? '🔙 Назад' : '🔙 Back')) {
      ctx.wizard.selectStep(2) // Возвращаемся к выбору пола
      return
    }

    // 🎯 ИНИЦИАЛИЗИРУЕМ ПЕРЕМЕННУЮ ДЛЯ ВЫБРАННОГО ГЕРОЯ
    let selectedHero: string | null = null

    // 🎲 Обработка случайного выбора
    if (receivedText === (isRu ? '🎲 Случайный стиль' : '🎲 Random style')) {
      // Случайный выбор из всех доступных героев
      const allHeroes = [...MARVEL_HEROES.male, ...MARVEL_HEROES.female]
      const randomHero = allHeroes[Math.floor(Math.random() * allHeroes.length)]
      selectedHero = randomHero

      logger.info('[AvatarTransformScene] Random hero selected', {
        telegramId,
        selectedHero: randomHero,
      })
    } else {
      // 🔍 ПАРСИНГ ВЫБРАННОГО ГЕРОЯ ИЗ ЛОКАЛИЗОВАННЫХ КНОПОК
      // Маппинг кнопок к именам героев
      const buttonToHeroMap: Record<string, string> = {
        // Русские кнопки
        '🎨 Человек-паук': 'Человек-паук',
        '🎨 Железный человек': 'Железный человек',
        '🎨 Капитан Америка': 'Капитан Америка',
        '🎨 Тор': 'Тор',
        '🎨 Доктор Стрэндж': 'Доктор Стрэндж',
        '🎨 Соколиный глаз': 'Соколиный глаз',
        '🎨 Звёздный лорд': 'Звёздный лорд',
        // Английские кнопки
        '🎨 Spider-Man': 'Человек-паук',
        '🎨 Iron Man': 'Железный человек',
        '🎨 Captain America': 'Капитан Америка',
        '🎨 Thor': 'Тор',
        '🎨 Doctor Strange': 'Доктор Стрэндж',
        '🎨 Hawkeye': 'Соколиный глаз',
        '🎨 Star Lord': 'Звёздный лорд',
        // ЖЕНСКИЕ ГЕРОИ - БЕЗОПАСНЫЕ, НО УЗНАВАЕМЫЕ ПРОМПТЫ
        '✨ Капитан Марвел': 'Капитан Марвел',
        '✨ Скарлет Витч': 'Скарлет Витч',
        '✨ Алая ведьма': 'Алая ведьма',
        '✨ Гамора': 'Гамора',
        '✨ Шури': 'Шури',
        '✨ Валькирия': 'Валькирия',
      }

      selectedHero = buttonToHeroMap[receivedText]

      if (!selectedHero) {
        logger.warn('[AvatarTransformScene] Invalid hero selection', {
          telegramId,
          receivedText,
        })
        await ctx.reply(
          isRu
            ? '❌ Неверный выбор. Пожалуйста, используйте кнопки.'
            : '❌ Invalid selection. Please use the buttons.'
        )
        return
      }

      logger.info('[AvatarTransformScene] Hero selected', {
        telegramId,
        buttonText: receivedText,
        selectedHero,
      })
    }

    // ✅ ПРОВЕРЯЕМ ЧТО ГЕРОЙ ВЫБРАН
    if (!selectedHero) {
      logger.error('[AvatarTransformScene] No hero selected', { telegramId })
      await ctx.reply(
        isRu
          ? '❌ Ошибка выбора героя. Попробуйте снова.'
          : '❌ Hero selection error. Try again.'
      )
      return
    }

    // Сохраняем выбранного героя в сессии
    ctx.session.selectedHero = selectedHero

    const gender = ctx.session.selectedGender

    if (!gender) {
      logger.error('[AvatarTransformScene] No gender in session', {
        telegramId,
      })
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не выбран пол. Начните заново'
          : '❌ Error: gender not selected. Start over'
      )
      // 🛠️ ИСПРАВЛЕНИЕ: Полностью выходим из сцены перед переходом
      await ctx.scene.leave()
      return ctx.scene.enter(ModeEnum.MainMenu)
    }

    // Отображаемое имя героя для пользователя
    const heroDisplayName = isRu
      ? selectedHero
      : selectedHero === 'Человек-паук'
        ? 'Spider-Man'
        : selectedHero === 'Железный человек'
          ? 'Iron Man'
          : selectedHero === 'Капитан Америка'
            ? 'Captain America'
            : selectedHero === 'Тор'
              ? 'Thor'
              : selectedHero === 'Доктор Стрэндж'
                ? 'Doctor Strange'
                : selectedHero === 'Соколиный глаз'
                  ? 'Hawkeye'
                  : selectedHero === 'Звёздный лорд'
                    ? 'Star Lord'
                    : selectedHero === 'Капитан Марвел'
                      ? 'Captain Marvel'
                      : selectedHero === 'Скарлет Витч'
                        ? 'Scarlet Witch'
                        : selectedHero === 'Алая ведьма'
                          ? 'Wanda Maximoff'
                          : selectedHero === 'Гамора'
                            ? 'Gamora'
                            : selectedHero === 'Шури'
                              ? 'Shuri'
                              : selectedHero === 'Валькирия'
                                ? 'Valkyrie'
                                : selectedHero

    // Сообщение перед генерацией
    await ctx.reply(
      isRu
        ? `🎬 <b>Запускаю AI Transformation Demo</b>\n\n🎭 <b>Выбранный стиль:</b> ${heroDisplayName}\n\n⚡ <b>Демонстрация возможностей бота</b>\nЭто лишь ОДНА из сотен возможностей бота!\n\n🚀 <b>Хотите больше? Получите подписку после демо!</b>\n\n⏳ <b>Генерирую ваше превращение...</b>`
        : `🎬 <b>Starting AI Transformation Demo</b>\n\n🎭 <b>Selected style:</b> ${heroDisplayName}\n\n⚡ <b>Bot capabilities demonstration</b>\nThis is just ONE of hundreds of bot possibilities!\n\n🚀 <b>Want more? Get subscription after demo!</b>\n\n⏳ <b>Generating your transformation...</b>`,
      { parse_mode: 'HTML' }
    )

    try {
      // Генерируем изображение с выбранным героем
      const userPhotoUrl = ctx.session.kontextImageUrl

      if (!userPhotoUrl) {
        logger.error('[AvatarTransformScene] No user photo URL', { telegramId })
        await ctx.reply(
          isRu
            ? '❌ Ошибка: не найдено фото пользователя'
            : '❌ Error: user photo not found'
        )
        // 🛠️ ИСПРАВЛЕНИЕ: Полностью выходим из сцены перед переходом
        await ctx.scene.leave()
        return ctx.scene.enter(ModeEnum.MainMenu)
      }

      const prompt = createMarvelPromptByGender(gender, selectedHero)

      logger.info('[AvatarTransformScene] Starting image generation', {
        telegramId,
        selectedHero,
        gender,
        promptLength: prompt.length,
      })

      await generateFluxKontext({
        prompt,
        inputImageUrl: userPhotoUrl,
        modelType: 'max',
        telegram_id: telegramId,
        username: ctx.from?.username || 'unknown',
        is_ru: isRu,
        ctx,
      })

      // 🛡️ ЗАПИСЫВАЕМ ИСПОЛЬЗОВАНИЕ (после успешной генерации)
      await markAvatarTransformUsed(telegramId)
      logger.info('[AvatarTransformScene] Usage marked for user', {
        telegramId,
      })

      // 🔧 КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: generateFluxKontext уже отправляет изображение и финальное сообщение
      // Убираем дублирующие сообщения и переходы в меню!

      // Полностью очищаем wizard состояние
      delete ctx.wizard.state

      // ВАЖНО: Полностью выходим из сцены, чтобы команда /start снова работала
      await ctx.scene.leave()

      logger.info(
        '[AvatarTransformScene] Successfully completed transformation and fully exited scene',
        {
          telegramId,
          step: 'completed_and_exited',
        }
      )

      // НЕ переходим в меню - пользователь может сам использовать /start или кнопки
      return // Завершаем выполнение
    } catch (error) {
      logger.error('[AvatarTransformScene] Generation error', {
        telegramId,
        error: String(error),
      })

      await ctx.reply(
        isRu
          ? '❌ <b>Ошибка генерации изображения</b>\n\nПопробуйте позже или обратитесь в поддержку'
          : '❌ <b>Image generation error</b>\n\nTry again later or contact support'
      )

      // 🛠️ ИСПРАВЛЕНИЕ: Полностью выходим из сцены перед переходом
      await ctx.scene.leave()
      return ctx.scene.enter(ModeEnum.MainMenu)
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
              isRu ? '👩‍💼 Женский образ' : '👩‍💼 Female look',
            ],
            [isRu ? '🔙 Назад' : '🔙 Back'],
          ]).resize().reply_markup,
        }
      )

      // Переходим к шагу выбора пола
      return ctx.wizard.selectStep(2)
    } catch (error) {
      logger.error(
        '[AvatarTransformScene] Error processing uploaded photo:',
        error
      )
      await ctx.reply(
        isRu
          ? '❌ *Ошибка обработки фото*\n\n🔄 Произошла ошибка при обработке фотографии\n💡 Попробуйте загрузить другое фото или используйте /start'
          : '❌ *Photo Processing Error*\n\n🔄 An error occurred while processing the photo\n💡 Try uploading another photo or use /start',
        { parse_mode: 'Markdown' }
      )
      // 🛠️ ИСПРАВЛЕНИЕ: Полностью выходим из сцены перед переходом
      await ctx.scene.leave()
      return ctx.scene.enter(ModeEnum.StartScene)
    }
  }
)

export default avatarTransformScene
