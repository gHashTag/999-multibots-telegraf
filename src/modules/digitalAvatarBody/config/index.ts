import { z } from 'zod'
import logger from '@/utils/logger'

const digitalAvatarBodyConfigSchema = z.object({
  nodeEnv: z.string().default('development'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  apiUrl: z.string().url().optional(),
  replicateApiToken: z.string().optional(),
  replicateUsername: z.string().optional(),
  replicateTrainingModelVersion: z.string().optional(),
  inngestEventKey: z.string().optional(), // Original event key, might be for a different event or general
  inngestEventNameGenerateModelTraining: z.string(), // Specific for this function. Correctly defined.
  isDevEnvironment: z.boolean().default(false),
})

export type DigitalAvatarBodyConfig = z.infer<
  typeof digitalAvatarBodyConfigSchema
>

let memoizedConfig: DigitalAvatarBodyConfig | null = null

export function getDigitalAvatarBodyConfig(): DigitalAvatarBodyConfig {
  if (memoizedConfig) {
    return memoizedConfig
  }

  const rawConfig = {
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL,
    apiUrl: process.env.API_URL,
    replicateApiToken: process.env.REPLICATE_API_TOKEN,
    replicateUsername: process.env.REPLICATE_USERNAME,
    replicateTrainingModelVersion: process.env.REPLICATE_TRAINING_MODEL_VERSION,
    inngestEventKey: process.env.INNGEST_EVENT_KEY,
    inngestEventNameGenerateModelTraining:
      process.env.INNGEST_EVENT_NAME_DIGITAL_AVATAR_GENERATE_MODEL_TRAINING ||
      'digital_avatar_body/generate.model.training',
    isDevEnvironment: process.env.NODE_ENV === 'development',
  }

  try {
    const parsedConfig = digitalAvatarBodyConfigSchema.parse(rawConfig)
    // Логируем успешную загрузку конфигурации с помощью глобального логгера
    logger.info(
      '[DigitalAvatarBodyConfig] Module configuration loaded successfully.'
    )
    // logger.debug('[DigitalAvatarBodyConfig] Loaded config:', parsedConfig) // Optional
    memoizedConfig = parsedConfig
    return memoizedConfig
  } catch (error) {
    // Логируем ошибку парсинга с помощью глобального логгера
    logger.error(
      '[DigitalAvatarBodyConfig] Failed to parse module configuration:',
      error
    )
    throw new Error(
      'DigitalAvatarBodyConfig parsing failed. Check environment variables and schema.'
    )
  }
}

export function invalidateDigitalAvatarBodyConfig(): void {
  memoizedConfig = null
}
