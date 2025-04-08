import { calculateCost } from './calculateCost'
import { logger } from '@/utils/logger'
import { VIDEO_MODELS_CONFIG } from '@/menu/videoModelMenu'
import { interestRate } from '../interestRate'

export const starCost = 0.016

export const SYSTEM_CONFIG = {
  starCost,
  interestRate,
  currency: 'RUB',
}

export function calculateCostInStars(costInDollars: number): number {
  return costInDollars / starCost
}

export enum ModeEnum {
  Subscribe = 'subscribe',
  DigitalAvatarBody = 'digital_avatar_body',
  DigitalAvatarBodyV2 = 'digital_avatar_body_v2',
  NeuroPhoto = 'neuro_photo',
  NeuroPhotoV2 = 'neuro_photo_v2',
  ImageToPrompt = 'image_to_prompt',
  Avatar = 'avatar',
  ChatWithAvatar = 'chat_with_avatar',
  SelectModel = 'select_model',
  SelectModelWizard = 'select_model_wizard',
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
  [key in ModeEnum]?: number
}

const BASE_COSTS: BaseCosts = {
  [ModeEnum.NeuroPhoto]: 0.08,
  [ModeEnum.NeuroPhotoV2]: 0.14,
  [ModeEnum.ImageToPrompt]: 0.03,
  [ModeEnum.Avatar]: 0,
  [ModeEnum.ChatWithAvatar]: 0,
  [ModeEnum.SelectModel]: 0,
  [ModeEnum.SelectModelWizard]: 0,
  [ModeEnum.Voice]: 0.9,
  [ModeEnum.TextToSpeech]: 0.12,
  [ModeEnum.ImageToVideo]: 0,
  [ModeEnum.TextToVideo]: 0,
  [ModeEnum.TextToImage]: 0.08,
  [ModeEnum.LipSync]: 0.9,
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
      const baseCostInDollars = BASE_COSTS[mode as keyof BaseCosts]

      if (baseCostInDollars === undefined) {
        logger.error({
          message: '❌ Неизвестный режим',
          description: 'Unknown mode in cost calculation',
          mode,
        })
        stars = 0
      } else {
        stars = (baseCostInDollars / starCost) * numImages
      }
    }

    stars = parseFloat(stars.toFixed(2))
    const dollars = parseFloat((stars * starCost).toFixed(2))
    const rubles = parseFloat((dollars * interestRate).toFixed(2))

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
  [ModeEnum.NeuroPhotoV2]: calculateModeCost({ mode: ModeEnum.NeuroPhotoV2 }).stars,
  [ModeEnum.ImageToPrompt]: calculateModeCost({ mode: ModeEnum.ImageToPrompt }).stars,
  [ModeEnum.Avatar]: calculateModeCost({ mode: ModeEnum.Avatar }).stars,
  [ModeEnum.ChatWithAvatar]: calculateModeCost({
    mode: ModeEnum.ChatWithAvatar,
  }).stars,
  [ModeEnum.SelectModel]: calculateModeCost({ mode: ModeEnum.SelectModel }).stars,
  [ModeEnum.SelectModelWizard]: calculateModeCost({
    mode: ModeEnum.SelectModelWizard,
  }).stars,
  [ModeEnum.Voice]: calculateModeCost({ mode: ModeEnum.Voice }).stars,
  [ModeEnum.TextToSpeech]: calculateModeCost({ mode: ModeEnum.TextToSpeech }).stars,
  [ModeEnum.ImageToVideo]: calculateModeCost({ mode: ModeEnum.ImageToVideo }).stars,
  [ModeEnum.TextToVideo]: calculateModeCost({ mode: ModeEnum.TextToVideo }).stars,
  [ModeEnum.TextToImage]: calculateModeCost({ mode: ModeEnum.TextToImage }).stars,
  [ModeEnum.LipSync]: calculateModeCost({ mode: ModeEnum.LipSync }).stars,
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

export function normalizeMode(mode: string): string {
  return mode
}

export const MODE_COSTS: Record<ModeEnum, number> = {
  [ModeEnum.Subscribe]: 0,
  [ModeEnum.DigitalAvatarBody]: calculateModeCost({ mode: ModeEnum.DigitalAvatarBody, steps: 1 }).stars,
  [ModeEnum.DigitalAvatarBodyV2]: calculateModeCost({ mode: ModeEnum.DigitalAvatarBodyV2, steps: 1 }).stars,
  [ModeEnum.NeuroPhoto]: calculateModeCost({ mode: ModeEnum.NeuroPhoto }).stars,
  [ModeEnum.NeuroPhotoV2]: calculateModeCost({ mode: ModeEnum.NeuroPhotoV2 }).stars,
  [ModeEnum.ImageToPrompt]: calculateModeCost({ mode: ModeEnum.ImageToPrompt }).stars,
  [ModeEnum.Avatar]: calculateModeCost({ mode: ModeEnum.Avatar }).stars,
  [ModeEnum.ChatWithAvatar]: calculateModeCost({ mode: ModeEnum.ChatWithAvatar }).stars,
  [ModeEnum.SelectModel]: 0,
  [ModeEnum.SelectModelWizard]: 0,
  [ModeEnum.Voice]: calculateModeCost({ mode: ModeEnum.Voice }).stars,
  [ModeEnum.TextToSpeech]: calculateModeCost({ mode: ModeEnum.TextToSpeech }).stars,
  [ModeEnum.ImageToVideo]: calculateModeCost({ mode: ModeEnum.ImageToVideo }).stars,
  [ModeEnum.TextToVideo]: calculateModeCost({ mode: ModeEnum.TextToVideo }).stars,
  [ModeEnum.TextToImage]: calculateModeCost({ mode: ModeEnum.TextToImage }).stars,
  [ModeEnum.LipSync]: calculateModeCost({ mode: ModeEnum.LipSync }).stars,
  [ModeEnum.SelectNeuroPhoto]: 0,
  [ModeEnum.ChangeSize]: 0,
  [ModeEnum.Invite]: 0,
  [ModeEnum.Help]: 0,
  [ModeEnum.MainMenu]: 0,
  [ModeEnum.Balance]: 0,
  [ModeEnum.ImprovePrompt]: 0,
  [ModeEnum.TopUpBalance]: 0,
  [ModeEnum.VideoInUrl]: calculateModeCost({ mode: ModeEnum.VideoInUrl }).stars,
  [ModeEnum.Tech]: 0,
  [ModeEnum.Stats]: 0,
  [ModeEnum.BroadcastWizard]: 0,
  [ModeEnum.SubscriptionCheckScene]: 0,
  [ModeEnum.ImprovePromptWizard]: 0,
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
  [ModeEnum.CreateUserScene]: 0,
  [ModeEnum.GetRuBillWizard]: 0,
  [ModeEnum.SubscriptionScene]: 0,
  [ModeEnum.StartScene]: 0
} as const
