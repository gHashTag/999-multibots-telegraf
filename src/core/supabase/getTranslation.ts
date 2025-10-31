import { MyContext } from '@/interfaces'
import { supabase } from '@/core/supabase'
import { getBotNameByToken, DEFAULT_BOT_NAME } from '@/core/bot'
import logger from '@/utils/enhancedLogger'
import { getUserLanguageFromState } from '@/helpers/centralizedLanguage'
import { TranslationButton } from '@/interfaces/supabase.interface'
import { SubscriptionType } from '@/interfaces/subscription.interface'

// Интерфейс для структуры кнопки из базы данных
const DEFAULT_BUTTONS_RU: TranslationButton[] = [
  {
    row: 1,
    text: '📸 НейроФото',
    stars_price: 476,
    en_price: 15,
    ru_price: 1110,
    description: 'Опис тарифу НейроФото...',
    callback_data: 'neurophoto', // SubscriptionType.NEUROPHOTO.toLowerCase()
    subscription: SubscriptionType.NEUROPHOTO,
  },
  {
    row: 2,
    text: '📚 НейроВидео',
    stars_price: 1303,
    en_price: 35,
    ru_price: 2999,
    description: 'Опис тарифу НейроВидео...',
    subscription: SubscriptionType.NEUROVIDEO,
    callback_data: 'neurovideo', // SubscriptionType.NEUROVIDEO.toLowerCase()
  },
]
const DEFAULT_BUTTONS_EN: TranslationButton[] = [
  {
    row: 1,
    text: '📸 NeuroPhoto',
    en_price: 15,
    ru_price: 1110,
    description: 'Description of the NeuroPhoto tariff...',
    stars_price: 476,
    callback_data: 'neurophoto',
    subscription: SubscriptionType.NEUROPHOTO,
  },
  {
    row: 2,
    text: '📚 NeuroVideo',
    en_price: 35,
    ru_price: 2999,
    description: 'Description of the NeuroVideo tariff...',
    stars_price: 1303,
    callback_data: 'neurovideo',
    subscription: SubscriptionType.NEUROVIDEO,
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
  logger.debug('CASE: getTranslation:', key)
  if (!ctx.from) {
    logger.error('❌ Telegram ID не найден')
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
    logger.warn('[getTranslation] State language failed, using Telegram fallback', {
      telegramId: ctx.from?.id,
      fallbackLanguage: userLanguage,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
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
      error: !singleData && !error ? { message: 'No translation found' } : error
    }
  }
  try {
    let { data, error } = await fetchTranslation(botName)

    if (error) {
      logger.warn({
        message: `Translation not found for key "${key}" with current bot`,
        bot_name: botName,
        language_code,
        key,
        error: error.message,
        telegram_id: telegramId
      })

      // Try with DEFAULT_BOT_NAME fallback
      const defaultBot = DEFAULT_BOT_NAME
      ;({ data, error } = await fetchTranslation(defaultBot))

      // If still not found, try common translations
      if (error) {
        logger.warn({
          message: `Translation not found with DEFAULT_BOT_NAME for key "${key}"`,
          bot_name: defaultBot,
          language_code,
          key,
          error: error.message,
          telegram_id: telegramId
        })

        // Try common bot translations
        ;({ data, error } = await fetchTranslation(COMMON_BOT_NAME))

        if (!error) {
          logger.info({
            message: `Using common translation for key "${key}"`,
            bot_name: COMMON_BOT_NAME,
            language_code,
            key,
            telegram_id: telegramId
          })
        } else {
          // Ultimate fallback - try opposite language
          const fallbackLanguage = language_code === 'ru' ? 'en' : 'ru'
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
            logger.info({
              message: `Using fallback language translation for key "${key}"`,
              original_language: language_code,
              fallback_language: fallbackLanguage,
              key,
              telegram_id: telegramId
            })
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
        logger.error({
          message: `Ошибка парсинга JSON для buttons ключа "${key}"`,
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
    const keysNeedingDefaultButtons = ['digitalAvatar', 'subscriptionScene', 'menu']

    if (keysNeedingDefaultButtons.includes(key) && buttons.length === 0) {
      buttons = language_code === 'ru' ? DEFAULT_BUTTONS_RU : DEFAULT_BUTTONS_EN
      logger.info(
        `[getTranslation] Applied default buttons for key "${key}"`,
        {
          telegramId,
          key,
          language_code,
          buttonsCount: buttons.length,
          buttonsApplied: 'DEFAULT_FALLBACK'
        }
      )
    }

    // ✅ FINAL FALLBACK: If still no translation, provide minimal default
    if (!data?.translation && !error) {
      const defaultTranslations: Record<string, Record<string, string>> = {
        'digitalAvatar': {
          'ru': '📸 НейроФото - создание уникальных аватаров',
          'en': '📸 NeuroPhoto - create unique avatars'
        },
        'menu': {
          'ru': '🏠 Главное меню',
          'en': '🏠 Main menu'
        },
        'subscriptionScene': {
          'ru': '💳 Подписки и тарифы',
          'en': '💳 Subscriptions and plans'
        }
      }

      const defaultTranslation = defaultTranslations[key]?.[language_code]
      if (defaultTranslation) {
        data = {
          translation: defaultTranslation,
          url: '',
          buttons: null
        }
        logger.info('[getTranslation] Applied emergency default translation', {
          telegramId,
          key,
          language_code,
          source: 'EMERGENCY_DEFAULT'
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
    logger.error({
      message: `Critical error getting translation for key "${key}"`,
      error: errorMessage,
      bot_name: botName,
      language_code,
      key,
      telegramId,
      stack: e instanceof Error ? e.stack : undefined
    })

    // ✅ EMERGENCY FALLBACK with basic translations
    const emergencyTranslations: Record<string, Record<string, string>> = {
      'digitalAvatar': {
        'ru': '📸 НейроФото',
        'en': '📸 NeuroPhoto'
      },
      'menu': {
        'ru': '🏠 Меню',
        'en': '🏠 Menu'
      },
      'start': {
        'ru': '🚀 Добро пожаловать!',
        'en': '🚀 Welcome!'
      }
    }

    const emergencyTranslation = emergencyTranslations[key]?.[language_code] ||
                                emergencyTranslations[key]?.['en'] ||
                                `⚠️ Translation unavailable (${key})`

    const emergencyButtons = (key === 'digitalAvatar' || key === 'subscriptionScene' || key === 'menu')
      ? (language_code === 'ru' ? DEFAULT_BUTTONS_RU : DEFAULT_BUTTONS_EN)
      : []

    logger.info(`[getTranslation] 🆘 EMERGENCY FALLBACK APPLIED:`, {
      telegramId,
      key,
      language_code,
      translation: emergencyTranslation,
      buttonsCount: emergencyButtons.length,
      error: errorMessage,
      source: 'EMERGENCY_HARDCODED'
    })

    return {
      translation: emergencyTranslation,
      url: '',
      buttons: emergencyButtons,
    }
  }
}
