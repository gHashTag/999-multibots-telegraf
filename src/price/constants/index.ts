import { ModeEnum } from '../types/modes'

// System configuration
export const SYSTEM_CONFIG = {
  starCost: 0.016,
  interestRate: 50,
  currency: 'RUB',
}

export const { starCost, interestRate } = SYSTEM_CONFIG

// Star purchase limits
export const STAR_AMOUNTS = {
  min: 100,
  max: 10000,
  default: 1000,
}

// Base costs for different modes (in dollars)
export const BASE_COSTS = {
  [ModeEnum.NeuroPhoto]: 0.08,
  [ModeEnum.NeuroPhotoV2]: 0.14,
  neuro_photo_2: 0.14, // Legacy support
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
  [ModeEnum.VoiceToText]: 0.08,
} as const

// Speech-related costs (in stars)
export const SPEECH_COSTS = {
  [ModeEnum.TextToSpeech]: 10,
  [ModeEnum.Voice]: 50,
} as const

// Voice conversation cost (in stars)
export const VOICE_CONVERSATION_COST = 0.5

// Digital avatar costs per step (in dollars)
export const DIGITAL_AVATAR_COSTS = {
  v1: 0.1, // DigitalAvatarBody
  v2: 0.2, // DigitalAvatarBodyV2
} as const
