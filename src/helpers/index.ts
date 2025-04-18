// Log environment only in development
export const isDev = process.env.NODE_ENV === 'development'
if (isDev) {
  console.log('Environment check:', { nodeEnv: process.env.NODE_ENV })
}

// isDev defined above

export * from './pulse'
export * from './deleteFile'
export * from './language'
export * from './images'
export * from './delay'
export * from './ensureDirectoryExistence'
