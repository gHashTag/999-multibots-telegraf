import type { MyContext } from '@/interfaces'

/**
 * Dependencies interface for NeuroPhotoWizard module.
 * This ensures that external services are injected rather than directly imported.
 */
export interface NeuroPhotoWizardDependencies {
  userHelper: {
    getUserData: (telegramId: string) => Promise<any>
    getLatestUserModel: (telegramId: string) => Promise<any>
    getReferalsCountAndUserData: (telegramId: string) => Promise<any>
  }
  imageGenerationService: {
    generateNeuroImage: (
      prompt: string,
      modelUrl: string,
      triggerWord: string,
      telegramId: string,
      ctx: MyContext
    ) => Promise<any>
  }
  menuHandler: {
    handleMenu: (ctx: MyContext) => Promise<void>
  }
  logger: {
    info: (message: string, details?: any) => void
    error: (message: string, details?: any) => void
  }
  menu: {
    mainMenu: (ctx: MyContext) => Promise<void>
    levels: (ctx: MyContext) => Promise<void>
    sendGenericErrorMessage: (ctx: MyContext) => Promise<void>
    sendPhotoDescriptionRequest: (ctx: MyContext) => Promise<void>
  }
}
