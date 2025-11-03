import { logger } from '@/utils/logger'

/**
 * Получает приветственное сообщение для конкретного бота
 * Сначала пытается получить из Supabase, потом использует дефолтное сообщение
 */
export async function getBotWelcomeMessage(
  botName: string,
  isRu: boolean = true
): Promise<string> {
  try {
    // TODO: В будущем получить из Supabase таблицы bot_messages или подобной
    // const { data } = await supabase
    //   .from('bot_messages')
    //   .select('welcome_message')
    //   .eq('bot_name', botName)
    //   .single()

    // Пока используем статические сообщения на основе bot_name
    const welcomeMessages: Record<string, { ru: string; en: string }> = {
      neuro_blogger_bot: {
        ru: '🤖 Нейроблоггер - ваш AI-ассистент для создания контента!',
        en: '🤖 NeuroBlogger - your AI content creation assistant!',
      },
      MetaMuse_Manifest_bot: {
        ru: '✨ MetaMuse - превращаем ваши мысли в визуальные образы!',
        en: '✨ MetaMuse - turn your thoughts into visual imagery!',
      },
      ZavaraBot: {
        ru: '🎯 ZavaraBot - ваш персональный AI-помощник!',
        en: '🎯 ZavaraBot - your personal AI assistant!',
      },
      LeeSolarbot: {
        ru: '☀️ LeeSolarbot - энергия солнца в каждом решении!',
        en: '☀️ LeeSolarbot - solar energy in every decision!',
      },
      NeuroLenaAssistant_bot: {
        ru: '🧠 NeuroLena - нейроассистент для интеллектуальных задач!',
        en: '🧠 NeuroLena - neuro assistant for intelligent tasks!',
      },
      NeurostylistShtogrina_bot: {
        ru: '👗 Neurostylist - стилист с искусственным интеллектом!',
        en: '👗 Neurostylist - AI-powered stylist!',
      },
      Gaia_Kamskaia_bot: {
        ru: '🌿 Gaia - природная гармония в каждом ответе!',
        en: '🌿 Gaia - natural harmony in every response!',
      },
      Kaya_easy_art_bot: {
        ru: '🎨 Kaya - легкое искусство через AI!',
        en: '🎨 Kaya - easy art through AI!',
      },
      AI_STARS_bot: {
        ru: '⭐ AI STARS - звездный AI для ваших задач!',
        en: '⭐ AI STARS - stellar AI for your tasks!',
      },
      HaimGroupMedia_bot: {
        ru: '🎬 HaimGroupMedia - медиа-решения нового поколения!',
        en: '🎬 HaimGroupMedia - next-generation media solutions!',
      },
    }

    const message = welcomeMessages[botName] || {
      ru: '🤖 Добро пожаловать!',
      en: '🤖 Welcome!',
    }

    return isRu ? message.ru : message.en
  } catch (error) {
    logger.error('❌ Error getting bot welcome message:', {
      botName,
      error,
    })

    // Возвращаем дефолтное сообщение при ошибке
    return isRu ? '🤖 Добро пожаловать!' : '🤖 Welcome!'
  }
}

/**
 * Получает описание бота для меню
 */
export function getBotDescription(botName: string, isRu: boolean = true): string {
  const descriptions: Record<string, { ru: string; en: string }> = {
    neuro_blogger_bot: {
      ru: '🤖 Нейроблоггер',
      en: '🤖 NeuroBlogger',
    },
    MetaMuse_Manifest_bot: {
      ru: '✨ MetaMuse',
      en: '✨ MetaMuse',
    },
    ZavaraBot: {
      ru: '🎯 ZavaraBot',
      en: '🎯 ZavaraBot',
    },
    LeeSolarbot: {
      ru: '☀️ LeeSolarbot',
      en: '☀️ LeeSolarbot',
    },
    NeuroLenaAssistant_bot: {
      ru: '🧠 NeuroLena',
      en: '🧠 NeuroLena',
    },
    NeurostylistShtogrina_bot: {
      ru: '👗 Neurostylist',
      en: '👗 Neurostylist',
    },
    Gaia_Kamskaia_bot: {
      ru: '🌿 Gaia',
      en: '🌿 Gaia',
    },
    Kaya_easy_art_bot: {
      ru: '🎨 Kaya',
      en: '🎨 Kaya',
    },
    AI_STARS_bot: {
      ru: '⭐ AI STARS',
      en: '⭐ AI STARS',
    },
    HaimGroupMedia_bot: {
      ru: '🎬 HaimGroupMedia',
      en: '🎬 HaimGroupMedia',
    },
  }

  const description = descriptions[botName] || {
    ru: '🤖 AI Bot',
    en: '🤖 AI Bot',
  }

  return isRu ? description.ru : description.en
}
