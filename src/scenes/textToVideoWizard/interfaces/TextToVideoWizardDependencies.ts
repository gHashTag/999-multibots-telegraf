import { MyContext } from '@/interfaces'
import { VideoModelConfigKey } from '../index'

export interface TextToVideoWizardDependencies {
  calculateFinalPrice: (modelKey: VideoModelConfigKey) => number | null
  getUserBalance: (telegramId: string, botName: string) => Promise<number>
  generateTextToVideo: (
    prompt: string,
    telegramId: string,
    username: string,
    isRu: boolean,
    botName: string
  ) => Promise<void>
  sendGenericErrorMessage: (ctx: MyContext, isRu: boolean) => Promise<void>
  videoModelKeyboard: (isRu: boolean) => { reply_markup: any }
  isRussian: (ctx: MyContext) => boolean
}
