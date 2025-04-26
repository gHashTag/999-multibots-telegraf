/**
 * Мок для scenes/index.ts
 */
import { vi } from 'vitest'

// Константы для идентификаторов сцен
export const SCENES = {
  START: 'startScene',
  MENU: 'menuScene',
  HELP: 'helpScene',
  PAY: 'payScene',
  SETTINGS: 'settingsScene',
  AVATAR_BRAIN: 'avatarBrainWizard',
  IMAGE_TO_PROMPT: 'imageToPromptWizard',
  EMAIL: 'emailWizard',
  IMPROVE_PROMPT: 'improvePromptWizard',
  SIZE: 'sizeWizard',
  NEUROPHOTO: 'neuroPhotoWizard',
  NEUROPHOTO_V2: 'neuroPhotoWizardV2',
  TEXT_TO_VIDEO: 'textToVideoWizard',
  IMAGE_TO_VIDEO: 'imageToVideoWizard',
  CANCEL_PREDICTIONS: 'cancelPredictionsWizard',
  TRAIN_FLUX_MODEL: 'trainFluxModelWizard',
  UPLOAD_TRAIN_FLUX_MODEL: 'uploadTrainFluxModelScene',
  DIGITAL_AVATAR_BODY: 'digitalAvatarBodyWizard',
  DIGITAL_AVATAR_BODY_V2: 'digitalAvatarBodyWizardV2',
  SELECT_MODEL: 'selectModelWizard',
  VOICE_AVATAR: 'voiceAvatarWizard',
  TEXT_TO_SPEECH: 'textToSpeechWizard',
  PAYMENT: 'paymentScene',
  TEXT_TO_IMAGE: 'textToImageWizard',
  LEVEL_QUEST: 'levelQuestWizard',
  NEUROCODER: 'neuroCoderScene',
  LIP_SYNC: 'lipSyncWizard',
  BALANCE: 'balanceScene',
  CHAT_WITH_AVATAR: 'chatWithAvatarWizard',
  SUBSCRIPTION: 'subscriptionScene',
  INVITE: 'inviteScene',
  GET_RU_BILL: 'getRuBillWizard',
  SUBSCRIPTION_CHECK: 'subscriptionCheckScene',
  CREATE_USER: 'createUserScene',
  CHECK_BALANCE: 'checkBalanceScene',
  UPLOAD_VIDEO: 'uploadVideoScene',
  RUBLE_PAYMENT: 'rublePaymentScene',
  STAR_PAYMENT: 'starPaymentScene',
  VIDEO_MODEL: 'video-model-scene',
  PHOTO_MODEL: 'photo-model-scene',
  IMAGE_QUALITY: 'image-quality-scene',
  VIDEO_QUALITY: 'video-quality-scene',
  CHAT: 'chat-scene',
  ADMIN: 'admin-scene',
}

// Моки сцен
export const menuSceneMock = { id: SCENES.MENU, steps: [vi.fn()] }
export const startSceneMock = { id: SCENES.START, steps: [vi.fn()] }
export const helpSceneMock = { id: SCENES.HELP, steps: [vi.fn()] }

// Примечание: Реальные сцены должны импортироваться напрямую из src, а не из этого файла-мока
