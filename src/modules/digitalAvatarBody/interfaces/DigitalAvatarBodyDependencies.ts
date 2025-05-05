import { MyContext } from '@/interfaces'

export interface DigitalAvatarBodyDependencies {
  getUserBalance: (telegramId: string, botName: string) => Promise<number>
  generateAvatarBody: (
    telegramId: string,
    username: string,
    isRu: boolean,
    botName: string,
    inputData: any
  ) => Promise<string>
  sendGenericErrorMessage: (ctx: MyContext, isRu: boolean) => Promise<void>
  isRussian: (ctx: MyContext) => boolean
}
