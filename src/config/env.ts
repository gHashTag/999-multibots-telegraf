import { logger } from '@/utils/logger'

// Required environment variables
const requiredEnvVars = [
  'NODE_ENV',
  'BOT_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'INNGEST_EVENT_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'REPLICATE_API_TOKEN',
  'SYNC_LABS_API_KEY',
  'BFL_API_KEY',
  'BFL_WEBHOOK_SECRET',
  'BFL_API_URL',
  'VIDEO_API_KEY',
  'VIDEO_API_URL',
  'GLAMA_API_KEY',
  'ELEVENLABS_API_KEY',
  'PASSWORD1',
  'TEST_PASSWORD1',
  'SECRET_TOKEN',
]

// Optional environment variables with default values
const optionalEnvVars = {
  PORT: '2999',
  API_PORT: '2999',
  HOST: 'localhost',
  API_URL: 'http://localhost:2999',
  LOCAL_SERVER_URL: 'http://localhost:2999',
  ORIGIN: 'https://production.com',
}

/**
 * Validates that all required environment variables are set
 * @throws Error if any required environment variable is missing
 */
export function validateEnv(): void {
  logger.info('🔍 Validating environment variables...')

  // Check required environment variables
  const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar])

  if (missingVars.length > 0) {
    logger.error('❌ Missing required environment variables', {
      description: 'Environment validation error',
      missingVariables: missingVars,
    })
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}`
    )
  }

  // Set default values for optional environment variables
  Object.entries(optionalEnvVars).forEach(([key, defaultValue]) => {
    if (!process.env[key]) {
      process.env[key] = defaultValue
      logger.info(`ℹ️ Setting default value for ${key}`, {
        description: 'Environment variable default value set',
        variable: key,
        value: defaultValue,
      })
    }
  })

  logger.info('✅ Environment variables validated successfully', {
    description: 'Environment validation complete',
    nodeEnv: process.env.NODE_ENV,
  })
}

// Validate environment variables on import
validateEnv()
