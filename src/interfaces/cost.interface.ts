import { VideoModel } from '@/interfaces'
import { ModeEnum } from '../price/helpers/modelsCost'


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

// Дополнительные режимы, не входящие в ModeEnum
export type AdditionalMode =
  | 'start_learning'
  | 'top_up_balance'
  | 'balance'
  | ModeEnum.MenuScene
  | 'improve_prompt'
  | 'change_size'
  | 'getRuBill'
  | 'getEmailWizard'
  | 'price'
  | 'video_in_url'
  | 'tech'
  | 'stats'
  | 'invite'
  | 'help'

export type Mode = ModeEnum | string

export type ModeCosts = Required<Record<Mode, number>>
