import Replicate from 'replicate'
import { getDigitalAvatarBodyConfig } from '../config'
import { logger } from './logger'

/**
 * Initializes and returns a Replicate client instance.
 * Uses the provided apiToken if available, otherwise falls back to the module's configuration.
 *
 * @param apiToken - Optional. The Replicate API token to use.
 * @returns An instance of the Replicate client.
 * @throws Error if no API token can be determined.
 */
export const getReplicateClient = (apiToken?: string | null): Replicate => {
  const config = getDigitalAvatarBodyConfig()
  const tokenToUse = apiToken || config.replicateApiToken

  if (!tokenToUse) {
    logger.error(
      '[ReplicateClient] No API token available for Replicate client initialization. Provided token was empty and module config token is also not set.'
    )
    throw new Error('Replicate API token is not configured or provided.')
  }

  return new Replicate({
    auth: tokenToUse,
    // Можно добавить userAgent или другие параметры конфигурации Replicate здесь, если необходимо
    // userAgent: `digital-avatar-body-module/1.0`
  })
}
