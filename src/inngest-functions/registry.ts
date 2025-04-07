import { paymentProcessor } from './paymentProcessor'
import { voiceToTextProcessor } from './voiceToText.inngest'
import { helloWorldFunction } from './functions'
import { broadcastFunction } from './functions'
import { generateModelTraining } from './generateModelTraining'
import { modelTrainingV2 } from './modelTrainingV2'
import { neuroImageGeneration } from './neuroImageGeneration'
import { neuroPhotoV2Generation } from './neuroPhotoV2Generation'
import { textToImageFunction } from './textToImage.inngest'
import { createVoiceAvatarFunction } from './createVoiceAvatar.inngest'
import { textToSpeechFunction } from './textToSpeech.inngest'
import { ruPaymentProcessPayment } from './ruPayment.service'
import { imageToPromptFunction } from './imageToPrompt'
import { textToVideoFunction } from './textToVideo.inngest'

// Регистрируем все функции Inngest
export const functions = [
  paymentProcessor,
  voiceToTextProcessor,
  helloWorldFunction,
  broadcastFunction,
  generateModelTraining,
  modelTrainingV2,
  neuroImageGeneration,
  neuroPhotoV2Generation,
  textToImageFunction,
  createVoiceAvatarFunction,
  textToSpeechFunction,
  ruPaymentProcessPayment,
  imageToPromptFunction,
  textToVideoFunction
] 