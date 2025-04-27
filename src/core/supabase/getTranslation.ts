import { MyContext } from '@/interfaces'
import { supabase } from '@/core/supabase'
import { getBotNameByToken, DEFAULT_BOT_NAME } from '@/core/bot'
import logger from '@/utils/logger'
import { isRussian } from '@/helpers/language'
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
    callback_data: 'neurophoto',
    subscription: SubscriptionType.NEUROPHOTO,
  },
  {
    row: 2,
    text: '📚 НейроБаза',
    stars_price: 1303,
    en_price: 35,
    ru_price: 2999,
    description: 'Опис тарифу НейроБаза...',
    subscription: SubscriptionType.NEUROBASE,
    callback_data: 'neurobase',
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
    text: '📚 NeuroBase',
    en_price: 35,
    ru_price: 2999,
    description: 'Description of the NeuroBase tariff...',
    stars_price: 1303,
    callback_data: 'neurobase',
    subscription: SubscriptionType.NEUROBASE,
  },
]

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
  const { language_code } = ctx.from
  const token = ctx.telegram.token

  const botName = bot_name ? bot_name : getBotNameByToken(token).bot_name

  const fetchTranslation = async (name: string) => {
    return await supabase
      .from('translations')
      .select('translation, url, buttons')
      .eq('language_code', language_code)
      .eq('key', key)
      .eq('bot_name', name)
      .single()
  }
  try {
    let { data, error } = await fetchTranslation(botName)

    if (error) {
      logger.warn({
        message: `Ошибка получения перевода/кнопок с текущим токеном для ключа "${key}"`,
        bot_name: botName,
        language_code,
        key,
        error: error.message,
      })

      const defaultBot = DEFAULT_BOT_NAME
      ;({ data, error } = await fetchTranslation(defaultBot))
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

    return {
      translation: data?.translation || '',
      url: data?.url || '',
      buttons: buttons, // Возвращаем распарсенные кнопки или пустой массив
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e)
    logger.error({
      message: `Критическая ошибка при получении перевода/кнопок для ключа "${key}"`,
      error: errorMessage,
      bot_name: botName,
      language_code,
      key,
    })
    return {
      translation: '',
      url: '',
      buttons: [],
    }
  }
}
