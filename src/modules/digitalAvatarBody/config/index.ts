import { z } from 'zod'
import { logger } from '../utils/logger' // Assuming local logger

const DigitalAvatarBodyConfigSchema = z.object({
  nodeEnv: z.string().optional().default('development'),
  logLevel: z
    .enum(['debug', 'info', 'warn', 'error'])
    .optional()
    .default('info'),
  apiUrl: z.string().optional(), // For callbacks or other API interactions
  replicateApiToken: z.string().optional(),
  replicateUsername: z.string().optional(),
  replicateTrainingModelVersion: z.string().optional(),
  replicateDefaultSteps: z.number().optional().default(1500),
  inngestEventKeyGenerateModelTraining: z
    .string()
    .optional()
    .default('digital.avatar.body.generate.model.training'), // Default event name
  inngestEventNameGenerateModelTraining: z
    .string()
    .optional()
    .default('digital.avatar.body.generate.model.training.v2'), // Default event name for v2 function
  replicatePollingTimeoutMs: z.number().optional().default(600000), // 10 minutes
  replicatePollingIntervalMs: z.number().optional().default(15000), // 15 seconds
})

export type DigitalAvatarBodyConfig = z.infer<
  typeof DigitalAvatarBodyConfigSchema
>

let validatedConfig: DigitalAvatarBodyConfig

export const getDigitalAvatarBodyConfig = (): DigitalAvatarBodyConfig => {
  if (validatedConfig) {
    return validatedConfig
  }

  try {
    validatedConfig = DigitalAvatarBodyConfigSchema.parse({
      nodeEnv: process.env.NODE_ENV,
      logLevel: process.env.LOG_LEVEL,
      apiUrl: process.env.API_URL,
      replicateApiToken: process.env.REPLICATE_API_TOKEN,
      replicateUsername: process.env.REPLICATE_USERNAME, // Usually the destination username for models
      replicateTrainingModelVersion:
        process.env.REPLICATE_TRAINING_MODEL_VERSION,
      replicateDefaultSteps: process.env.REPLICATE_DEFAULT_STEPS
        ? parseInt(process.env.REPLICATE_DEFAULT_STEPS, 10)
        : undefined,
      inngestEventKeyGenerateModelTraining:
        process.env
          .INNGEST_EVENT_KEY_DIGITAL_AVATAR_BODY_GENERATE_MODEL_TRAINING,
      inngestEventNameGenerateModelTraining:
        process.env
          .INNGEST_EVENT_NAME_DIGITAL_AVATAR_BODY_GENERATE_MODEL_TRAINING_V2,
      replicatePollingTimeoutMs: process.env.REPLICATE_POLLING_TIMEOUT_MS
        ? parseInt(process.env.REPLICATE_POLLING_TIMEOUT_MS, 10)
        : undefined,
      replicatePollingIntervalMs: process.env.REPLICATE_POLLING_INTERVAL_MS
        ? parseInt(process.env.REPLICATE_POLLING_INTERVAL_MS, 10)
        : undefined,
    })

    // Add a derived property for convenience
    // return {
    //   ...validatedConfig,
    //   isDevEnvironment: validatedConfig.nodeEnv === 'development',
    // }
    return validatedConfig
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error(
        'Failed to validate DigitalAvatarBody module configuration:',
        {
          errors: error.flatten().fieldErrors,
        }
      )
    } else {
      logger.error(
        'An unexpected error occurred during DigitalAvatarBody module configuration parsing:',
        error
      )
    }
    // Fallback to defaults if parsing fails, or rethrow if critical
    // For now, let's allow fallback to schema defaults for robustness
    logger.warn(
      'Falling back to default DigitalAvatarBody module configuration due to parsing errors.'
    )
    // validatedConfig = DigitalAvatarBodyConfigSchema.parse({}) // This would use defaults
    // To be safer and ensure it always returns a valid config even if env vars are missing/wrong:
    // This will apply defaults for any undefined values from process.env
    const minimalSafeConfig = DigitalAvatarBodyConfigSchema.parse({
      replicateApiToken: process.env.REPLICATE_API_TOKEN, // Keep required ones if any
      replicateUsername: process.env.REPLICATE_USERNAME,
    })
    validatedConfig = {
      ...DigitalAvatarBodyConfigSchema.parse({}),
      ...minimalSafeConfig,
    }

    // return {
    //   ...validatedConfig,
    //   isDevEnvironment: validatedConfig.nodeEnv === 'development',
    // }
    return validatedConfig
  }
}

export function invalidateDigitalAvatarBodyConfig(): void {
  validatedConfig = null
}
