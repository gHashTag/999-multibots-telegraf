import { MyContext } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/app.interface'
import { logger } from '@/utils/logger'
import { ModelUrl } from '@/interfaces/models.interface'

export const initSession =
  () => async (ctx: MyContext, next: () => Promise<void>) => {
    try {
      // Инициализируем сессию, если она не существует
      if (!ctx.session) {
        logger.info('🔄 Initializing new session')
        ctx.session = {
          email: '',
          selectedModel: '',
          prompt: '',
          selectedSize: '',
          userModel: {
            model_name: 'default',
            model_url: 'default/stable:latest' as ModelUrl,
            trigger_word: '',
          },
          numImages: 1,
          telegram_id: '',
          mode: ModeEnum.MainMenu,
          attempts: 0,
          videoModel: '',
          imageUrl: '',
          videoUrl: '',
          audioUrl: '',
          amount: 0,
          subscription: 'stars',
          images: [],
          modelName: '',
          targetUserId: 0,
          username: '',
          triggerWord: '',
          steps: 0,
          inviter: '',
          inviteCode: '',
          invoiceURL: '',
          buttons: [],
          selectedPayment: {
            amount: 0,
            stars: 0,
          },
        }
      }

      return next()
    } catch (error) {
      logger.error('❌ Error in session middleware:', {
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }
