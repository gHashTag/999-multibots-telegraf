import { Subscription } from '@/interfaces/supabase.interface'

import { Markup } from 'telegraf'
import { ReplyKeyboardMarkup } from 'telegraf/typings/core/types/typegram'
import { MyContext, Level } from '@/interfaces/telegram-bot.interface'

export const levels: Record<number, Level> = {
  // digital_avatar_body
  1: {
    title_ru: '🤖 Цифровое тело',
    title_en: '🤖 Digital Body',
  },
  // neuro_photo
  2: {
    title_ru: '📸 Нейрофото',
    title_en: '📸 NeuroPhoto',
  },
  // image_to_prompt
  3: {
    title_ru: '🔍 Промпт из фото',
    title_en: '🔍 Prompt from Photo',
  },
  // avatar
  4: {
    title_ru: '🧠 Мозг аватара',
    title_en: '🧠 Avatar Brain',
  },
  // chat_with_avatar
  5: {
    title_ru: '💭 Чат с аватаром',
    title_en: '💭 Chat with avatar',
  },
  // select_model
  6: {
    title_ru: '🤖 Выбор модели ИИ',
    title_en: '🤖 Choose AI Model',
  },
  // voice
  7: {
    title_ru: '🎤 Голос аватара',
    title_en: '🎤 Avatar Voice',
  },
  // text_to_speech
  8: {
    title_ru: '🎙️ Текст в голос',
    title_en: '🎙️ Text to Voice',
  },
  // image_to_video
  9: {
    title_ru: '🎥 Фото в видео',
    title_en: '🎥 Photo to Video',
  },
  // text_to_video
  10: {
    title_ru: '🎥 Видео из текста',
    title_en: '🎥 Text to Video',
  },
  // text_to_image
  11: {
    title_ru: '🖼️ Текст в фото',
    title_en: '🖼️ Text to Image',
  },
  // audio_to_text
  12: {
    title_ru: '🎙️ Аудио в текст',
    title_en: '🎙️ Audio to Text',
  },
  // lip_sync
  // 13: {
  //   title_ru: '🎤 Синхронизация губ',
  //   title_en: '🎤 Lip Sync',
  // },
  // 14: {
  //   title_ru: '🎥 Видео в URL',
  //   title_en: '🎥 Video in URL',
  // },
  // step0
  // paymentScene
  100: {
    title_ru: '💎 Пополнить баланс',
    title_en: '💎 Top up balance',
  },
  // balanceCommand
  101: {
    title_ru: '🤑 Баланс',
    title_en: '🤑 Balance',
  },
  // inviteCommand
  102: {
    title_ru: '👥 Пригласить друга',
    title_en: '👥 Invite a friend',
  },
  // helpCommand
  103: {
    title_ru: '❓ Помощь',
    title_en: '❓ Help',
  },
  104: {
    title_ru: '🛠 Техподдержка',
    title_en: '🛠 Tech Support',
  },
  105: {
    title_ru: '💫 Оформить подписку',
    title_en: '💫 Subscribe',
  },
  // languageCommand
  106: {
    title_ru: '🌐 Выбор языка',
    title_en: '🌐 Language',
  },
}

// Инвертированный объект для поиска уровня по названию
export const levelsInverse: { [key: string]: number } = Object.entries(
  levels
).reduce((acc, [level, { title_ru, title_en }]) => {
  acc[title_ru] = Number(level)
  acc[title_en] = Number(level)
  return acc
}, {} as { [key: string]: number })

export const mainMenuButton = {
  title_ru: '🏠 Главное меню',
  title_en: '🏠 Main menu',
}

// Функция для получения кнопок меню
export const mainMenu = (options: {
  isRu: boolean;
  inviteCount: number;
  subscription: Subscription;
  ctx: MyContext;
  level: number;
  additionalButtons?: Level[]; 
}) => {
  try {
    const { isRu, level, subscription, additionalButtons = [] } = options;
    const isSubscribed = subscription !== 'stars';
    const rows: string[][] = []

    // Создаем первую строку кнопок (базовая функциональность)
    const row1 = []
    row1.push(isRu ? levels[2].title_ru : levels[2].title_en) // Нейрофото

    // Если есть подписка или уровень >= 3
    if (isSubscribed || level >= 3) {
      row1.push(isRu ? levels[3].title_ru : levels[3].title_en) // Промпт из фото
    }
    rows.push(row1)

    // Вторая строка - с аватаром и чатом
    if (isSubscribed || level >= 5) {
      const row2 = []
      row2.push(isRu ? levels[4].title_ru : levels[4].title_en) // Мозг аватара
      row2.push(isRu ? levels[5].title_ru : levels[5].title_en) // Чат с аватаром
      rows.push(row2)
    }

    // Третья строка - с цифровым телом и моделью
    if (isSubscribed || level >= 7) {
      const row3 = []
      row3.push(isRu ? levels[1].title_ru : levels[1].title_en) // Цифровое тело
      row3.push(isRu ? levels[6].title_ru : levels[6].title_en) // Выбор модели
      rows.push(row3)
    }

    // Четвертая строка - голос аватара и текст в голос
    if (isSubscribed || level >= 9) {
      const row4 = []
      row4.push(isRu ? levels[7].title_ru : levels[7].title_en) // Голос аватара
      row4.push(isRu ? levels[8].title_ru : levels[8].title_en) // Текст в голос
      rows.push(row4)
    }

    // Пятая строка - фото в видео и видео из текста
    if (isSubscribed || level >= 11) {
      const row5 = []
      row5.push(isRu ? levels[9].title_ru : levels[9].title_en) // Фото в видео
      row5.push(isRu ? levels[10].title_ru : levels[10].title_en) // Видео из текста
      rows.push(row5)
    }

    // Шестая строка - текст в фото и аудио в текст
    if (isSubscribed || level >= 13) {
      const row6 = []
      row6.push(isRu ? levels[11].title_ru : levels[11].title_en) // Текст в фото
      row6.push(isRu ? levels[12].title_ru : levels[12].title_en) // Аудио в текст
      rows.push(row6)
    }

    // Всегда добавляем строку с балансом и пополнением
    const row7 = []
    row7.push(isRu ? levels[101].title_ru : levels[101].title_en) // Баланс
    row7.push(isRu ? levels[100].title_ru : levels[100].title_en) // Пополнить баланс
    rows.push(row7)

    // Добавляем кнопку выбора языка
    const row8 = []
    row8.push(isRu ? levels[106].title_ru : levels[106].title_en) // Язык
    rows.push(row8)

    return Markup.keyboard(rows).resize()
  } catch (error) {
    console.error('Error in mainMenu:', error)
    // Возвращаем базовую клавиатуру в случае ошибки
    return Markup.keyboard([[levels[2].title_ru, levels[100].title_ru]]).resize()
  }
}
