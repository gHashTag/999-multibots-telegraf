import { Scenes } from 'telegraf'
import { MyContext } from '../interfaces'
import { isRussian } from '../helpers'
import { getUserBalance } from '../core/supabase'
import { calculateModeCost } from '../price/helpers/modelsCost'
import { sendInsufficientStarsMessage } from '../price/helpers'
import { Logger as logger } from '@/utils/logger'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { enterScene } from '@/utils/sceneHelpers'
import { SceneEnum } from '@/types/scenes'

const modeToSceneMap: Record<ModeEnum, SceneEnum> = {
  [ModeEnum.ChatWithAvatar]: SceneEnum.ChatWithAvatar,
  [ModeEnum.NeuroPhoto]: SceneEnum.NeuroPhoto,
  [ModeEnum.ImageToPrompt]: SceneEnum.ImageToPrompt,
  [ModeEnum.Voice]: SceneEnum.Voice,
  [ModeEnum.TextToSpeech]: SceneEnum.TextToSpeech,
  [ModeEnum.ImageToVideo]: SceneEnum.ImageToVideo,
  [ModeEnum.TextToVideo]: SceneEnum.TextToVideo,
  [ModeEnum.TextToImage]: SceneEnum.TextToImage,
  [ModeEnum.MainMenu]: SceneEnum.MainMenu,
  [ModeEnum.CheckBalanceScene]: SceneEnum.CheckBalance,
  [ModeEnum.SubscriptionCheckScene]: SceneEnum.SubscriptionCheck,
  // Add other mappings as needed
} as const

export const checkBalanceScene = new Scenes.BaseScene<MyContext>(ModeEnum.CheckBalanceScene)

checkBalanceScene.enter(async (ctx) => {
  const telegramId = ctx.from?.id
  const mode = ctx.session?.mode

  logger.info('🎯 Entering check balance scene', {
    telegram_id: telegramId,
    mode: mode
  })

  if (!telegramId) {
    logger.error('❌ Telegram ID not found in check balance scene', {
      telegram_id: telegramId
    })
    return
  }

  if (!mode) {
    logger.error('❌ Mode not found in check balance scene', {
      telegram_id: telegramId
    })
    return
  }

  try {
    // Get user's current balance
    const balance = await getUserBalance(telegramId.toString())
    if (balance === null) {
      logger.error('❌ Failed to get user balance', {
        telegram_id: telegramId
      })
      return
    }

    // Calculate cost for the selected mode
    const costResult = calculateModeCost({ mode })
    if (!costResult || !costResult.stars) {
      logger.error('❌ Failed to calculate mode cost', {
        telegram_id: telegramId,
        mode: mode
      })
      return
    }

    const cost = costResult.stars

    // Check if user has sufficient balance
    if (balance < cost) {
      logger.info('⚠️ Insufficient balance', {
        telegram_id: telegramId,
        balance: balance,
        cost: cost,
        mode: mode
      })
      await sendInsufficientStarsMessage(ctx, balance, cost)
      return
    }

    logger.info('✅ Balance check passed', {
      telegram_id: telegramId,
      balance: balance,
      cost: cost,
      mode: mode
    })

    // Transition to appropriate scene based on mode
    if (mode in ModeEnum) {
      // Map ModeEnum to SceneEnum
      let targetScene: SceneEnum
      switch (mode) {
        case ModeEnum.ChatWithAvatar:
          targetScene = SceneEnum.ChatWithAvatar
          break
        case ModeEnum.NeuroPhoto:
          targetScene = SceneEnum.NeuroPhoto
          break
        case ModeEnum.TextToImage:
          targetScene = SceneEnum.TextToImage
          break
        case ModeEnum.Voice:
          targetScene = SceneEnum.Voice
          break
        case ModeEnum.TextToSpeech:
          targetScene = SceneEnum.TextToSpeech
          break
        case ModeEnum.ImageToVideo:
          targetScene = SceneEnum.ImageToVideo
          break
        case ModeEnum.TextToVideo:
          targetScene = SceneEnum.TextToVideo
          break
        case ModeEnum.MainMenu:
          targetScene = SceneEnum.MainMenu
          break
        default:
          logger.info('⚠️ Falling back to main menu for mode:', { mode })
          targetScene = SceneEnum.MainMenu
      }
      return enterScene(ctx, targetScene, telegramId)
    } else {
      logger.error('❌ Invalid mode for scene transition', {
        telegram_id: telegramId,
        mode: mode
      })
      const isRu = isRussian(ctx)
      await ctx.reply(
        isRu
          ? '❌ Неверный режим работы'
          : '❌ Invalid operation mode'
      )
      return
    }
  } catch (error) {
    logger.error('❌ Error in check balance scene', {
      telegram_id: telegramId,
      error: error instanceof Error ? error.message : 'Unknown error',
      mode: mode
    })
    const isRu = isRussian(ctx)
    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка при проверке баланса'
        : '❌ Error occurred while checking balance'
    )
  }
})
