import { isDev } from './index'

// Конфигурация для разных ботов в режиме разработки
export interface DebugConfig {
  userId: number
  botName: string
  description: string
}

export const DEBUG_BOTS: DebugConfig[] = [
  {
    userId: 144022504,
    botName: 'neuro_blogger_bot',
    description: 'Нейро Блоггер',
  },
  {
    userId: 352374518,
    botName: 'MetaMuse_Manifest_bot',
    description: 'MetaMuse Manifest - основной бот',
  },
  {
    userId: 2086031075,
    botName: 'NeuroLenaAssistant_bot',
    description: 'Нейро Лена',
  },
  {
    userId: 144022504,
    botName: 'ai_koshey_bot',
    description: 'AI Кощей',
  },
  {
    userId: 435572800,
    botName: 'Gaia_Kamskaia_bot',
    description: 'Gaia Kamskaia',
  },
  {
    userId: 6419070693,
    botName: 'LeeSolarbot',
    description: 'Lee Solar',
  },
  {
    userId: 1254048880,
    botName: 'ZavaraBot',
    description: 'Zavara',
  },
]

// Индекс текущего бота для дебага (можно быстро менять здесь)
const DEBUG_BOT_INDEX = 0

// Функция для получения текущей конфигурации бота
export const getCurrentDebugConfig = (): DebugConfig => {
  if (!isDev) {
    throw new Error('Debug config should only be used in development mode')
  }
  return DEBUG_BOTS[DEBUG_BOT_INDEX]
}
