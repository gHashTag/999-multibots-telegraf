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
export * from './errorMessageAdmin'
export * from './downloadFile'
export * from './saveFileLocally'
export * from './inngest/balanceHelpers'
export * from './pulseNeuroImageV2'
export * from './processApiResponse'
export * from './errorMessage'
export * from './createVoiceAvatar'
