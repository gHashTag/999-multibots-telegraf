import { ReplyKeyboardMarkup } from 'telegraf/typings/core/types/typegram'
import { checkFullAccess } from '../handlers/checkFullAccess'
import { Markup } from 'telegraf'
import { MyContext, SubscriptionType } from '@/interfaces'

interface Level {
  ru: string
  en: string
}

// Уровни доступные пользователям
export const LEVELS: Record<number, Level> = {
  1: {
    ru: '1️⃣ Первый уровень - Фотогенерация',
    en: '1️⃣ Level 1 - Photo Generation',
  },
  2: {
    ru: '2️⃣ Второй уровень - Нейростили',
    en: '2️⃣ Level 2 - Neurostyles',
  },
  3: {
    ru: '3️⃣ Третий уровень - Художественная галерея',
    en: '3️⃣ Level 3 - Art Gallery',
  },
  4: {
    ru: '4️⃣ Четвертый уровень - Видеогенерация',
    en: '4️⃣ Level 4 - Video Generation',
  },
  5: {
    ru: '5️⃣ Пятый уровень - NeuroBlogger',
    en: '5️⃣ Level 5 - NeuroBlogger',
  },
  6: {
    ru: '6️⃣ Шестой уровень - Аватар',
    en: '6️⃣ Level 6 - Avatar',
  },
  7: {
    ru: '7️⃣ Седьмой уровень - ChatGPT 4o',
    en: '7️⃣ Level 7 - ChatGPT 4o',
  },
  8: {
    ru: '8️⃣ Восьмой уровень - Claude 3',
    en: '8️⃣ Level 8 - Claude 3',
  },
  9: {
    ru: '9️⃣ Девятый уровень - LLM-микс',
    en: '9️⃣ Level 9 - LLM-mix',
  },
  10: {
    ru: '🔟 Десятый уровень - Личные ассистенты',
    en: '🔟 Level 10 - Personal assistants',
  },
}

// Текстовые кнопки меню с переводами
export const levels = {
  ...LEVELS,
  // Существующие специальные кнопки
  100: {
    title_ru: '💎 Пополнить баланс',
    title_en: '💎 Top up balance',
  },
  101: {
    title_ru: '🤑 Баланс',
    title_en: '🤑 Balance',
  },
  103: {
    title_ru: '💬 Техподдержка',
    title_en: '💬 Support',
  },
  105: {
    title_ru: '💫 Оформить подписку',
    title_en: '💫 Subscribe',
  },
  // Новая кнопка для цен
  106: {
    title_ru: '💰 Цены',
    title_en: '💰 Prices',
  },
}

const adminIds = process.env.ADMIN_IDS?.split(',') || []

// Определение типа для параметров
interface MainMenuParams {
  isRu: boolean
  inviteCount: number
  subscription: SubscriptionType | null
  level: number
  ctx: MyContext
}

/**
 * Создает клавиатуру главного меню в зависимости от параметров пользователя
 */
export const mainMenu = async ({
  isRu,
  inviteCount,
  subscription,
  level,
  ctx,
}: MainMenuParams): Promise<Markup.Markup<ReplyKeyboardMarkup>> => {
  console.log('💻 CASE: mainMenu')
  let hasFullAccess = checkFullAccess(subscription)

  // Доступные уровни в зависимости от подписки
  const availableLevels: Record<string, number[]> = {
    [SubscriptionType.NEUROPHOTO]: [1, 2, 3],
    [SubscriptionType.NEUROBASE]: [1, 2, 3, 4],
    [SubscriptionType.NEUROTESTER]: [1, 2, 3, 4, 5],
    [SubscriptionType.NEUROBLOGGER]: [1, 2, 3, 4, 5],
    [SubscriptionType.STARS]: [1]
  }

  // Получаем доступные уровни
  const levelsArray =
    subscription && subscription in availableLevels
      ? availableLevels[subscription]
      : [1]

  // Фильтруем отключенные уровни если они есть
  const buttonsText = Object.entries(LEVELS)
    .filter(([key]) => levelsArray.includes(parseInt(key)))
    .map(([, value]) => (isRu ? value.ru : value.en))

  // Добавляем кнопки в зависимости от языка
  const profileText = isRu ? '👤 Профиль' : '👤 Profile'
  const balanceText = isRu ? levels[101].title_ru : levels[101].title_en
  const supportText = isRu ? levels[103].title_ru : levels[103].title_en
  const questText = isRu ? '🎮 Квест' : '🎮 Quest'
  const subscribeText = isRu ? levels[105].title_ru : levels[105].title_en
  const chatText = isRu ? '🗣 Общение с аватаром' : '🗣 Chat with Avatar'
  const pricesText = isRu ? levels[106].title_ru : levels[106].title_en

  // Формируем строки клавиатуры (по 2 кнопки в ряд, кроме последней строки)
  const keyboard: string[][] = []
  
  // Если есть права на создание аватара то добавляем кнопку для него
  if (subscription && 
    [SubscriptionType.NEUROBASE, SubscriptionType.NEUROTESTER, SubscriptionType.NEUROBLOGGER].includes(subscription)) {
    keyboard.push([chatText])
  }

  // Добавляем уровни по два в ряд
  for (let i = 0; i < buttonsText.length; i += 2) {
    const row = []
    row.push(buttonsText[i])
    if (i + 1 < buttonsText.length) {
      row.push(buttonsText[i + 1])
    }
    keyboard.push(row)
  }

  // Добавляем дополнительные кнопки в меню
  keyboard.push([profileText, balanceText])
  keyboard.push([questText, supportText])
  keyboard.push([subscribeText, pricesText]) // Добавляем кнопку цен рядом с подпиской

  const userId = ctx.from?.id?.toString()

  if (userId && adminIds.includes(userId)) {
    // Изменяем добавление кнопки для админа
    keyboard.push([
      isRu ? '🤖 Цифровое тело 2' : '🤖 Digital Body 2',
      isRu ? '📸 Нейрофото 2' : '📸 NeuroPhoto 2'
    ])
  }

  return Markup.keyboard(keyboard).resize()
}
