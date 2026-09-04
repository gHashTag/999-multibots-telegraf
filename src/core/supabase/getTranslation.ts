import { MyContext } from '@/interfaces'
import { isRussianLanguageCode } from '@/helpers/isRussianLanguageCode'
import { supabase } from '@/core/supabase'
import { getBotNameByToken, DEFAULT_BOT_NAME } from '@/core/bot'
import logger from '@/utils/logger'
import { getUserLanguageFromState } from '@/helpers/centralizedLanguage'
import { TranslationButton } from '@/interfaces/supabase.interface'
import { SubscriptionType } from '@/interfaces/subscription.interface'

// Интерфейс для структуры кнопки из базы данных
const DEFAULT_BUTTONS_RU: TranslationButton[] = [
  {
    row: 1,
    text: 'Basic — 50 генераций/мес, AI чат',
    stars_price: 130,
    en_price: 4,
    ru_price: 299,
    description: '50 генераций в месяц, AI чат',
    callback_data: 'basic',
    subscription: SubscriptionType.BASIC,
  },
  {
    row: 2,
    text: 'Pro — безлимит, все инструменты',
    stars_price: 304,
    en_price: 9,
    ru_price: 699,
    description: 'Безлимитные генерации, все инструменты',
    callback_data: 'pro',
    subscription: SubscriptionType.PRO,
  },
  {
    row: 3,
    text: 'Studio — всё + API + маркетплейс',
    stars_price: 869,
    en_price: 25,
    ru_price: 1999,
    description: 'Всё из Pro + API доступ + маркетплейс',
    callback_data: 'studio',
    subscription: SubscriptionType.STUDIO,
  },
]
const DEFAULT_BUTTONS_EN: TranslationButton[] = [
  {
    row: 1,
    text: 'Basic — 50 gens/mo, AI chat',
    en_price: 4,
    ru_price: 299,
    description: '50 generations per month, AI chat',
    stars_price: 130,
    callback_data: 'basic',
    subscription: SubscriptionType.BASIC,
  },
  {
    row: 2,
    text: 'Pro — unlimited, all tools',
    en_price: 9,
    ru_price: 699,
    description: 'Unlimited generations, all tools',
    stars_price: 304,
    callback_data: 'pro',
    subscription: SubscriptionType.PRO,
  },
  {
    row: 3,
    text: 'Studio — everything + API + marketplace',
    en_price: 25,
    ru_price: 1999,
    description: 'Everything from Pro + API access + marketplace',
    stars_price: 869,
    callback_data: 'studio',
    subscription: SubscriptionType.STUDIO,
  },
]

// Константа для общих переводов
const COMMON_BOT_NAME = 'common'

// Обновленный тип возвращаемого значения
export async function getTranslation({
  key,
  ctx,
  bot_name,
}: {
  key: string
  ctx: MyContext
  bot_name: string
}): Promise<{
  translation: string
  url: string
  buttons: TranslationButton[]
}> {
  // Добавляем buttons
  console.log('CASE: getTranslation:', key)
  if (!ctx.from) {
    console.error('❌ Telegram ID не найден')
    return {
      translation: '',
      url: '',
      buttons: [],
    }
  }

  // ✅ ENHANCED: Используем централизованную систему с fallback
  let userLanguage: string
  try {
    userLanguage = getUserLanguageFromState(ctx)
  } catch (error) {
    // Fallback to Telegram language if state fails
    userLanguage = ctx.from?.language_code?.startsWith('ru') ? 'ru' : 'en'
    logger.warn(
      '[getTranslation] State language failed, using Telegram fallback',
      {
        telegramId: ctx.from?.id,
        fallbackLanguage: userLanguage,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    )
  }
  const language_code = userLanguage // 'ru' | 'en'

  // ✅ ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ЯЗЫКА В getTranslation
  const telegramId = ctx.from?.id?.toString()
  logger.info(`[getTranslation] 🌍 LANGUAGE CHECK:`, {
    telegramId,
    key,
    userLanguage,
    language_code,
    telegramLanguage: ctx.from?.language_code,
    source: 'getUserLanguage_DB_ONLY',
  })

  const token = ctx.telegram.token

  const botName = bot_name ? bot_name : getBotNameByToken(token).bot_name

  const fetchTranslation = async (name: string) => {
    const { data, error } = await supabase
      .from('translations')
      .select('translation, url, buttons')
      .eq('language_code', language_code)
      .eq('key', key)
      .eq('bot_name', name)
      .limit(1)

    // Convert array result to single object format, or null if no results
    const singleData = data && data.length > 0 ? data[0] : null

    return {
      data: singleData,
      error:
        !singleData && !error ? { message: 'No translation found' } : error,
    }
  }
  try {
    let { data, error } = await fetchTranslation(botName)

    if (error) {
      logger.warn(`Translation not found for key "${key}" with current bot`, {
        bot_name: botName,
        language_code,
        key,
        error: error.message,
        telegram_id: telegramId,
      })

      // Try with DEFAULT_BOT_NAME fallback
      const defaultBot = DEFAULT_BOT_NAME
      ;({ data, error } = await fetchTranslation(defaultBot))

      // If still not found, try common translations
      if (error) {
        logger.warn(
          `Translation not found with DEFAULT_BOT_NAME for key "${key}"`,
          {
            bot_name: defaultBot,
            language_code,
            key,
            error: error.message,
            telegram_id: telegramId,
          }
        )

        // Try common bot translations
        ;({ data, error } = await fetchTranslation(COMMON_BOT_NAME))

        if (!error) {
          logger.info(`Using common translation for key "${key}"`, {
            bot_name: COMMON_BOT_NAME,
            language_code,
            key,
            telegram_id: telegramId,
          })
        } else {
          // Ultimate fallback - try opposite language
          const fallbackLanguage = isRussianLanguageCode(language_code)
            ? 'en'
            : 'ru'
          const fallbackResult = await supabase
            .from('translations')
            .select('translation, url, buttons')
            .eq('language_code', fallbackLanguage)
            .eq('key', key)
            .eq('bot_name', COMMON_BOT_NAME)
            .limit(1)

          if (fallbackResult.data && fallbackResult.data.length > 0) {
            data = fallbackResult.data[0]
            error = null
            logger.info(
              `Using fallback language translation for key "${key}"`,
              {
                original_language: language_code,
                fallback_language: fallbackLanguage,
                key,
                telegram_id: telegramId,
              }
            )
          }
        }
      }
    }

    // Парсим buttons_config, если он есть
    let buttons: TranslationButton[] = []
    if (data?.buttons) {
      try {
        // Проверяем, является ли buttons_config уже объектом/массивом (может быть из-за настроек Supabase)
        if (typeof data.buttons === 'object') {
          buttons = data.buttons as TranslationButton[]
        } else if (typeof data.buttons === 'string') {
          // Пытаемся распарсить строку JSON
          buttons = JSON.parse(data.buttons)
        } else {
          logger.warn(
            `Неожиданный тип для buttons_config: ${typeof data.buttons}`
          )
        }
        // Дополнительная проверка, что buttons действительно массив
        if (!Array.isArray(buttons)) {
          logger.warn(
            'Распарсенный buttons_config не является массивом, используем пустой массив.'
          )
          buttons = []
        }
      } catch (parseError) {
        logger.error(`Ошибка парсинга JSON для buttons ключа "${key}"`, {
          error:
            parseError instanceof Error
              ? parseError.message
              : String(parseError),
          buttons_raw: data.buttons,
          bot_name: botName,
          language_code,
          key,
        })
        buttons = [] // Возвращаем пустой массив в случае ошибки парсинга
      }
    } else {
      logger.warn(`Поле buttons отсутствует или пусто для ключа "${key}"`)
    }

    // ✅ ENHANCED: Default buttons with better error handling
    const keysNeedingDefaultButtons = ['digitalAvatar', 'subscriptionScene']

    if (keysNeedingDefaultButtons.includes(key) && buttons.length === 0) {
      buttons = isRussianLanguageCode(language_code)
        ? DEFAULT_BUTTONS_RU
        : DEFAULT_BUTTONS_EN
      logger.info(`[getTranslation] Applied default buttons for key "${key}"`, {
        telegramId,
        key,
        language_code,
        buttonsCount: buttons.length,
        buttonsApplied: 'DEFAULT_FALLBACK',
      })
    }

    // ✅ MENU: Generate all menu buttons from levels if buttons are missing
    if (key === 'menu' && buttons.length === 0) {
      try {
        // Dynamically import to avoid circular dependency
        const { getAllButtonTexts } = await import('@/navigation')
        const { SubscriptionType } = await import(
          '@/interfaces/subscription.interface'
        )

        logger.info(
          `[getTranslation] Generating menu buttons from levels for "${key}"`,
          {
            telegramId,
            language_code,
            totalLevels: getAllButtonTexts().length,
          }
        )

        buttons = getAllButtonTexts()
          .map((item, index) => {
            // Create TranslationButton from Level
            const subscriptionMap: Record<number, SubscriptionType> = {
              1: SubscriptionType.BASIC,
              2: SubscriptionType.BASIC,
              9: SubscriptionType.PRO,
              10: SubscriptionType.PRO,
            }

            // 🐛 DEBUG: Log first 3 buttons to see what's happening
            if (index < 3) {
              logger.info(
                `[getTranslation DEBUG] Button ${index} BEFORE selection:`,
                {
                  language_code,
                  language_code_type: typeof language_code,
                  language_code_length: language_code?.length,
                  language_code_charCodes: language_code
                    ?.split('')
                    .map((c: string) => c.charCodeAt(0)),
                  title_ru: item.ru,
                  title_en: item.en,
                  comparison_result: isRussianLanguageCode(language_code),
                  strict_equals_ru: isRussianLanguageCode(language_code),
                  loose_equals_ru: isRussianLanguageCode(language_code),
                }
              )
            }

            const textValue = isRussianLanguageCode(language_code)
              ? item.ru
              : item.en

            // 🐛 DEBUG: Log selected value
            if (index < 3) {
              logger.info(
                `[getTranslation DEBUG] Button ${index} AFTER selection:`,
                {
                  selected_text: textValue,
                  selected_from: isRussianLanguageCode(language_code)
                    ? 'title_ru'
                    : 'title_en',
                }
              )
            }

            return {
              row: index > 100 ? 2 : 1, // Admin buttons on second row
              text: textValue,
              callback_data: `level_${index}`, // Required by TranslationButton interface
              subscription: subscriptionMap[index] || SubscriptionType.BASIC,
              stars_price: 476,
              en_price: 15,
              ru_price: 1110,
              description: 'Menu button from levels',
            }
          })
          .filter(btn => btn.text) // Remove empty buttons

        logger.info(
          `[getTranslation] Generated ${buttons.length} menu buttons from levels for key "${key}"`,
          {
            telegramId,
            key,
            language_code,
            buttonsCount: buttons.length,
            buttonsApplied: 'GENERATED_FROM_LEVELS',
          }
        )
      } catch (error) {
        logger.error(
          `[getTranslation] Failed to generate menu buttons from levels`,
          {
            telegramId,
            key,
            error: error instanceof Error ? error.message : String(error),
          }
        )
        // Fallback to minimal default
        buttons = isRussianLanguageCode(language_code)
          ? DEFAULT_BUTTONS_RU
          : DEFAULT_BUTTONS_EN
      }
    }

    // ✅ FINAL FALLBACK: If still no translation, provide minimal default
    if (!data?.translation && !error) {
      const defaultTranslations: Record<string, Record<string, string>> = {
        digitalAvatar: {
          ru: '📸 НейроФото - создание уникальных аватаров',
          en: '📸 NeuroPhoto - create unique avatars',
        },
        menu: {
          ru: '🏠 Главное меню',
          en: '🏠 Main menu',
        },
        subscriptionScene: {
          ru: '💳 Подписки и тарифы',
          en: '💳 Subscriptions and plans',
        },
      }

      const defaultTranslation = defaultTranslations[key]?.[language_code]
      if (defaultTranslation) {
        data = {
          translation: defaultTranslation,
          url: '',
          buttons: null,
        }
        logger.info('[getTranslation] Applied emergency default translation', {
          telegramId,
          key,
          language_code,
          source: 'EMERGENCY_DEFAULT',
        })
      }
    }

    // ✅ ФИНАЛЬНОЕ ЛОГИРОВАНИЕ РЕЗУЛЬТАТА
    const result = {
      translation: data?.translation || '',
      url: data?.url || '',
      buttons: buttons, // Возвращаем распарсенные кнопки или пустой массив
    }

    logger.info(`[getTranslation] 🏁 RESULT:`, {
      telegramId,
      key,
      language_code,
      translationFound: !!data?.translation,
      translationLength: result.translation.length,
      buttonsCount: result.buttons.length,
      urlExists: !!result.url,
    })

    return result
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e)
    logger.error(`Critical error getting translation for key "${key}"`, {
      error: errorMessage,
      bot_name: botName,
      language_code,
      key,
      telegramId,
      stack: e instanceof Error ? e.stack : undefined,
    })

    // ✅ EMERGENCY FALLBACK with basic translations
    const emergencyTranslations: Record<string, Record<string, string>> = {
      digitalAvatar: {
        ru: '📸 НейроФото',
        en: '📸 NeuroPhoto',
      },
      menu: {
        ru: '🏠 Меню',
        en: '🏠 Menu',
      },
      start: {
        ru: '🚀 Добро пожаловать!',
        en: '🚀 Welcome!',
      },
    }

    const emergencyTranslation =
      emergencyTranslations[key]?.[language_code] ||
      emergencyTranslations[key]?.['en'] ||
      `⚠️ Translation unavailable (${key})`

    const emergencyButtons =
      key === 'digitalAvatar' || key === 'subscriptionScene' || key === 'menu'
        ? isRussianLanguageCode(language_code)
          ? DEFAULT_BUTTONS_RU
          : DEFAULT_BUTTONS_EN
        : []

    logger.info(`[getTranslation] 🆘 EMERGENCY FALLBACK APPLIED:`, {
      telegramId,
      key,
      language_code,
      translation: emergencyTranslation,
      buttonsCount: emergencyButtons.length,
      error: errorMessage,
      source: 'EMERGENCY_HARDCODED',
    })

    return {
      translation: emergencyTranslation,
      url: '',
      buttons: emergencyButtons,
    }
  }
}
