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
  DigitalAvatarBody = 'digital_avatar_body',
  DigitalAvatarBodyV2 = 'digital_avatar_body_v2',
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
  NeuroPhoto = 'neuro_photo',
  NeuroPhotoV2 = 'neuro_photo_v2',
  VoiceAvatar = 'voice_avatar',
  ImageGeneration = 'image_generation',
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

export function calculateModeCost({
  mode,
  steps = 1,
}: {
  mode: ModeEnum | string
  steps?: number
}): { stars: number } {
  const baseCosts: Record<string, number> = {
    [ModeEnum.DigitalAvatarBody]: 10,
    [ModeEnum.DigitalAvatarBodyV2]: 15,
    [ModeEnum.NeuroPhoto]: 40,
    [ModeEnum.NeuroPhotoV2]: 45,
    [ModeEnum.ImageToPrompt]: 20,
    [ModeEnum.Avatar]: 25,
    [ModeEnum.ChatWithAvatar]: 30,
    [ModeEnum.SelectModel]: 5,
    [ModeEnum.SelectModelWizard]: 5,
    [ModeEnum.Voice]: 10,
    [ModeEnum.TextToSpeech]: 10,
    [ModeEnum.ImageToVideo]: 50,
    [ModeEnum.TextToVideo]: 60,
    [ModeEnum.TextToImage]: 30,
    [ModeEnum.LipSync]: 40,
    [ModeEnum.VoiceAvatar]: 50,
    [ModeEnum.ImageGeneration]: 30,
  }

  const cost = baseCosts[mode]
  if (!cost) {
    throw new Error(`Unknown mode: ${mode}`)
  }

  return {
    stars:
      mode === ModeEnum.DigitalAvatarBody ||
      mode === ModeEnum.DigitalAvatarBodyV2
        ? cost * steps
        : cost,
  }
}

export const modeCosts: Record<ModeEnum, number> = {
  [ModeEnum.DigitalAvatarBody]: 10,
  [ModeEnum.DigitalAvatarBodyV2]: 15,
  [ModeEnum.NeuroPhoto]: 40,
  [ModeEnum.NeuroPhotoV2]: 45,
  [ModeEnum.ImageToPrompt]: 20,
  [ModeEnum.Avatar]: 25,
  [ModeEnum.ChatWithAvatar]: 30,
  [ModeEnum.SelectModel]: 5,
  [ModeEnum.SelectModelWizard]: 5,
  [ModeEnum.Voice]: 10,
  [ModeEnum.TextToSpeech]: 10,
  [ModeEnum.ImageToVideo]: 50,
  [ModeEnum.TextToVideo]: 60,
  [ModeEnum.TextToImage]: 30,
  [ModeEnum.LipSync]: 40,
  [ModeEnum.VoiceAvatar]: 50,
  [ModeEnum.ImageGeneration]: 30,
}

export const minCost = Math.min(...Object.values(modeCosts))
export const maxCost = Math.max(...Object.values(modeCosts))
