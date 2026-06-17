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

// Helper to get bot name from context
import { MyContext } from '../interfaces'

export function getBotNameFromContext(ctx: MyContext): string {
  return ctx.botInfo?.username || 'unknown_bot'
}
