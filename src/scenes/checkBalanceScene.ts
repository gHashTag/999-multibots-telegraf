import { Scenes } from 'telegraf'
import { MyContext } from '../interfaces'
import { isRussian } from '../helpers'
import { getUserBalance } from '../core/supabase'
import { calculateModeCost } from '../price/helpers/modelsCost'
import { sendInsufficientStarsMessage } from '../price/helpers'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { enterScene } from '@/utils/sceneHelpers'

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
      logger.info('🎯 Transitioning to scene', {
        from_scene: ctx.session?.mode,
        to_scene: mode,
        telegram_id: telegramId
      })
      ctx.session.mode = mode
      return enterScene(ctx, mode as ModeEnum, telegramId)
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
