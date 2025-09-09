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
import { generateGeminiImage } from '@/services/generateGeminiImage'
import { createMiniAppKeyboard } from '@/menu/miniAppButton'

// Герои для выбора (по полу) - теперь со славянскими и советскими персонажами!
const HEROES_COLLECTION = {
  male: [
    // Славянские и сказочные персонажи
    'Иван-царевич',
    'Добрыня Никитич',
    'Илья Муромец',
    'Кощей Бессмертный',
    'Леший',
    // Советские мультяшки
    'Чебурашка',
    'Крокодил Гена',
    'Кот Матроскин',
    'Кот Леопольд',
    'Почтальон Печкин',
    'Дядя Фёдор',
    'Карлсон',
    'Волк Ну погоди',
    'Медведь Винни Пух',
    // Marvel герои
    'Человек-паук',
    'Железный человек',
    'Капитан Америка',
    'Тор',
    'Доктор Стрэндж',
    'Соколиный глаз',
    'Звёздный лорд',
  ],
  female: [
    // Славянские и сказочные персонажи
    'Баба Яга',
    'Василиса Прекрасная',
    'Снегурочка',
    'Жар-птица',
    'Русалка',
    // Советские мультяшки
    'Шапокляк',
    'Маша и Медведь',
    'Алёнушка',
    'Мальвина',
    'Красная Шапочка',
    'Герда',
    'Умка',
    'Принцесса Лебедь',
    'Золушка',
    // Marvel героини
    'Капитан Марвел',
    'Скарлет Витч',
    'Алая ведьма',
    'Гамора',
    'Шури',
    'Валькирия',
  ],
}

// Функция для создания детального промпта с конкретным героем
const createHeroPromptByGender = (
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

    // СЛАВЯНСКИЕ СКАЗОЧНЫЕ ПЕРСОНАЖИ - ДЕТАЛЬНЫЕ ПРОМПТЫ
    'Иван-царевич': `${baseSettings} A noble ${
      gender === 'male' ? 'young man' : 'young woman'
    } in traditional Russian royal attire with rich red caftan embroidered with golden patterns. ${
      gender === 'male' ? 'Princely bearing' : 'Royal grace'
    }. Wearing ornate crown with precious stones. Holding ceremonial sword with jeweled handle. Background with Russian palace interior, orthodox church domes. Rich warm lighting with gold and red tones, fairy tale atmosphere.`,

    'Добрыня Никитич': `${baseSettings} A mighty ${
      gender === 'male' ? 'warrior' : 'warrior maiden'
    } in ancient Russian bogatyr armor with chainmail and helmet. ${
      gender === 'male' ? 'Heroic muscular build' : 'Strong warrior presence'
    }. Large shield with Slavic symbols and mighty sword. Sitting on powerful horse. Background with Russian steppes and fortress walls. Epic heroic lighting with dramatic shadows.`,

    'Илья Муромец': `${baseSettings} A legendary ${
      gender === 'male' ? 'strongman' : 'strong woman'
    } in heavy bogatyr armor with fur cloak. ${
      gender === 'male' ? 'Massive powerful build' : 'Powerful heroic stance'
    }. Holding giant mace and shield. Long beard or braided hair. Background with ancient Russian forest and pathway. Heroic dramatic lighting with forest atmosphere.`,

    'Кощей Бессмертный': `${baseSettings} A mystical ${
      gender === 'male' ? 'sorcerer' : 'sorceress'
    } in dark ornate robes with skeletal motifs and crown of bones. ${
      gender === 'male' ? 'Gaunt immortal appearance' : 'Dark mystical presence'
    }. Holding magical staff with glowing crystal. Surrounded by dark magical energy. Background with dark castle and treasure chests. Eerie green and purple lighting with mystical fog.`,

    'Леший': `${baseSettings} A forest ${
      gender === 'male' ? 'spirit' : 'spirit maiden'
    } with bark-like skin texture and clothing made of leaves and moss. ${
      gender === 'male' ? 'Wild forest guardian look' : 'Nature spirit appearance'
    }. Hair intertwined with branches and leaves. Eyes glowing with green forest magic. Background with deep ancient forest, twisted trees. Mystical forest lighting with green tones.`,

    'Баба Яга': `${baseSettings} A mystical ${
      gender === 'male' ? 'wizard' : 'witch'
    } in traditional Russian folk outfit with embroidered shawl and many necklaces. ${
      gender === 'male' ? 'Wise ancient look' : 'Mysterious witch appearance'
    }. Holding wooden mortar and pestle. Wild grey hair with herbs. Background with chicken-legged hut and dark forest. Mystical lighting with warm firelight and shadows.`,

    'Василиса Прекрасная': `${baseSettings} A beautiful ${
      gender === 'male' ? 'prince' : 'princess'
    } in elegant Russian sarafan with gold embroidery and kokoshnik headdress. ${
      gender === 'male' ? 'Noble elegant bearing' : 'Graceful royal beauty'
    }. Holding magical glowing doll. Long braided hair with ribbons. Background with Russian palace garden and flowers. Soft romantic lighting with warm golden hour tones.`,

    'Снегурочка': `${baseSettings} A winter ${
      gender === 'male' ? 'prince' : 'maiden'
    } in ice-blue fur-trimmed coat with snowflake patterns and crystal crown. ${
      gender === 'male' ? 'Frost prince appearance' : 'Snow maiden beauty'
    }. Skin with subtle frost effect. Hair like spun silver with ice crystals. Background with winter forest and ice palace. Cool blue lighting with sparkling snow effects.`,

    'Жар-птица': `${baseSettings} A radiant ${
      gender === 'male' ? 'phoenix warrior' : 'phoenix maiden'
    } in outfit with fiery feather patterns in gold, orange and red. ${
      gender === 'male' ? 'Fiery warrior stance' : 'Graceful fire bird pose'
    }. Hair like flames with golden highlights. Arms spread like wings with fire effects. Background with magical garden and golden apples. Warm fiery lighting with golden magical glow.`,

    'Русалка': `${baseSettings} A mystical ${
      gender === 'male' ? 'water spirit' : 'mermaid'
    } with long flowing hair adorned with water lilies and pearls. ${
      gender === 'male' ? 'Aquatic warrior look' : 'Ethereal water maiden beauty'
    }. Wearing flowing garments that shimmer like water. Skin with subtle scales effect. Background with moonlit lake and willow trees. Cool aquatic lighting with moonlight reflections.`,

    // СОВЕТСКИЕ МУЛЬТЯШНЫЕ ПЕРСОНАЖИ - ДЕТАЛЬНЫЕ ПРОМПТЫ
    'Чебурашка': `${baseSettings} A cute ${
      gender === 'male' ? 'young man' : 'young woman'
    } in fuzzy brown sweater with big round ears headband accessory. ${
      gender === 'male' ? 'Friendly innocent look' : 'Sweet innocent appearance'
    }. Large expressive eyes with childlike wonder. Holding orange or small suitcase prop. Background with toy store or train station. Warm nostalgic lighting with soft focus.`,

    'Крокодил Гена': `${baseSettings} A friendly ${
      gender === 'male' ? 'gentleman' : 'lady'
    } in vintage green suit with red bow tie and harmonica. ${
      gender === 'male' ? 'Distinguished friendly appearance' : 'Elegant friendly look'
    }. Wearing vintage hat. Holding accordion or harmonica. Background with zoo or city park bench. Warm afternoon lighting with nostalgic atmosphere.`,

    'Кот Матроскин': `${baseSettings} A practical ${
      gender === 'male' ? 'young man' : 'young woman'
    } in striped sailor shirt and knitted vest. ${
      gender === 'male' ? 'Smart practical look' : 'Clever homemaker appearance'
    }. Holding milk jug or knitting needles. Cat ear headband accessory. Background with rural house interior, Russian stove. Cozy warm lighting with homey atmosphere.`,

    'Кот Леопольд': `${baseSettings} A kind ${
      gender === 'male' ? 'gentleman' : 'lady'
    } in blue bow tie and yellow vest with peaceful expression. ${
      gender === 'male' ? 'Patient kind appearance' : 'Gentle peaceful look'
    }. Round glasses and friendly smile. Making peace gesture with hands. Background with suburban house and garden. Bright cheerful lighting with sunny atmosphere.`,

    'Почтальон Печкин': `${baseSettings} A stern ${
      gender === 'male' ? 'postman' : 'postwoman'
    } in vintage postal uniform with cap and messenger bag. ${
      gender === 'male' ? 'Official serious look' : 'Strict official appearance'
    }. Holding letters and bicycle handlebar. Thick mustache or strict hairstyle. Background with rural post office and bicycle. Natural daylight with documentary style.`,

    'Дядя Фёдор': `${baseSettings} A independent ${
      gender === 'male' ? 'young boy' : 'young girl'
    } in simple sweater and cap with backpack. ${
      gender === 'male' ? 'Serious mature child look' : 'Independent young appearance'
    }. Holding sandwich or letter. Thoughtful expression beyond years. Background with rural house and vegetable garden. Natural outdoor lighting with countryside atmosphere.`,

    'Карлсон': `${baseSettings} A mischievous ${
      gender === 'male' ? 'man' : 'woman'
    } in green shorts, checkered shirt with propeller backpack prop. ${
      gender === 'male' ? 'Plump jolly appearance' : 'Cheerful playful look'
    }. Red hair and rosy cheeks. Holding jar of jam. Background with rooftop and chimneys of Stockholm. Playful lighting with sunset over city.`,

    'Волк Ну погоди': `${baseSettings} A roguish ${
      gender === 'male' ? 'bad boy' : 'bad girl'
    } in black leather jacket and torn jeans with cigarette prop. ${
      gender === 'male' ? 'Cool rebel look' : 'Rebellious rocker appearance'
    }. Slicked back hair. Making rock gesture. Background with amusement park or construction site. Dramatic lighting with rock concert vibe.`,

    'Медведь Винни Пух': `${baseSettings} A thoughtful ${
      gender === 'male' ? 'philosopher' : 'dreamer'
    } in simple red shirt with honey pot prop. ${
      gender === 'male' ? 'Round friendly build' : 'Cozy friendly appearance'
    }. Thoughtful expression while holding head. Honey on face. Background with forest clearing and bee hive tree. Warm forest lighting with honey golden tones.`,

    'Шапокляк': `${baseSettings} An elegant ${
      gender === 'male' ? 'gentleman villain' : 'mischievous lady'
    } in vintage black dress and hat with handbag. ${
      gender === 'male' ? 'Dapper villain look' : 'Sophisticated troublemaker appearance'
    }. Holding vintage umbrella. Pet rat accessory. Background with city street and vintage car. Film noir lighting with dramatic shadows.`,

    'Маша и Медведь': `${baseSettings} An energetic ${
      gender === 'male' ? 'young boy' : 'young girl'
    } in pink hooded dress or Russian folk outfit. ${
      gender === 'male' ? 'Hyperactive child energy' : 'Mischievous child appearance'
    }. Big expressive eyes. Holding lollipop or butterfly net. Background with forest house and garden. Bright cartoon-like lighting with vibrant colors.`,

    'Алёнушка': `${baseSettings} A gentle ${
      gender === 'male' ? 'young shepherd' : 'young maiden'
    } in simple Russian peasant dress with headscarf. ${
      gender === 'male' ? 'Kind pastoral look' : 'Sweet innocent beauty'
    }. Sitting by pond edge. Melancholic thoughtful expression. Background with pond, willow trees and meadow. Soft pastoral lighting with impressionist style.`,

    'Мальвина': `${baseSettings} A refined ${
      gender === 'male' ? 'young gentleman' : 'young lady'
    } with bright blue hair styled in curls with blue bow. ${
      gender === 'male' ? 'Theatrical elegant look' : 'Doll-like perfect appearance'
    }. Wearing frilly blue dress. Holding teacup or mirror. Background with theatrical stage or puppet theater. Soft theatrical lighting with pastel tones.`,

    'Красная Шапочка': `${baseSettings} An innocent ${
      gender === 'male' ? 'young boy' : 'young girl'
    } in bright red hooded cape over peasant dress. ${
      gender === 'male' ? 'Brave child appearance' : 'Sweet innocent look'
    }. Carrying wicker basket with pies. Walking through forest path. Background with forest path and grandmother's house. Fairy tale lighting with dappled sunlight.`,

    'Герда': `${baseSettings} A brave ${
      gender === 'male' ? 'young boy' : 'young girl'
    } in warm winter coat with fur trim and knitted mittens. ${
      gender === 'male' ? 'Determined traveler look' : 'Courageous journey appearance'
    }. Rosy cheeks from cold. Holding lantern or roses. Background with snowy landscape and ice palace. Cold blue lighting with warm lantern glow.`,

    'Умка': `${baseSettings} A playful ${
      gender === 'male' ? 'young man' : 'young woman'
    } in white fluffy polar bear costume with hood. ${
      gender === 'male' ? 'Polar explorer look' : 'Arctic princess appearance'
    }. Innocent curious expression. Playing in snow. Background with Arctic ice floes and northern lights. Cool Arctic lighting with aurora borealis effects.`,

    'Принцесса Лебедь': `${baseSettings} An elegant ${
      gender === 'male' ? 'swan prince' : 'swan princess'
    } in white flowing gown with feather details and crown. ${
      gender === 'male' ? 'Noble swan transformation' : 'Graceful swan beauty'
    }. Swan-like neck posture. White feather accessories. Background with moonlit lake and castle. Ethereal moonlight with swan lake atmosphere.`,

    'Золушка': `${baseSettings} A transformed ${
      gender === 'male' ? 'prince' : 'princess'
    } in sparkling ball gown or suit with glass slipper prop. ${
      gender === 'male' ? 'Rags to riches transformation' : 'Magical transformation beauty'
    }. Before/after transformation visible. Holding glass slipper. Background with palace ballroom and pumpkin carriage. Magical lighting with sparkles and midnight clock.`,
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
        // First send message with mini app inline button
        const miniAppKeyboard = createMiniAppKeyboard(isRu)
        await ctx.reply(
          isRu 
            ? `🎨 <b>Приложение для создания видео</b>\n\n🎬 Откройте наше приложение для создания профессиональных видео с AI!`
            : `🎨 <b>Video Creation App</b>\n\n🎬 Open our app to create professional videos with AI!`,
          {
            parse_mode: 'HTML',
            reply_markup: miniAppKeyboard.reply_markup
          }
        )
        
        // Then send the main message with avatar transformation
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
    const primaryHeroes = HEROES_COLLECTION[gender]

    // 🌍 ЛОКАЛИЗАЦИЯ КНОПОК ДЛЯ ГЕРОЕВ
    const getHeroButtonText = (heroName: string) => {
      const heroTranslations: Record<string, { ru: string; en: string }> = {
        // Славянские мужские персонажи
        'Иван-царевич': { ru: '🎯 Иван-царевич', en: '🎯 Ivan Tsarevich' },
        'Добрыня Никитич': { ru: '⚔️ Добрыня Никитич', en: '⚔️ Dobrynya Nikitich' },
        'Илья Муромец': { ru: '🛡️ Илья Муромец', en: '🛡️ Ilya Muromets' },
        'Кощей Бессмертный': { ru: '💀 Кощей Бессмертный', en: '💀 Koschei the Deathless' },
        'Леший': { ru: '🌲 Леший', en: '🌲 Leshy' },
        // Славянские женские персонажи
        'Баба Яга': { ru: '🧿 Баба Яга', en: '🧿 Baba Yaga' },
        'Василиса Прекрасная': { ru: '👸 Василиса Прекрасная', en: '👸 Vasilisa the Beautiful' },
        'Снегурочка': { ru: '❄️ Снегурочка', en: '❄️ Snow Maiden' },
        'Жар-птица': { ru: '🔥 Жар-птица', en: '🔥 Firebird' },
        'Русалка': { ru: '🧜‍♀️ Русалка', en: '🧜‍♀️ Rusalka' },
        // Советские мультяшки - мужские
        'Чебурашка': { ru: '🐻 Чебурашка', en: '🐻 Cheburashka' },
        'Крокодил Гена': { ru: '🐊 Крокодил Гена', en: '🐊 Crocodile Gena' },
        'Кот Матроскин': { ru: '🐱 Кот Матроскин', en: '🐱 Cat Matroskin' },
        'Кот Леопольд': { ru: '😺 Кот Леопольд', en: '😺 Cat Leopold' },
        'Почтальон Печкин': { ru: '📮 Почтальон Печкин', en: '📮 Postman Pechkin' },
        'Дядя Фёдор': { ru: '👦 Дядя Фёдор', en: '👦 Uncle Fyodor' },
        'Карлсон': { ru: '🚁 Карлсон', en: '🚁 Karlsson' },
        'Волк Ну погоди': { ru: '🐺 Волк Ну погоди', en: '🐺 Wolf Nu Pogodi' },
        'Медведь Винни Пух': { ru: '🍯 Винни Пух', en: '🍯 Winnie Pooh' },
        // Советские мультяшки - женские
        'Шапокляк': { ru: '👜 Шапокляк', en: '👜 Shapoklyak' },
        'Маша и Медведь': { ru: '🎀 Маша', en: '🎀 Masha' },
        'Алёнушка': { ru: '💫 Алёнушка', en: '💫 Alyonushka' },
        'Мальвина': { ru: '💙 Мальвина', en: '💙 Malvina' },
        'Красная Шапочка': { ru: '🔴 Красная Шапочка', en: '🔴 Red Riding Hood' },
        'Герда': { ru: '❄️ Герда', en: '❄️ Gerda' },
        'Умка': { ru: '🐻‍❄️ Умка', en: '🐻‍❄️ Umka' },
        'Принцесса Лебедь': { ru: '🦢 Принцесса Лебедь', en: '🦢 Swan Princess' },
        'Золушка': { ru: '👠 Золушка', en: '👠 Cinderella' },
        // Marvel герои
        'Человек-паук': { ru: '🕸️ Человек-паук', en: '🕸️ Spider-Man' },
        'Железный человек': { ru: '🤖 Железный человек', en: '🤖 Iron Man' },
        'Капитан Америка': { ru: '🇺🇸 Капитан Америка', en: '🇺🇸 Captain America' },
        'Тор': { ru: '⚡ Тор', en: '⚡ Thor' },
        'Доктор Стрэндж': { ru: '🎩 Доктор Стрэндж', en: '🎩 Doctor Strange' },
        'Соколиный глаз': { ru: '🏹 Соколиный глаз', en: '🏹 Hawkeye' },
        'Звёздный лорд': { ru: '🌟 Звёздный лорд', en: '🌟 Star Lord' },
        'Капитан Марвел': { ru: '✨ Капитан Марвел', en: '✨ Captain Marvel' },
        'Скарлет Витч': { ru: '🔮 Скарлет Витч', en: '🔮 Scarlet Witch' },
        'Алая ведьма': { ru: '❤️ Алая ведьма', en: '❤️ Wanda Maximoff' },
        'Гамора': { ru: '🗡️ Гамора', en: '🗡️ Gamora' },
        'Шури': { ru: '💜 Шури', en: '💜 Shuri' },
        'Валькирия': { ru: '👑 Валькирия', en: '👑 Valkyrie' },
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
              )}\n\n💰 <b>В полной версии доступны ЛЮБЫЕ образы!</b>\n🚀 <b>Технология: Google Gemini 2.5 Flash (нано банана)</b>`
          : `🤖 <b>AI Capabilities Demonstration</b>\n\n🎯 Now I'll show you how our bot transforms people!\n\n💡 <b>Choose an example for demonstration:</b>\nThis is just a small part of what our bot can do\n\n🌟 <b>Popular examples for ${
              gender === 'male' ? 'men' : 'women'
            }:</b>\n${primaryHeroes
              .map(hero => `• "${hero}" style`)
              .join(
                '\n'
              )}\n\n💰 <b>In full version ANY styles available!</b>\n🚀 <b>Technology: Google Gemini 2.5 Flash (nano banana)</b>`,
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
        // ЖЕНСКИЕ ГЕРОИ - Русские кнопки
        '✨ Капитан Марвел': 'Капитан Марвел',
        '✨ Скарлет Витч': 'Скарлет Витч',
        '✨ Алая ведьма': 'Алая ведьма',
        '✨ Гамора': 'Гамора',
        '✨ Шури': 'Шури',
        '✨ Валькирия': 'Валькирия',
        // ЖЕНСКИЕ ГЕРОИ - Английские кнопки
        '✨ Captain Marvel': 'Капитан Марвел',
        '✨ Scarlet Witch': 'Скарлет Витч',
        '✨ Wanda Maximoff': 'Алая ведьма',
        '✨ Gamora': 'Гамора',
        '✨ Shuri': 'Шури',
        '✨ Valkyrie': 'Валькирия',
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

      const prompt = createHeroPromptByGender(gender, selectedHero)

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
        logger.error('[AvatarTransformScene] Context is missing before generateFluxKontext', {
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

      // Генерируем изображение с помощью Google Gemini 2.5 Flash
      const generatedImageUrl = await generateGeminiImage({
        prompt,
        userId: Number(telegramId),
        language: isRu ? 'ru' : 'en',
        aspectRatio: '9:16',
        inputImageUrl: userPhotoUrl, // Передаем фото пользователя для трансформации
      })

      // Отправляем сгенерированное изображение пользователю
      await ctx.replyWithPhoto(generatedImageUrl, {
        caption: isRu 
          ? `✨ <b>Ваша трансформация готова!</b>\n\n🎭 Стиль: ${selectedHero}\n🚀 Технология: Google Gemini 2.5 Flash`
          : `✨ <b>Your transformation is ready!</b>\n\n🎭 Style: ${selectedHero}\n🚀 Technology: Google Gemini 2.5 Flash`,
        parse_mode: 'HTML'
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
