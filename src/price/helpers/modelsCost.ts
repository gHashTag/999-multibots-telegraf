import { calculateCost } from './calculateCost'
import { logger } from '@/utils/logger'

import { SYSTEM_CONFIG } from '../constants'

export const starCost = SYSTEM_CONFIG.starCost

export function calculateCostInStars(costInDollars: number): number {
  return costInDollars / starCost
}

export enum ModeEnum {
  Subscribe = 'subscribe',
  DigitalAvatarBody = 'digital_avatar_body',
  DigitalAvatarBodyV2 = 'digital_avatar_body_v2',
  NeuroPhoto = 'neuro_photo',
  NeuroPhotoV2 = 'neuro_photo_v2',
  NeuroAudio = 'neuro_audio',
  ImageToPrompt = 'image_to_prompt',
  Avatar = 'avatar',
  ChatWithAvatar = 'chat_with_avatar',
  SelectModel = 'select_model',
  SelectAiTextModel = 'select_ai_text_model',
  Voice = 'voice',
  TextToSpeech = 'text_to_speech',
  ImageToVideo = 'image_to_video',
  TextToVideo = 'text_to_video',
  TextToImage = 'text_to_image',
  LipSync = 'lip_sync',
  SelectNeuroPhoto = 'select_neuro_photo',
  ChangeSize = 'change_size',
  Invite = 'invite',
  Help = 'help',
  MainMenu = 'main_menu',
  Balance = 'balance',
  ImprovePrompt = 'improve_prompt',
  TopUpBalance = 'top_up_balance',
  VideoInUrl = 'video_in_url',
  Tech = 'tech',
  Stats = 'stats',
  BroadcastWizard = 'broadcast_wizard',
  SubscriptionCheckScene = 'subscription_check_scene',
  ImprovePromptWizard = 'improve_prompt_wizard',
  SizeWizard = 'size_wizard',
  PaymentScene = 'payment_scene',
  InviteScene = 'invite_scene',
  BalanceScene = 'balance_scene',
  Step0 = 'step0',
  NeuroCoderScene = 'neuro_coder_scene',
  CheckBalanceScene = 'check_balance_scene',
  HelpScene = 'help_scene',
  CancelPredictionsWizard = 'cancel_predictions_wizard',
  EmailWizard = 'email_wizard',
  GetRuBillWizard = 'get_ru_bill_wizard',
  SubscriptionScene = 'subscription_scene',
  CreateUserScene = 'create_user_scene',
  VoiceToText = 'voice_to_text',
  StartScene = 'start_scene',
}

export interface CostCalculationParams {
  mode: ModeEnum | string
  steps?: number
  numImages?: number
}

export interface CostCalculationResult {
  stars: number
  rubles: number
  dollars: number
}

type BaseCosts = {
  [key in ModeEnum | 'neuro_photo_2']?: number
}

export const BASE_COSTS: BaseCosts = {
  [ModeEnum.NeuroPhoto]: 0.08,
  [ModeEnum.NeuroPhotoV2]: 0.14,
  [ModeEnum.NeuroAudio]: 0.12,
  [ModeEnum.ImageToPrompt]: 0.03,
  [ModeEnum.Avatar]: 0,
  [ModeEnum.ChatWithAvatar]: 0,
  [ModeEnum.SelectModel]: 0,
  [ModeEnum.SelectAiTextModel]: 0,
  [ModeEnum.Voice]: 0.9,
  [ModeEnum.TextToSpeech]: 0.12,
  [ModeEnum.ImageToVideo]: 0,
  [ModeEnum.TextToVideo]: 0,
  [ModeEnum.TextToImage]: 0.08,
  [ModeEnum.LipSync]: 0.9,
  [ModeEnum.VoiceToText]: 0.08,
}

export function calculateModeCost(
  params: CostCalculationParams
): CostCalculationResult {
  const { mode, steps, numImages = 1 } = params

  try {
    let stars = 0

    if (mode === ModeEnum.DigitalAvatarBody && steps) {
      const cost = calculateCost(steps, 'v1')
      stars = cost.stars
    } else if (mode === ModeEnum.DigitalAvatarBodyV2 && steps) {
      const cost = calculateCost(steps, 'v2')
      stars = cost.stars
    } else {
      let normalizedMode = mode
      if (mode === 'neuro_photo_2') {
        normalizedMode = ModeEnum.NeuroPhotoV2
        logger.info({
          message: '🔄 Использован алиас режима',
          description: 'Mode alias used',
          originalMode: mode,
          normalizedMode,
        })
      }

      const baseCostInDollars = BASE_COSTS[normalizedMode as keyof BaseCosts]

      if (baseCostInDollars === undefined) {
        logger.error({
          message: '❌ Неизвестный режим',
          description: 'Unknown mode in cost calculation',
          mode,
          normalizedMode,
        })
        stars = 0
      } else {
        stars = (baseCostInDollars / starCost) * numImages
      }
    }

    if (mode === ModeEnum.VoiceToText) {
      stars = 5
    }

    stars = parseFloat(stars.toFixed(2))
    const dollars = parseFloat((stars * starCost).toFixed(2))
    const rubles = parseFloat((dollars * SYSTEM_CONFIG.interestRate).toFixed(2))

    return { stars, dollars, rubles }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при расчете стоимости',
      description: 'Error during cost calculation',
      error: error instanceof Error ? error.message : 'Unknown error',
      mode,
      steps,
      numImages,
    })
    throw error
  }
}

export const modeCosts: Record<string, number | ((param?: any) => number)> = {
  [ModeEnum.DigitalAvatarBody]: (steps: number) =>
    calculateModeCost({ mode: ModeEnum.DigitalAvatarBody, steps }).stars,
  [ModeEnum.DigitalAvatarBodyV2]: (steps: number) =>
    calculateModeCost({ mode: ModeEnum.DigitalAvatarBodyV2, steps }).stars,
  [ModeEnum.NeuroPhoto]: calculateModeCost({ mode: ModeEnum.NeuroPhoto }).stars,
  [ModeEnum.NeuroPhotoV2]: calculateModeCost({ mode: ModeEnum.NeuroPhotoV2 })
    .stars,
  [ModeEnum.NeuroAudio]: calculateModeCost({ mode: ModeEnum.NeuroAudio }).stars,
  neuro_photo_2: calculateModeCost({ mode: 'neuro_photo_2' }).stars,
  [ModeEnum.ImageToPrompt]: calculateModeCost({ mode: ModeEnum.ImageToPrompt })
    .stars,
  [ModeEnum.Avatar]: calculateModeCost({ mode: ModeEnum.Avatar }).stars,
  [ModeEnum.ChatWithAvatar]: calculateModeCost({
    mode: ModeEnum.ChatWithAvatar,
  }).stars,
  [ModeEnum.SelectModel]: calculateModeCost({ mode: ModeEnum.SelectModel })
    .stars,
  [ModeEnum.SelectAiTextModel]: calculateModeCost({
    mode: ModeEnum.SelectAiTextModel,
  }).stars,
  [ModeEnum.Voice]: calculateModeCost({ mode: ModeEnum.Voice }).stars,
  [ModeEnum.TextToSpeech]: calculateModeCost({ mode: ModeEnum.TextToSpeech })
    .stars,
  [ModeEnum.ImageToVideo]: calculateModeCost({ mode: ModeEnum.ImageToVideo })
    .stars,
  [ModeEnum.TextToVideo]: calculateModeCost({ mode: ModeEnum.TextToVideo })
    .stars,
  [ModeEnum.TextToImage]: calculateModeCost({ mode: ModeEnum.TextToImage })
    .stars,
  [ModeEnum.LipSync]: calculateModeCost({ mode: ModeEnum.LipSync }).stars,
  [ModeEnum.VoiceToText]: calculateModeCost({ mode: ModeEnum.VoiceToText })
    .stars,
}

export const minCost = Math.min(
  ...Object.values(modeCosts).map(cost =>
    typeof cost === 'function' ? cost(1) : cost
  )
)
export const maxCost = Math.max(
  ...Object.values(modeCosts).map(cost =>
    typeof cost === 'function' ? cost(1) : cost
  )
)
