import { Markup, Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { getUserPhotoUrl } from '@/middlewares/getUserPhotoUrl'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { sendPhotoWithFallback } from '@/helpers/sendPhotoWithFallback'
import { checkAvatarTransformUsage } from '@/core/supabase/checkAvatarTransformUsage'
import { markAvatarTransformUsed } from '@/core/supabase/markAvatarTransformUsed'
import { getBotNameByToken } from '@/core/bot'
// Используем KIE.AI вместо Replicate для Nano Banana
import { generateNanoBananaKie } from '@/services/generateNanoBananaKie'

// Герои для выбора (по полу)
const MARVEL_HEROES = {
  male: [
    // Marvel герои
    'Человек-паук',
    'Железный человек',
    'Капитан Америка',
    'Тор',
    'Доктор Стрэндж',
    'Соколиный глаз',
    'Звёздный лорд',
    // Славянские сказочные герои
    'Иван-царевич',
    'Илья Муромец',
    'Добрыня Никитич',
    'Алёша Попович',
    'Кощей Бессмертный',
    'Серый Волк',
    'Емеля',
    // Советские мультперсонажи
    'Чебурашка',
    'Крокодил Гена',
    'Кот Матроскин',
    'Дядя Фёдор',
    'Почтальон Печкин',
    'Винни-Пух',
    'Карлсон',
    'Буратино',
  ],
  female: [
    // Marvel героини
    'Капитан Марвел',
    'Скарлет Витч',
    'Алая ведьма',
    'Гамора',
    'Шури',
    'Валькирия',
    // Славянские сказочные героини
    'Василиса Прекрасная',
    'Баба Яга',
    'Снегурочка',
    'Марья Моревна',
    'Алёнушка',
    'Жар-птица',
    'Царевна-лягушка',
    // Советские мультперсонажи
    'Шапокляк',
    'Мальвина',
    'Красная Шапочка',
    'Золушка',
    'Снежная Королева',
    'Алиса',
    'Пеппи Длинныйчулок',
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
    'Человек-паук': `${baseSettings} A charismatic ${
      gender === 'male' ? 'man' : 'woman'
    } in red and blue athletic outfit with web-like patterns. ${
      gender === 'male' ? 'Athletic build' : 'Athletic silhouette'
    }. Stylish clear glasses. Dynamic pose with hands positioned as if casting webs. Background with urban cityscape elements and geometric web patterns in blue and red colors. Superhero aesthetic with confident expression and energetic atmosphere.`,

    'Железный человек': `${baseSettings} A confident ${
      gender === 'male' ? 'man' : 'woman'
    } in sleek red and gold high-tech styled outfit. ${
      gender === 'male' ? 'Strong jawline' : 'Elegant features'
    }. Circular glowing element on chest area. One hand raised with glowing palm effect. Background with technological elements and holographic displays in blue and gold. Modern tech aesthetic with sharp, clean lines.`,

    'Капитан Америка': `${baseSettings} A heroic ${
      gender === 'male' ? 'man' : 'woman'
    } in blue outfit with white star emblem. ${
      gender === 'male' ? 'Strong patriotic stance' : 'Confident patriotic pose'
    }. Holding a circular shield-like prop. Red, white and blue color palette throughout. Background with patriotic elements and geometric patterns. Classic heroic lighting with strong shadows and highlights.`,

    Тор: `${baseSettings} A mighty ${
      gender === 'male' ? 'man' : 'woman'
    } in Nordic-inspired outfit with flowing cape. ${
      gender === 'male' ? 'Powerful build' : 'Regal presence'
    }. Long flowing hair with golden highlights. Holding a hammer-like prop with lightning-inspired lighting effects. Background with stormy sky elements and Norse-style geometric patterns. Dramatic lighting with electric blue accents.`,

    'Доктор Стрэндж': `${baseSettings} A mystical ${
      gender === 'male' ? 'man' : 'woman'
    } in elegant dark blue outfit with golden trim and mystical symbols. ${
      gender === 'male' ? 'Distinguished goatee' : 'Mystical elegance'
    }. Hands positioned in magical gestures with orange and golden light effects. Floating geometric mandalas and mystical symbols in background. Rich colors with deep blues, golds, and warm orange magical energy.`,

    'Соколиный глаз': `${baseSettings} A skilled ${
      gender === 'male' ? 'man' : 'woman'
    } in tactical purple and black outfit with precision gear. ${
      gender === 'male' ? 'Sharp focused expression' : 'Precise archer stance'
    }. Holding a bow-like prop with arrows visible. Target-like patterns in background with purple and silver accents. Urban rooftop setting with precise lighting and clean composition.`,

    'Звёздный лорд': `${baseSettings} A charismatic ${
      gender === 'male' ? 'man' : 'woman'
    } in stylish red leather jacket with tech elements. ${
      gender === 'male' ? 'Confident smirk' : 'Adventure-ready pose'
    }. Retro-futuristic headphones around neck. Holding dual energy blaster props. Background with cosmic elements and 80s-inspired neon colors. Mix of retro and space aesthetics with pink, blue, and gold lighting.`,

    // ЖЕНСКИЕ ГЕРОИ - БЕЗОПАСНЫЕ, НО УЗНАВАЕМЫЕ ПРОМПТЫ
    'Капитан Марвел': `${baseSettings} A powerful ${
      gender === 'male' ? 'man' : 'woman'
    } in cosmic-themed outfit with red, blue and gold colors. ${
      gender === 'male' ? 'Cosmic power stance' : 'Strong cosmic warrior pose'
    }. Hands glowing with golden energy effects. Short practical hair with golden highlights. Background with cosmic elements and star patterns. Dramatic lighting with golden energy flowing around the figure.`,

    'Скарлет Витч': `${baseSettings} A mystical ${
      gender === 'male' ? 'man' : 'woman'
    } in elegant red outfit with flowing cape and mystical accessories. ${
      gender === 'male'
        ? 'Mystical commanding presence'
        : 'Graceful mystical pose'
    }. Hands surrounded by crimson energy effects and floating particles. Long flowing hair with red highlights. Background with magical symbols and red energy patterns. Dramatic lighting with warm reds and mystical atmosphere.`,

    'Алая ведьма': `${baseSettings} A magical ${
      gender === 'male' ? 'man' : 'woman'
    } in dark red mystical robes with intricate golden patterns. ${
      gender === 'male' ? 'Powerful sorcerer stance' : 'Enchanting magical pose'
    }. Hands creating swirling red energy with magical particles. Detailed mystical jewelry and accessories. Background with ancient magical symbols and swirling red energy. Rich deep colors with crimson and gold magical effects.`,

    Гамора: `${baseSettings} A fierce ${
      gender === 'male' ? 'man' : 'woman'
    } in tactical black and silver outfit with cosmic warrior elements. ${
      gender === 'male' ? 'Battle-ready stance' : 'Warrior goddess pose'
    }. Holding dual blade-like props. Short practical hair with subtle green highlights. Background with cosmic battlefield elements and purple-pink nebula effects. Dramatic sci-fi lighting with sharp contrasts.`,

    Шури: `${baseSettings} A brilliant ${
      gender === 'male' ? 'man' : 'woman'
    } in advanced tech outfit with purple and gold accents inspired by African patterns. ${
      gender === 'male' ? 'Genius inventor pose' : 'Tech princess stance'
    }. Hands interacting with holographic interfaces and tech gadgets. Modern braided hairstyle with tech accessories. Background with futuristic lab elements and purple holographic displays. Clean tech aesthetic with purple and gold lighting.`,

    Валькирия: `${baseSettings} A noble ${
      gender === 'male' ? 'man' : 'woman'
    } in warrior outfit with blue and silver colors and flowing cape. ${
      gender === 'male'
        ? 'Asgardian warrior stance'
        : 'Noble warrior queen pose'
    }. Holding a sword-like prop with regal bearing. Hair in warrior braids with metallic accessories. Background with Asgardian palace elements and golden architectural details. Regal lighting with blue and gold royal colors.`,

    // СЛАВЯНСКИЕ СКАЗОЧНЫЕ ГЕРОИ
    'Иван-царевич': `${baseSettings} A noble ${
      gender === 'male' ? 'young prince' : 'princess'
    } in traditional Russian royal outfit with red and gold embroidery. Rich velvet caftan with golden patterns. Fur-trimmed hat or crown. Holding a decorative sword. Background with Russian palace elements, birch trees, and golden onion domes. Warm fairytale lighting with red and gold accents.`,

    'Илья Муромец': `${baseSettings} A mighty ${
      gender === 'male' ? 'warrior' : 'warrior woman'
    } in Viktor Vasnetsov epic style. Ancient Rus chainmail armor with Orthodox cross, conical helmet, massive sword Kladenets. Mounted on black horse. Russian steppe, distant monastery. Romantic realism oil painting style, dramatic lighting.`,

    'Добрыня Никитич': `${baseSettings} A brave ${
      gender === 'male' ? 'knight' : 'female warrior'
    } in golden Russian armor with dragon motifs. Noble stance with spear and round shield. Blonde hair and kind expression. Background with defeated dragon silhouette and Russian countryside. Golden hour lighting with warm tones.`,

    'Алёша Попович': `${baseSettings} A clever ${
      gender === 'male' ? 'young warrior' : 'warrior maiden'
    } in light Russian armor with playful elements. Mischievous smile. Holding a bow and arrows. Agile pose suggesting quick wit. Background with Russian village and church domes. Bright, cheerful lighting.`,

    'Кощей Бессмертный': `${baseSettings} A mystical ${
      gender === 'male' ? 'immortal sorcerer' : 'immortal sorceress'
    } in dark ornate robes with bone and skull motifs. Tall, thin silhouette. Glowing green eyes. Holding a magical staff with crystal. Background with dark castle and treasure chests. Eerie green and purple lighting with magical effects.`,

    'Серый Волк': `${baseSettings} A wise ${
      gender === 'male' ? 'man' : 'woman'
    } in wolf-themed outfit with grey fur elements. Wolf ears accessory. Silver and grey color palette. Loyal and protective stance. Background with moonlit forest and wolf pack silhouettes. Cool blue moonlight with silver accents.`,

    'Емеля': `${baseSettings} A lucky ${
      gender === 'male' ? 'young man' : 'young woman'
    } in simple Russian peasant clothes sitting on a decorative stove-throne. Relaxed, carefree pose. Holding a magical pike fish. Background with Russian village and magical sparkles. Warm, cozy lighting with magical golden particles.`,

    // СОВЕТСКИЕ МУЛЬТПЕРСОНАЖИ
    'Чебурашка': `${baseSettings} A cute ${
      gender === 'male' ? 'person' : 'person'
    } in brown furry costume with huge round ears. Big innocent eyes. Orange vest. Holding a small orange. Background with toy store and colorful boxes. Soft, warm lighting with nostalgic feel.`,

    'Крокодил Гена': `${baseSettings} A friendly ${
      gender === 'male' ? 'man' : 'woman'
    } in green suit with crocodile-themed accessories. Red bow tie. Holding an accordion. Kind smile. Background with zoo entrance and balloons. Cheerful daylight with bright colors.`,

    'Кот Матроскин': `${baseSettings} A smart ${
      gender === 'male' ? 'person' : 'person'
    } in striped sailor shirt with cat ears headband. Practical expression. Holding a milk jug. Background with Russian village house and garden. Sunny countryside lighting.`,

    'Дядя Фёдор': `${baseSettings} A responsible ${
      gender === 'male' ? 'young boy' : 'young girl'
    } in simple Soviet-era clothes with backpack. Serious but kind expression. Holding a sandwich. Background with Prostokvashino village. Natural daylight with pastoral atmosphere.`,

    'Почтальон Печкин': `${baseSettings} A strict ${
      gender === 'male' ? 'postman' : 'postwoman'
    } in Soviet postal uniform with cap. Holding a bicycle and mail bag. Suspicious expression with raised eyebrow. Background with rural post office. Official lighting with blue uniform tones.`,

    'Винни-Пух': `${baseSettings} A thoughtful ${
      gender === 'male' ? 'person' : 'person'
    } in brown bear costume. Round, friendly appearance. Holding a honey pot. Contemplative expression. Background with forest and beehive tree. Warm honey-colored lighting.`,

    'Карлсон': `${baseSettings} A mischievous ${
      gender === 'male' ? 'man' : 'woman'
    } in checkered shirt with propeller backpack prop. Plump, cheerful appearance. Holding jam jar. Background with Stockholm rooftops and chimney. Playful lighting with blue sky.`,

    'Буратино': `${baseSettings} A curious ${
      gender === 'male' ? 'boy' : 'girl'
    } in striped cap and red shirt with wooden texture elements. Long nose prosthetic. Holding a golden key. Background with puppet theater stage. Theatrical lighting with warm spotlights.`,

    // СЛАВЯНСКИЕ СКАЗОЧНЫЕ ГЕРОИНИ
    'Василиса Прекрасная': `${baseSettings} A beautiful ${
      gender === 'male' ? 'prince' : 'princess'
    } in ornate Russian sarafan with golden embroidery. Long braided hair with ribbon. Pearl kokoshnik headdress. Holding a magical doll. Background with Russian palace and flowering garden. Soft fairytale lighting with pink and gold.`,

    'Баба Яга': `${baseSettings} A mystical ${
      gender === 'male' ? 'wizard' : 'witch'
    } in tattered robes with forest elements. Wild grey hair. Holding a broom and mortar. Mischievous grin. Background with chicken leg hut and dark forest. Mysterious lighting with green and purple magic.`,

    'Снегурочка': `${baseSettings} A gentle ${
      gender === 'male' ? 'snow prince' : 'snow maiden'
    } in white and blue fur-trimmed outfit with snowflake patterns. Ice crown or kokoshnik. Pale, ethereal appearance. Background with winter forest and falling snow. Cool blue lighting with crystalline sparkles.`,

    'Марья Моревна': `${baseSettings} A fierce ${
      gender === 'male' ? 'warrior prince' : 'warrior princess'
    } in ornate battle armor with Russian motifs. Determined expression. Holding sword and shield. Background with battlefield and captured Koschei. Dramatic heroic lighting.`,

    'Алёнушка': `${baseSettings} A gentle ${
      gender === 'male' ? 'young man' : 'young maiden'
    } in simple Russian peasant dress. Sad but beautiful expression. Sitting by a pond. Background with birch trees and water lilies. Soft, melancholic lighting with green nature tones.`,

    'Жар-птица': `${baseSettings} A radiant ${
      gender === 'male' ? 'person' : 'person'
    } in fiery phoenix-themed outfit with feather patterns. Golden and orange colors. Glowing effects around hands. Background with magical garden and golden apples. Brilliant fire-colored lighting.`,

    'Царевна-лягушка': `${baseSettings} A wise ${
      gender === 'male' ? 'prince' : 'princess'
    } in green royal dress with amphibian motifs. Crown with lily pad design. Holding an arrow. Background with pond and palace. Magical transformation lighting with green sparkles.`,

    // СОВЕТСКИЕ МУЛЬТПЕРСОНАЖИ (ЖЕНСКИЕ)
    'Шапокляк': `${baseSettings} A mischievous ${
      gender === 'male' ? 'elderly gentleman' : 'elderly lady'
    } in Victorian black dress with vintage hat. Holding a small handbag with toy rat. Sly expression. Background with city street and lamp posts. Film noir lighting with dramatic shadows.`,

    'Мальвина': `${baseSettings} A graceful ${
      gender === 'male' ? 'person' : 'person'
    } in blue ball gown with puffy sleeves. Blue hair with bow. Porcelain doll-like makeup. Holding a pointer stick. Background with puppet theater and school board. Soft theatrical lighting.`,

    'Красная Шапочка': `${baseSettings} A brave ${
      gender === 'male' ? 'young man' : 'young girl'
    } in red hooded cape over peasant dress. Holding a basket with pies. Innocent but clever expression. Background with forest path and grandmother's house. Storybook lighting with red accents.`,

    'Золушка': `${baseSettings} A elegant ${
      gender === 'male' ? 'prince' : 'princess'
    } in sparkling ball gown with glass slipper props. Transformation from simple to glamorous. Background with pumpkin carriage and palace. Magical midnight lighting with sparkles.`,

    'Снежная Королева': `${baseSettings} A regal ${
      gender === 'male' ? 'ice king' : 'ice queen'
    } in crystalline ice dress with fur trim. Ice crown with icicle points. Cold, majestic expression. Background with ice palace and northern lights. Icy blue lighting with frost effects.`,

    'Алиса': `${baseSettings} A curious ${
      gender === 'male' ? 'young man' : 'young girl'
    } in blue dress with white apron. Blonde hair with black headband. Holding playing cards or teacup. Background with Wonderland elements and chess pieces. Whimsical lighting with surreal colors.`,

    'Пеппи Длинныйчулок': `${baseSettings} A playful ${
      gender === 'male' ? 'person' : 'girl'
    } with red braided pigtails sticking out horizontally. Mismatched colorful socks. Freckles. Super strong pose. Background with Villa Villekulla and monkey. Bright, energetic lighting.`,
  }

  // Если промпт для героя не найден, используем общий
  return (
    heroPrompts[heroName] ||
    `${baseSettings} A confident ${
      gender === 'male' ? 'man' : 'woman'
    } in modern stylish outfit inspired by ${heroName}. Professional studio lighting with bright, warm tones. Clean background with subtle color effects matching ${heroName}'s signature palette. The person wears fashionable glasses and has a charismatic expression. High-quality portrait photography with premium aesthetic.`
  )
}

export const avatarTransformScene = new Scenes.WizardScene<MyContext>(
  ModeEnum.AvatarTransform,
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString() || 'unknown'

    logger.info('[AvatarTransformScene] Starting avatar transformation', {
      telegramId,
      step: 'initial',
    })

    // 🔗 ОБРАБОТКА РЕФЕРАЛЬНЫХ ССЫЛОК
    // Извлекаем invite code из команды /start если он есть
    let inviteCode = ''
    if (ctx.message && 'text' in ctx.message) {
      const messageText = ctx.message.text
      const { extractInviteCodeFromContext } = await import(
        '@/helpers/contextUtils'
      )
      inviteCode = extractInviteCodeFromContext(ctx)

      if (inviteCode) {
        ctx.session.inviteCode = inviteCode
        logger.info('[AvatarTransformScene] Referral code detected', {
          telegramId,
          inviteCode,
          step: 'referral_detected',
        })
      }
    }

    // 🛡️ ПРОВЕРЯЕМ ЛИМИТ ИСПОЛЬЗОВАНИЯ ФУНКЦИИ
    logger.info('[AvatarTransformScene] Checking usage limit', {
      telegramId,
      step: 'checking_limit',
    })

    // Получаем имя бота из контекста
    const botName = ctx.botInfo?.username || 'AI_STARS_bot'

    const usageCheck = await checkAvatarTransformUsage(
      telegramId,
      inviteCode || undefined,
      botName
    )

    logger.info('[AvatarTransformScene] Usage limit check result', {
      telegramId,
      canUse: usageCheck.canUse,
      isAdmin: usageCheck.isAdmin,
      hasUsedBefore: usageCheck.hasUsedBefore,
      step: 'limit_checked',
    })

    // 📩 ОТПРАВЛЯЕМ УВЕДОМЛЕНИЕ РЕФЕРЕРУ при первом использовании с реферальным кодом
    if (inviteCode && usageCheck.canUse && !usageCheck.hasUsedBefore) {
      try {
        const username =
          ctx.from?.username || ctx.from?.first_name || telegramId
        const { getReferalsCountAndUserData } = await import(
          '@/core/supabase/getReferalsCountAndUserData'
        )
        const { count } = await getReferalsCountAndUserData(inviteCode)

        await ctx.telegram.sendMessage(
          inviteCode,
          `🔗 Новый пользователь @${username} зарегистрировался по вашей ссылке.\n🆔 Уровень: ${
            count + 1
          }`
        )

        logger.info(
          '[AvatarTransformScene] Referral notification sent successfully',
          {
            telegramId,
            inviteCode,
            referralLevel: count + 1,
            step: 'referral_notification_sent',
          }
        )
      } catch (notificationError) {
        logger.warn(
          '[AvatarTransformScene] Could not send referral notification',
          {
            telegramId,
            inviteCode,
            error:
              notificationError instanceof Error
                ? notificationError.message
                : 'Unknown error',
            step: 'referral_notification_failed',
          }
        )
      }
    }

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
        // Send the main message with avatar transformation directly (removed mini app promotion)
        const photoSent = await sendPhotoWithFallback(ctx, userPhotoUrl, {
          caption: isRu
            ? `🤖 <b>Добро пожаловать в AI-трансформацию!</b>\n\n👋 Привет! Я покажу вам мощь нашей AI-технологии!\n\n📸 <b>Ваше фото для трансформации</b>\n🎨 Я беру ваше фото (из профиля или загруженное) и трансформирую его в любой стиль!\n\n🌟 <b>Демо возможностей бота:</b>\n• Трансформация в стиле популярных персонажей\n• Кинематографическое качество обработки\n• Профессиональная AI-генерация FLUX Kontext Max\n• Любые образы на ваш выбор (в полной версии)\n\n🎁 <b>Это БЕСПЛАТНАЯ демонстрация возможностей!</b>\n💰 <b>Полный доступ ко всем функциям бота - после покупки</b>\n\n🎯 Выберите действие:`
            : `🤖 <b>Welcome to AI Transformation!</b>\n\n👋 Hello! I'll show you the power of our AI technology!\n\n📸 <b>Your photo for transformation</b>\n🎨 I take your photo (from profile or uploaded) and transform it into any style!\n\n🌟 <b>Bot capabilities demo:</b>\n• Transformation in popular character styles\n• Cinematic quality processing\n• Professional AI generation FLUX Kontext Max\n• Any styles of your choice (in full version)\n\n🎁 <b>This is a FREE demonstration of capabilities!</b>\n💰 <b>Full access to all bot functions - after purchase</b>\n\n🎯 Choose action:`,
          parse_mode: 'HTML',
          reply_markup: Markup.keyboard([
            [
              isRu ? '🎨 Использовать мой аватар' : '🎨 Use my avatar',
              isRu ? '📸 Загрузить своё фото' : '📸 Upload my photo',
            ],
            [isRu ? '⏩ Пропустить' : '⏩ Skip'],
          ]).resize().reply_markup,
        })

        // Если фото не удалось отправить, отправляем текстовое сообщение
        if (!photoSent) {
          logger.warn(
            '[AvatarTransformScene] Photo fallback failed, sending text message'
          )

          await ctx.reply(
            isRu
              ? `🤖 <b>Добро пожаловать в AI-трансформацию!</b>\n\n👋 Привет! Я покажу вам мощь нашей AI-технологии!\n\n📸 <b>Ваше фото для трансформации</b>\n🎨 Я беру ваше фото (из профиля или загруженное) и трансформирую его в любой стиль!\n\n🌟 <b>Демо возможностей бота:</b>\n• Трансформация в стиле популярных персонажей\n• Кинематографическое качество обработки\n• Профессиональная AI-генерация FLUX Kontext Max\n• Любые образы на ваш выбор (в полной версии)\n\n🎁 <b>Это БЕСПЛАТНАЯ демонстрация возможностей!</b>\n💰 <b>Полный доступ ко всем функциям бота - после покупки</b>\n\n🎯 Выберите действие:`
              : `🤖 <b>Welcome to AI Transformation!</b>\n\n👋 Hello! I'll show you the power of our AI technology!\n\n📸 <b>Your photo for transformation</b>\n🎨 I take your photo (from profile or uploaded) and transform it into any style!\n\n🌟 <b>Bot capabilities demo:</b>\n• Transformation in popular character styles\n• Cinematic quality processing\n• Professional AI generation FLUX Kontext Max\n• Any styles of your choice (in full version)\n\n🎁 <b>This is a FREE demonstration of capabilities!</b>\n💰 <b>Full access to all bot functions - after purchase</b>\n\n🎯 Choose action:`,
            {
              parse_mode: 'HTML',
              reply_markup: Markup.keyboard([
                [
                  isRu ? '🎨 Использовать мой аватар' : '🎨 Use my avatar',
                  isRu ? '📸 Загрузить своё фото' : '📸 Upload my photo',
                ],
                [isRu ? '⏩ Пропустить' : '⏩ Skip'],
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
            ? `🤖 <b>Добро пожаловать в AI-трансформацию!</b>\n\n👋 Привет! Я покажу вам мощь нашей AI-технологии!\n\n📸 <b>Ваше фото для трансформации</b>\n🎨 Я беру ваше фото (из профиля или загруженное) и трансформирую его в любой стиль!\n\n🌟 <b>Демо возможностей бота:</b>\n• Трансформация в стиле популярных персонажей\n• Кинематографическое качество обработки\n• Профессиональная AI-генерация FLUX Kontext Max\n• Любые образы на ваш выбор (в полной версии)\n\n🎁 <b>Это БЕСПЛАТНАЯ демонстрация возможностей!</b>\n💰 <b>Полный доступ ко всем функциям бота - после покупки</b>\n\n🎯 Выберите действие:`
            : `🤖 <b>Welcome to AI Transformation!</b>\n\n👋 Hello! I'll show you the power of our AI technology!\n\n📸 <b>Your photo for transformation</b>\n🎨 I take your photo (from profile or uploaded) and transform it into any style!\n\n🌟 <b>Bot capabilities demo:</b>\n• Transformation in popular character styles\n• Cinematic quality processing\n• Professional AI generation FLUX Kontext Max\n• Any styles of your choice (in full version)\n\n🎁 <b>This is a FREE demonstration of capabilities!</b>\n💰 <b>Full access to all bot functions - after purchase</b>\n\n🎯 Choose action:`,
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
    const isRu = isRussianFromState(ctx)
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
          : '👋 Okay, returning to main menu\n\n💡 You can always return to transformation via /start',
        { reply_markup: { remove_keyboard: true } }
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
        { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
      )
      return ctx.wizard.selectStep(4) // 🛠️ ИСПРАВЛЕНИЕ: Переходим к шагу загрузки фото (индекс 4)
    }
  },
  // Шаг 3: Обработка выбора пола и показ кнопок героев
  async ctx => {
    const isRu = isRussianFromState(ctx)
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

    // Helper function to create rows with 2 buttons each
    const createTwoButtonRows = (buttons: string[]): string[][] => {
      const rows: string[][] = []
      for (let i = 0; i < buttons.length; i += 2) {
        rows.push(buttons.slice(i, i + 2))
      }
      return rows
    }

    // Создаем кнопки для выбора героев ТОЛЬКО для выбранного пола
    const primaryHeroes = MARVEL_HEROES[gender]

    // 🌍 ЛОКАЛИЗАЦИЯ КНОПОК ДЛЯ ГЕРОЕВ
    const getHeroButtonText = (heroName: string) => {
      const heroTranslations: Record<string, { ru: string; en: string }> = {
        // Marvel герои - уникальные эмодзи
        'Человек-паук': { ru: '🕷️ Человек-паук', en: '🕷️ Spider-Man' },
        'Железный человек': { ru: '🤖 Железный человек', en: '🤖 Iron Man' },
        'Капитан Америка': { ru: '🇦🇲 Капитан Америка', en: '🇦🇲 Captain America' },
        'Тор': { ru: '⚡ Тор', en: '⚡ Thor' },
        'Доктор Стрэндж': { ru: '🧿 Доктор Стрэндж', en: '🧿 Doctor Strange' },
        'Соколиный глаз': { ru: '🏹 Соколиный глаз', en: '🏹 Hawkeye' },
        'Звёздный лорд': { ru: '🚀 Звёздный лорд', en: '🚀 Star Lord' },
        'Капитан Марвел': { ru: '⭐ Капитан Марвел', en: '⭐ Captain Marvel' },
        'Скарлет Витч': { ru: '🔮 Скарлет Витч', en: '🔮 Scarlet Witch' },
        'Алая ведьма': { ru: '🌹 Алая ведьма', en: '🌹 Wanda Maximoff' },
        'Гамора': { ru: '🗡️ Гамора', en: '🗡️ Gamora' },
        'Шури': { ru: '💙 Шури', en: '💙 Shuri' },
        'Валькирия': { ru: '⚔️ Валькирия', en: '⚔️ Valkyrie' },
        // Славянские сказочные герои
        'Иван-царевич': { ru: '🤴 Иван-царевич', en: '🤴 Ivan Tsarevich' },
        'Илья Муромец': { ru: '🛡️ Илья Муромец', en: '🛡️ Ilya Muromets' },
        'Добрыня Никитич': { ru: '💉 Добрыня Никитич', en: '💉 Dobrynya Nikitich' },
        'Алёша Попович': { ru: '🎯 Алёша Попович', en: '🎯 Alyosha Popovich' },
        'Кощей Бессмертный': { ru: '💀 Кощей Бессмертный', en: '💀 Koschei' },
        'Серый Волк': { ru: '🐺 Серый Волк', en: '🐺 Grey Wolf' },
        'Емеля': { ru: '🎣 Емеля', en: '🎣 Emelya' },
        'Василиса Прекрасная': { ru: '👸 Василиса Прекрасная', en: '👸 Vasilisa' },
        'Баба Яга': { ru: '🧿 Баба Яга', en: '🧿 Baba Yaga' },
        'Снегурочка': { ru: '❄️ Снегурочка', en: '❄️ Snow Maiden' },
        'Марья Моревна': { ru: '💂 Марья Моревна', en: '💂 Marya Morevna' },
        'Алёнушка': { ru: '🌾 Алёнушка', en: '🌾 Alyonushka' },
        'Жар-птица': { ru: '🔥 Жар-птица', en: '🔥 Firebird' },
        'Царевна-лягушка': { ru: '🐸 Царевна-лягушка', en: '🐸 Frog Princess' },
        // Советские мультперсонажи
        'Чебурашка': { ru: '🐵 Чебурашка', en: '🐵 Cheburashka' },
        'Крокодил Гена': { ru: '🐊 Крокодил Гена', en: '🐊 Gena' },
        'Кот Матроскин': { ru: '🐱 Кот Матроскин', en: '🐱 Matroskin' },
        'Дядя Фёдор': { ru: '👦 Дядя Фёдор', en: '👦 Uncle Fyodor' },
        'Почтальон Печкин': { ru: '📬 Почтальон Печкин', en: '📬 Pechkin' },
        'Винни-Пух': { ru: '🐻 Винни-Пух', en: '🐻 Winnie Pooh' },
        'Карлсон': { ru: '🎀 Карлсон', en: '🎀 Karlsson' },
        'Буратино': { ru: '🪀 Буратино', en: '🪀 Buratino' },
        'Шапокляк': { ru: '🎩 Шапокляк', en: '🎩 Shapoklyak' },
        'Мальвина': { ru: '👩‍🎨 Мальвина', en: '👩‍🎨 Malvina' },
        'Красная Шапочка': { ru: '🧧 Красная Шапочка', en: '🧧 Red Hood' },
        'Золушка': { ru: '👠 Золушка', en: '👠 Cinderella' },
        'Снежная Королева': { ru: '🌨️ Снежная Королева', en: '🌨️ Snow Queen' },
        'Алиса': { ru: '🎀 Алиса', en: '🎀 Alice' },
        'Пеппи Длинныйчулок': { ru: '🦾 Пеппи Длинныйчулок', en: '🦾 Pippi' },
      }

      const translation = heroTranslations[heroName]
      if (translation) {
        return isRu ? translation.ru : translation.en
      }

      // Фолбэк для неизвестных героев
      const icon = gender === 'male' ? '🎨' : '✨'
      return `${icon} ${heroName}`
    }

    const heroButtonsList = primaryHeroes.map(hero => getHeroButtonText(hero))

    const heroButtons = [
      ...createTwoButtonRows(heroButtonsList),
      // Последний ряд - служебные кнопки
      [
        isRu ? '🎲 Случайный стиль' : '🎲 Random style',
        isRu ? '🔙 Назад' : '🔙 Back',
      ],
    ]

    logger.info('[AvatarTransformScene] Creating hero selection keyboard:', {
      gender,
      primaryHeroesCount: primaryHeroes.length,
      buttonsStructure: heroButtons,
    })

    try {
      await ctx.reply(
        isRu
          ? `🤖 <b>Демонстрация AI-возможностей</b>\n\n🎯 Сейчас я покажу вам как наш бот трансформирует людей!\n\n💡 <b>Выберите пример для демонстрации:</b>\nЭто лишь небольшая часть того, что умеет наш бот\n\n🌟 <b>Популярные примеры для ${
              gender === 'male' ? 'мужчин' : 'женщин'
            }:</b>\n${primaryHeroes
              .map(hero => `• Стиль "${hero}"`)
              .join(
                '\n'
              )}\n\n💰 <b>В полной версии доступны ЛЮБЫЕ образы!</b>\n🚀 <b>Технология: FLUX Kontext Max</b>`
          : `🤖 <b>AI Capabilities Demonstration</b>\n\n🎯 Now I'll show you how our bot transforms people!\n\n💡 <b>Choose an example for demonstration:</b>\nThis is just a small part of what our bot can do\n\n🌟 <b>Popular examples for ${
              gender === 'male' ? 'men' : 'women'
            }:</b>\n${primaryHeroes
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
    const isRu = isRussianFromState(ctx)
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
      logger.info(
        '[AvatarTransformScene] Back button pressed, returning to gender selection',
        {
          telegramId,
          currentStep: ctx.wizard.cursor,
        }
      )

      // Показываем сообщение выбора пола заново
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

      // Возвращаемся к выбору пола (индекс 2 = шаг 3)
      ctx.wizard.selectStep(2)
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
      // Маппинг кнопок к именам героев (с уникальными эмодзи)
      const buttonToHeroMap: Record<string, string> = {
        // Marvel - Русские кнопки (уникальные эмодзи)
        '🕷️ Человек-паук': 'Человек-паук',
        '🤖 Железный человек': 'Железный человек',
        '🇦🇲 Капитан Америка': 'Капитан Америка',
        '⚡ Тор': 'Тор',
        '🧿 Доктор Стрэндж': 'Доктор Стрэндж',
        '🏹 Соколиный глаз': 'Соколиный глаз',
        '🚀 Звёздный лорд': 'Звёздный лорд',
        // Marvel - Английские кнопки
        '🕷️ Spider-Man': 'Человек-паук',
        '🤖 Iron Man': 'Железный человек',
        '🇦🇲 Captain America': 'Капитан Америка',
        '⚡ Thor': 'Тор',
        '🧿 Doctor Strange': 'Доктор Стрэндж',
        '🏹 Hawkeye': 'Соколиный глаз',
        '🚀 Star Lord': 'Звёздный лорд',
        // Marvel женские - Русские кнопки
        '⭐ Капитан Марвел': 'Капитан Марвел',
        '🔮 Скарлет Витч': 'Скарлет Витч',
        '🌹 Алая ведьма': 'Алая ведьма',
        '🗡️ Гамора': 'Гамора',
        '💙 Шури': 'Шури',
        '⚔️ Валькирия': 'Валькирия',
        // Marvel женские - Английские кнопки
        '⭐ Captain Marvel': 'Капитан Марвел',
        '🔮 Scarlet Witch': 'Скарлет Витч',
        '🌹 Wanda Maximoff': 'Алая ведьма',
        '🗡️ Gamora': 'Гамора',
        '💙 Shuri': 'Шури',
        '⚔️ Valkyrie': 'Валькирия',
        // Славянские сказочные - Русские
        '🤴 Иван-царевич': 'Иван-царевич',
        '🛡️ Илья Муромец': 'Илья Муромец',
        '💉 Добрыня Никитич': 'Добрыня Никитич',
        '🎯 Алёша Попович': 'Алёша Попович',
        '💀 Кощей Бессмертный': 'Кощей Бессмертный',
        '🐺 Серый Волк': 'Серый Волк',
        '🎣 Емеля': 'Емеля',
        '👸 Василиса Прекрасная': 'Василиса Прекрасная',
        '🧿 Баба Яга': 'Баба Яга',
        '❄️ Снегурочка': 'Снегурочка',
        '💂 Марья Моревна': 'Марья Моревна',
        '🌾 Алёнушка': 'Алёнушка',
        '🔥 Жар-птица': 'Жар-птица',
        '🐸 Царевна-лягушка': 'Царевна-лягушка',
        // Славянские сказочные - Английские
        '🤴 Ivan Tsarevich': 'Иван-царевич',
        '🛡️ Ilya Muromets': 'Илья Муромец',
        '💉 Dobrynya Nikitich': 'Добрыня Никитич',
        '🎯 Alyosha Popovich': 'Алёша Попович',
        '💀 Koschei': 'Кощей Бессмертный',
        '🐺 Grey Wolf': 'Серый Волк',
        '🎣 Emelya': 'Емеля',
        '👸 Vasilisa': 'Василиса Прекрасная',
        '🧿 Baba Yaga': 'Баба Яга',
        '❄️ Snow Maiden': 'Снегурочка',
        '💂 Marya Morevna': 'Марья Моревна',
        '🌾 Alyonushka': 'Алёнушка',
        '🔥 Firebird': 'Жар-птица',
        '🐸 Frog Princess': 'Царевна-лягушка',
        // Советские мультперсонажи - Русские
        '🐵 Чебурашка': 'Чебурашка',
        '🐊 Крокодил Гена': 'Крокодил Гена',
        '🐱 Кот Матроскин': 'Кот Матроскин',
        '👦 Дядя Фёдор': 'Дядя Фёдор',
        '📬 Почтальон Печкин': 'Почтальон Печкин',
        '🐻 Винни-Пух': 'Винни-Пух',
        '🎀 Карлсон': 'Карлсон',
        '🪀 Буратино': 'Буратино',
        '🎩 Шапокляк': 'Шапокляк',
        '👩‍🎨 Мальвина': 'Мальвина',
        '🧧 Красная Шапочка': 'Красная Шапочка',
        '👠 Золушка': 'Золушка',
        '🌨️ Снежная Королева': 'Снежная Королева',
        '🎀 Алиса': 'Алиса',
        '🦾 Пеппи Длинныйчулок': 'Пеппи Длинныйчулок',
        // Советские мультперсонажи - Английские
        '🐵 Cheburashka': 'Чебурашка',
        '🐊 Gena': 'Крокодил Гена',
        '🐱 Matroskin': 'Кот Матроскин',
        '👦 Uncle Fyodor': 'Дядя Фёдор',
        '📬 Pechkin': 'Почтальон Печкин',
        '🐻 Winnie Pooh': 'Винни-Пух',
        '🎀 Karlsson': 'Карлсон',
        '🪀 Buratino': 'Буратино',
        '🎩 Shapoklyak': 'Шапокляк',
        '👩‍🎨 Malvina': 'Мальвина',
        '🧧 Red Hood': 'Красная Шапочка',
        '👠 Cinderella': 'Золушка',
        '🌨️ Snow Queen': 'Снежная Королева',
        '🎀 Alice': 'Алиса',
        '🦾 Pippi': 'Пеппи Длинныйчулок',
      }

      selectedHero = buttonToHeroMap[receivedText]
      
      // 🔍 Логируем результат маппинга
      logger.info('[AvatarTransformScene] Button mapping check', {
        telegramId,
        receivedText,
        mappedHero: selectedHero,
        isInMap: !!buttonToHeroMap[receivedText],
      })

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
      { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
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
      
      logger.info('[AvatarTransformScene] Prompt generated for hero', {
        telegramId,
        selectedHero,
        gender,
        promptLength: prompt?.length,
        promptPreview: prompt?.substring(0, 150),
      })

      logger.info('[AvatarTransformScene] Starting image generation', {
        telegramId,
        selectedHero,
        gender,
        promptLength: prompt.length,
        contextExists: !!ctx,
        contextTelegramExists: !!ctx?.telegram,
      })

      // Проверяем наличие контекста перед вызовом
      if (!ctx || !ctx.telegram) {
        logger.error('[AvatarTransformScene] Context is missing before generateNanoBanana', {
          telegramId,
          ctxExists: !!ctx,
          ctxTelegramExists: !!ctx?.telegram,
        })
        await ctx.reply(
          isRu
            ? '❌ Ошибка контекста. Попробуйте еще раз через /start'
            : '❌ Context error. Please try again via /start'
        )
        await ctx.scene.leave()
        return ctx.scene.enter(ModeEnum.MainMenu)
      }

      // 🌟 Используем Google Nano Banana для трансформации
      console.log('🔥🔥🔥 [AvatarTransformScene] BEFORE CALLING generateNanoBanana 🔥🔥🔥', {
        telegramId,
        promptLength: prompt?.length,
        hasImageUrl: !!userPhotoUrl,
        selectedHero,
      })
      
      logger.info('[AvatarTransformScene] Calling generateNanoBanana', {
        telegramId,
        promptLength: prompt?.length,
        hasImageUrl: !!userPhotoUrl,
      })
      
      // Пробуем KIE.AI, если не работает - fallback на Replicate
      let result: string | null = null
      
      try {
        console.log('🎨 Trying KIE.AI first...', { telegramId })
        result = await generateNanoBananaKie({
          telegram_id: telegramId,
          promptText: prompt,
          inputImageUrl: userPhotoUrl,
          ctx,
          username: ctx.from?.username || 'unknown',
          is_ru: isRu,
        })
        
        if (result) {
          console.log('✅ KIE.AI generation successful!', { telegramId, result: !!result })
        }
      } catch (kieError) {
        console.log('⚠️ KIE.AI failed, trying Replicate fallback...', {
          telegramId,
          kieError: kieError instanceof Error ? kieError.message : 'Unknown'
        })
        
        // Fallback на оригинальный Replicate
        try {
          const { generateNanoBanana } = await import('@/services/generateNanoBanana')
          console.log('🔄 Calling Replicate fallback...', { telegramId })
          result = await generateNanoBanana({
            telegram_id: telegramId,
            promptText: prompt,
            inputImageUrl: userPhotoUrl,
            ctx,
            username: ctx.from?.username || 'unknown',
            is_ru: isRu,
          })
          
          if (result) {
            console.log('✅ Replicate fallback successful!', { telegramId, result: !!result })
          }
        } catch (replicateError) {
          console.error('❌ Both KIE.AI and Replicate failed!', {
            telegramId,
            kieError: kieError instanceof Error ? kieError.message : 'Unknown',
            replicateError: replicateError instanceof Error ? replicateError.message : 'Unknown'
          })
          throw replicateError
        }
      }
      
      console.log('🎯🎯🎯 [AvatarTransformScene] AFTER generateNanoBanana 🎯🎯🎯', {
        telegramId,
        resultReceived: !!result,
      })
      
      logger.info('[AvatarTransformScene] Nano Banana generation completed', {
        telegramId,
        success: !!result,
      })

      // 🛡️ ЗАПИСЫВАЕМ ИСПОЛЬЗОВАНИЕ (после успешной генерации)
      await markAvatarTransformUsed(telegramId)
      logger.info('[AvatarTransformScene] Usage marked for user', {
        telegramId,
      })

      // 🚀 ПЕРЕХОДИМ К ПРИВЕТСТВИЮ И ОБУЧАЮЩЕМУ ВИДЕО ПОСЛЕ ДЕМОНСТРАЦИИ
      await ctx.reply(
        isRu
          ? `🎉 <b>Демо-трансформация завершена!</b>\n\n😊 Вам понравилось? Это лишь ОДНА из сотен возможностей нашего бота!\n\n🎓 Теперь посмотрите обучающее видео и узнайте больше о возможностях бота!`
          : `🎉 <b>Demo transformation completed!</b>\n\n😊 Did you like it? This is just ONE of hundreds of our bot's capabilities!\n\n🎓 Now watch the educational video and learn more about the bot's features!`,
        {
          parse_mode: 'HTML',
          reply_markup: { remove_keyboard: true },
        }
      )

      // ВАЖНО: Полностью выходим из сцены, чтобы команда /start снова работала
      await ctx.scene.leave()

      // ПЕРЕХОДИМ К STARTSCENE (приветствие + обучающее видео)
      await ctx.scene.enter(ModeEnum.StartScene)

      logger.info(
        '[AvatarTransformScene] Successfully completed transformation and transitioned to StartScene',
        {
          telegramId,
          step: 'completed_transition_to_startscene',
        }
      )

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
    const isRu = isRussianFromState(ctx)
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
