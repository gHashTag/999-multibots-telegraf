/**
 * Welcome Avatar Generation Inngest Function
 * Generates a free AI portrait for new users upon registration
 */

import { inngest, createInngestFailureHandler } from '@/inngest_app/client'
import { NonRetriableError } from 'inngest'
import { isSafeMode, skippedInSafeMode } from '@/inngest_app/safeMode'
import { logger } from '@/utils/logger'
import { getBotByNameAdapter } from '@/inngest_app/services/bot-adapter'
import { generateSeeDream45 } from '@/services/generateSeeDream45'
import { reserveWelcomeGiftSlot } from '@/inngest_app/functions/welcomeGiftBudget'

// Top heroes for each gender (safe, recognizable prompts)
const MALE_HEROES = [
  'Человек-паук',
  'Железный человек',
  'Капитан Америка',
  'Тор',
  'Бэтмен',
] as const

const FEMALE_HEROES = [
  'Чудо-женщина',
  'Чёрная вдова',
  'Супергёрл',
  'Гамора',
  'Капитан Марвел',
] as const

// Hero prompts (adapted from avatarTransformScene)
const getHeroPrompt = (heroName: string, gender: 'male' | 'female'): string => {
  const baseSettings = `[Cinematic portrait photography. Medium shot. Aspect ratio 9:16. Professional studio lighting with dramatic effects]`

  const heroPrompts: Record<string, string> = {
    'Человек-паук': `${baseSettings} A charismatic ${
      gender === 'male' ? 'man' : 'woman'
    } in red and blue athletic outfit with web-like patterns. ${
      gender === 'male' ? 'Athletic build' : 'Athletic silhouette'
    }. Stylish clear glasses. Dynamic pose with hands positioned as if casting webs. Background with urban cityscape elements and geometric web patterns in blue and red colors. Superhero aesthetic with confident expression and energetic atmosphere.`,

    'Железный человек': `${baseSettings} A confident ${
      gender === 'male' ? 'man' : 'woman'
    } in sleek red and gold high-tech styled outfit. ${
      gender === 'male' ? 'Strong jawline' : 'Elegant features'
    }. Circular glowing element on chest area. One hand raised with glowing palm effect. Background with technological elements and holographic displays in blue and gold.`,

    'Капитан Америка': `${baseSettings} A heroic ${
      gender === 'male' ? 'man' : 'woman'
    } in blue outfit with white star emblem. ${
      gender === 'male' ? 'Strong patriotic stance' : 'Confident patriotic pose'
    }. Holding a circular shield-like prop. Red, white and blue color palette throughout. Classic heroic lighting.`,

    Тор: `${baseSettings} A mighty ${
      gender === 'male' ? 'Norse god' : 'Norse goddess'
    } in royal blue and silver Asgardian armor with cape. ${
      gender === 'male' ? 'Godlike powerful stance' : 'Divine warrior pose'
    }. Mystical hammer in hand with lightning effects. Lightning bolts crackling around. Divine golden light.`,

    Бэтмен: `${baseSettings} A mysterious ${
      gender === 'male' ? 'man' : 'woman'
    } in dark tactical armor with bat-themed elements. ${
      gender === 'male' ? 'Brooding vigilante stance' : 'Shadow warrior pose'
    }. Cape flowing in darkness. Gotham cityscape background with dark blue and black colors.`,

    'Чудо-женщина': `${baseSettings} A powerful ${
      gender === 'male' ? 'warrior' : 'Amazon warrior'
    } in golden and red armor with star elements. ${
      gender === 'male' ? 'Warrior champion stance' : 'Wonder Woman iconic pose'
    }. Golden lasso glowing. Greek temple background with divine golden lighting.`,

    'Чёрная вдова': `${baseSettings} A skilled ${
      gender === 'male' ? 'spy' : 'super spy'
    } in sleek black tactical suit. ${
      gender === 'male' ? 'Secret agent stance' : 'Black Widow combat pose'
    }. Red hair flowing. High-tech gadgets visible. Urban night background with red and black accents.`,

    Супергёрл: `${baseSettings} A powerful ${
      gender === 'male' ? 'Kryptonian hero' : 'Kryptonian heroine'
    } in blue outfit with red cape and S symbol. ${
      gender === 'male' ? 'Hero landing pose' : 'Supergirl flying pose'
    }. Cape billowing dramatically. Sky background with clouds and golden sunlight.`,

    Гамора: `${baseSettings} A deadly ${
      gender === 'male' ? 'assassin' : 'assassin warrior'
    } with green skin in black and purple tactical gear. ${
      gender === 'male' ? 'Deadly warrior stance' : 'Guardian assassin pose'
    }. Sword in hand. Space background with cosmic elements and green energy.`,

    'Капитан Марвел': `${baseSettings} A cosmic ${
      gender === 'male' ? 'hero' : 'heroine'
    } in red, blue and gold suit with star emblem. ${
      gender === 'male' ? 'Cosmic power stance' : 'Captain Marvel power pose'
    }. Energy glowing from hands. Space background with cosmic energy in blue and gold.`,
  }

  return heroPrompts[heroName] || heroPrompts['Человек-паук']
}

// Event data interface
interface WelcomeAvatarEventData {
  telegram_id: string
  avatarUrl: string
  gender: 'male' | 'female' | 'unknown'
  bot_name: string
  username?: string
  is_ru?: boolean
}

export const welcomeAvatarGeneration = inngest.createFunction(
  {
    // Canonical id (spec-first manifest). Legacy id was 'welcome-avatar-generation'.
    id: 'welcome-avatar-generate',
    name: '🎁 Welcome Avatar',
    retries: 2,
    // 🔥 CRITICAL: Log errors to application logs (not just Inngest dashboard)
    onFailure: createInngestFailureHandler('welcome-avatar-generate'),
    concurrency: {
      limit: 5,
      key: 'event.data.telegram_id',
    },
  },
  // Canonical event first, legacy event kept for existing senders.
  [
    { event: 'welcome/avatar.generate' },
    { event: 'user/welcome.avatar.generate' },
  ],
  async ({ event, step }) => {
    const {
      telegram_id,
      avatarUrl,
      gender,
      bot_name,
      username = 'user',
      is_ru = true,
    } = (event.data || {}) as WelcomeAvatarEventData

    // Missing identifiers never heal on retry — terminal.
    if (!telegram_id || !bot_name) {
      throw new NonRetriableError(
        `welcome/avatar.generate requires telegram_id and bot_name (got telegram_id=${String(
          telegram_id
        )}, bot_name=${String(bot_name)})`
      )
    }

    logger.info('🎁 [Welcome Avatar] Starting generation', {
      telegram_id,
      gender,
      bot_name,
      hasAvatar: !!avatarUrl,
    })

    // Step 1: Validate bot exists (just check, don't pass instance)
    const botValidation = await step.run('validate-bot', async () => {
      const botData = getBotByNameAdapter(bot_name)
      if (!botData.bot) {
        return { valid: false, error: botData.error || 'Bot not found' }
      }
      return { valid: true }
    })

    if (!botValidation.valid) {
      const errorMsg =
        'error' in botValidation ? botValidation.error : 'Bot validation failed'
      // a probe sends a bot that does not exist on purpose — warn, not an
      // admin-chat error
      const logMissingBot = isSafeMode(event)
        ? logger.warn.bind(logger)
        : logger.error.bind(logger)
      logMissingBot('🎁 [Welcome Avatar] Bot not found', {
        bot_name,
        error: errorMsg,
      })
      return { success: false, error: errorMsg }
    }

    // Safe mode: reserve-gift-slot consumes the daily gift budget,
    // generate-image calls the paid SeeDream API and send-welcome messages a
    // real user — stop here with an explicit marker.
    if (isSafeMode(event)) {
      const skipped = skippedInSafeMode('reserve-gift-slot + generate-image')
      logger.warn('🎁 [Welcome Avatar] 🛡️ safe mode — generation skipped', {
        telegram_id,
        ...skipped,
      })
      return { success: false, ...skipped }
    }

    // Step 2: Select random hero based on gender
    const selectedHero = await step.run('select-hero', async () => {
      const heroes = gender === 'female' ? FEMALE_HEROES : MALE_HEROES
      const randomIndex = Math.floor(Math.random() * heroes.length)
      const hero = heroes[randomIndex]

      logger.info('🎁 [Welcome Avatar] Hero selected', {
        telegram_id,
        hero,
        gender,
      })

      return hero
    })

    // Step 2.5: Reserve a slot from the per-process burst breaker before we
    // spend the owner's provider money. Done in a step so an Inngest retry
    // returns the cached decision instead of consuming a second slot. See
    // welcomeGiftBudget.ts for what this bounds (a burst) and does NOT (a
    // shared daily budget — that needs an owner DB counter).
    const giftSlot = await step.run('reserve-gift-slot', async () => {
      return reserveWelcomeGiftSlot(new Date())
    })

    if (!giftSlot.granted) {
      logger.warn(
        '🎁 [Welcome Avatar] Gift slot denied by burst breaker — skipping generation',
        { telegram_id, used: giftSlot.used, limit: giftSlot.limit }
      )
    }

    // Step 3: Generate image using SeeDream-4 (cheapest option)
    // ⚠️ IMPORTANT: Get bot INSIDE step to avoid Inngest serialization issues
    // Telegraf instances have methods that cannot be serialized between steps
    // The branch is deterministic across retries (giftSlot came from a step).
    const generationResult = !giftSlot.granted
      ? { success: false as const, error: 'welcome gift burst breaker reached' }
      : await step.run('generate-image', async () => {
          // Get fresh bot instance inside step (avoids serialization issues)
          const botData = getBotByNameAdapter(bot_name)
          if (!botData.bot) {
            logger.error(
              '🎁 [Welcome Avatar] Bot not available in generate step',
              {
                bot_name,
              }
            )
            return { success: false, error: 'Bot not available' }
          }
          const bot = botData.bot

          const heroGender = gender === 'unknown' ? 'male' : gender
          const prompt = getHeroPrompt(selectedHero, heroGender)

          logger.info('🎁 [Welcome Avatar] Generating image', {
            telegram_id,
            hero: selectedHero,
            promptLength: prompt.length,
          })

          // Create a minimal context for generation
          const mockCtx = {
            reply: async (text: string) => {
              // Return the REAL message_id so the generator can delete its own
              // "generating…" status message. With the old fake id (0) plus the
              // no-op deleteMessage below, that status line was never removed and
              // stayed stuck above every gift portrait.
              const sent = await bot.telegram.sendMessage(telegram_id, text)
              return { message_id: sent.message_id }
            },
            deleteMessage: async (messageId?: number) => {
              if (!messageId) return
              // Cosmetic cleanup — never let a failed delete break the gift.
              await bot.telegram
                .deleteMessage(telegram_id, messageId)
                .catch(() => {})
            },
            replyWithPhoto: async (photo: any, options?: any) => {
              if (typeof photo === 'object' && 'source' in photo) {
                await bot.telegram.sendPhoto(
                  telegram_id,
                  { source: photo.source },
                  options
                )
              } else {
                await bot.telegram.sendPhoto(telegram_id, photo, options)
              }
              return { message_id: 0 }
            },
            botInfo: { username: bot_name },
            telegram: bot.telegram,
          } as any

          try {
            const result = await generateSeeDream45({
              prompt,
              inputImageUrl: avatarUrl,
              telegram_id,
              username,
              is_ru,
              ctx: mockCtx,
              size: '2K', // SeeDream 4.5 supports 2K/4K (no 1K!)
              is_welcome_gift: true, // Skip payment!
              suppressUserErrors: true,
            })

            return { success: true, result }
          } catch (error) {
            logger.error('🎁 [Welcome Avatar] Generation failed', {
              telegram_id,
              error: error instanceof Error ? error.message : 'Unknown error',
            })
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            }
          }
        })

    // Step 4: Send welcome message
    // ⚠️ IMPORTANT: Get bot INSIDE step to avoid Inngest serialization issues
    await step.run('send-welcome', async () => {
      // Get fresh bot instance inside step
      const botData = getBotByNameAdapter(bot_name)
      if (!botData.bot) {
        logger.error('🎁 [Welcome Avatar] Bot not available in welcome step', {
          bot_name,
        })
        return
      }
      const bot = botData.bot

      if (generationResult.success) {
        const message = is_ru
          ? `🎁 *Добро пожаловать!*\n\nВот ваш первый нейро-портрет в образе *${selectedHero}* в подарок!\n\n✨ Попробуйте создать ещё больше образов в главном меню.`
          : `🎁 *Welcome!*\n\nHere's your first AI portrait as *${selectedHero}* as a gift!\n\n✨ Try creating more looks in the main menu.`

        await bot.telegram.sendMessage(telegram_id, message, {
          parse_mode: 'Markdown',
        })
      } else {
        // Fallback message if generation failed
        const fallbackMessage = is_ru
          ? '👋 Добро пожаловать! Не удалось создать нейро-портрет автоматически, но вы можете сделать это сами в главном меню!'
          : '👋 Welcome! Could not create AI portrait automatically, but you can do it yourself in the main menu!'

        await bot.telegram.sendMessage(telegram_id, fallbackMessage)
      }
    })

    logger.info('🎁 [Welcome Avatar] Completed', {
      telegram_id,
      success: generationResult.success,
      hero: selectedHero,
    })

    return {
      success: generationResult.success,
      telegram_id,
      hero: selectedHero,
    }
  }
)
