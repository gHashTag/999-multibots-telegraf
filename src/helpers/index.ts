console.log('Environment check:', {
  nodeEnv: process.env.NODE_ENV,
})

export const isDev = process.env.NODE_ENV === 'development'

export * from './pulse'
export * from './deleteFile'
export * from './language'
export * from './images'
export * from './delay'
export * from './ensureDirectoryExistence'
export * from './error/errorMessageAdmin'
export * from './downloadFile'
export * from './saveFileLocally'
export * from './inngest/balanceHelpers'
export * from './pulseNeuroImageV2'
export * from './processApiResponse'
export * from './error/errorMessage'
export * from './createVoiceAvatar'
export * from './processBalanceVideoOperation'
export * from './calculateVideoFinalPrice'
