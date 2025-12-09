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
export * from './downloadFile'
export * from './validateImageUrl'
export * from './sendPhotoWithFallback'
export * from './sanitizeModelName'
export * from './saveFileLocally'
export * from './error'
export * from './textValidation'

/**
 * Получить имя бота из контекста
 */
export function getBotNameFromContext(ctx: { botInfo?: { username?: string } }): string {
  return ctx.botInfo?.username || 'unknown_bot'
}
