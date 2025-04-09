import { ModeEnum } from '@/types/modes'
import { logger } from '@/utils/logger'

interface CalculateModeCostParams {
  mode: ModeEnum
  telegram_id: string
  options?: {
    duration?: number
    size?: number
  }
}

const DEFAULT_COSTS: Record<ModeEnum, number> = {
  [ModeEnum.VoiceToText]: 1,
  [ModeEnum.TextToSpeech]: 2,
  [ModeEnum.TextToImage]: 3,
  [ModeEnum.ImageToVideo]: 5,
  [ModeEnum.TextToVideo]: 10,
  [ModeEnum.ChatWithAvatar]: 1,
  [ModeEnum.Avatar]: 5,
  [ModeEnum.Voice]: 3,
  [ModeEnum.DigitalAvatarBody]: 10,
  [ModeEnum.DigitalAvatarBodyV2]: 10,
  [ModeEnum.NeuroPhoto]: 3,
  [ModeEnum.NeuroPhotoV2]: 3,
  [ModeEnum.ImageToPrompt]: 1,
  [ModeEnum.AvatarBrainWizard]: 0,
  [ModeEnum.SelectModel]: 0,
  [ModeEnum.SelectModelWizard]: 0,
  [ModeEnum.LipSync]: 5,
  [ModeEnum.SelectNeuroPhoto]: 0,
  [ModeEnum.ChangeSize]: 0,
  [ModeEnum.Invite]: 0,
  [ModeEnum.Help]: 0,
  [ModeEnum.Balance]: 0,
  [ModeEnum.ImprovePrompt]: 1,
  [ModeEnum.TopUpBalance]: 0,
  [ModeEnum.VideoInUrl]: 0,
  [ModeEnum.Tech]: 0,
  [ModeEnum.Price]: 0,
  [ModeEnum.Stats]: 0,
  [ModeEnum.BroadcastWizard]: 0,
  [ModeEnum.SubscriptionCheckScene]: 0,
  [ModeEnum.ImprovePromptWizard]: 1,
  [ModeEnum.SizeWizard]: 0,
  [ModeEnum.PaymentScene]: 0,
  [ModeEnum.InviteScene]: 0,
  [ModeEnum.BalanceScene]: 0,
  [ModeEnum.Step0]: 0,
  [ModeEnum.NeuroCoderScene]: 0,
  [ModeEnum.CheckBalanceScene]: 0,
  [ModeEnum.HelpScene]: 0,
  [ModeEnum.CancelPredictionsWizard]: 0,
  [ModeEnum.EmailWizard]: 0,
  [ModeEnum.GetRuBillWizard]: 0,
  [ModeEnum.SubscriptionScene]: 0,
  [ModeEnum.CreateUserScene]: 0,
  [ModeEnum.MenuScene]: 0,
  [ModeEnum.StartScene]: 0,
  [ModeEnum.Subscribe]: 0,
}

export async function calculateModeCost({
  mode,
  telegram_id,
  options = {},
}: CalculateModeCostParams): Promise<number> {
  try {
    const baseCost = DEFAULT_COSTS[mode] || 0
    let finalCost = baseCost

    // Adjust cost based on options
    if (options.duration) {
      finalCost *= Math.ceil(options.duration / 60) // Cost per minute
    }

    if (options.size) {
      finalCost *= Math.ceil(options.size / (1024 * 1024)) // Cost per MB
    }

    logger.info('💰 Расчет стоимости:', {
      description: 'Cost calculation',
      mode,
      telegram_id,
      baseCost,
      finalCost,
      options,
    })

    return finalCost
  } catch (error) {
    logger.error('❌ Ошибка при расчете стоимости:', {
      description: 'Error calculating cost',
      error: error instanceof Error ? error.message : String(error),
      mode,
      telegram_id,
    })
    return 0
  }
}
