import bot from '@/core/bot'
import { getUserBalance } from '@/core/supabase'

import { VideoModel } from '@/interfaces/models.interface'
import { BalanceOperationResult } from '@/interfaces/payments.interface'

import { calculateFinalPrice } from './calculateFinalPrice'

type BalanceOperationProps = {
  videoModel: string
  telegram_id: number
  is_ru: boolean
}

export interface VideoModelConfig {
  name: VideoModel
  title: string
  description: string
}

export const VIDEO_MODELS: VideoModelConfig[] = [
  {
    name: 'minimax',
    title: 'Minimax',
    description: 'Оптимальное качество и скорость',
  },
  {
    name: 'haiper',
    title: 'Haiper',
    description: 'Высокое качество, длительность 6 секунд',
  },
  {
    name: 'ray',
    title: 'Ray',
    description: 'Реалистичная анимация',
  },
  {
    name: 'i2vgen-xl',
    title: 'I2VGen-XL',
    description: 'Продвинутая модель для детальной анимации',
  },
]

export const processBalanceVideoOperation = async ({
  videoModel,
  telegram_id,
  is_ru,
}: BalanceOperationProps): Promise<BalanceOperationResult> => {
  try {
    // Получаем текущий баланс
    const currentBalance = await getUserBalance(telegram_id)

    const availableModels: VideoModel[] = VIDEO_MODELS.map(model => model.name)

    // Проверка корректности модели
    if (!videoModel || !availableModels.includes(videoModel as VideoModel)) {
      await bot.telegram.sendMessage(
        telegram_id,
        is_ru
          ? 'Пожалуйста, выберите корректную модель'
          : 'Please choose a valid model'
      )
      return {
        newBalance: currentBalance,
        success: false,
        modePrice: 0,
        error: 'Invalid model',
      }
    }

    const model = videoModel as VideoModel
    const modePrice = calculateFinalPrice(model)

    // Проверка достаточности средств
    if (currentBalance < modePrice) {
      const message = is_ru
        ? 'Недостаточно средств на балансе. Пополните баланс вызвав команду /buy.'
        : 'Insufficient funds. Top up your balance by calling the /buy command.'
      await bot.telegram.sendMessage(telegram_id, message)
      return {
        newBalance: currentBalance,
        success: false,
        modePrice: 0,
        error: message,
      }
    }

    // Рассчитываем новый баланс
    const newBalance = currentBalance - modePrice

    return { newBalance, modePrice, success: true }
  } catch (error) {
    console.error('Error in processBalanceOperation:', error)
    throw error
  }
}
