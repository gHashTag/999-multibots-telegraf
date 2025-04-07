import { inngest } from './clients'
import { paymentProcessor } from './paymentProcessor'
import { voiceToTextProcessor } from './voiceToText.inngest'

// Регистрируем обработчики
inngest.register(paymentProcessor)
inngest.register(voiceToTextProcessor)

export { inngest }

export * from './generateModelTraining'
export * from './modelTrainingV2'
export * from './neuroImageGeneration'
export * from './neuroPhotoV2Generation'
export * from './broadcastMessage'
export * from './functions'
export * from './textToImage.inngest'
export * from './createVoiceAvatar.inngest'
export * from './textToSpeech.inngest'
export * from './ruPayment.service'
export * from './imageToPrompt'
export * from './textToVideo.inngest'
export { generateModelTraining } from './generateModelTraining'
