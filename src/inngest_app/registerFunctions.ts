/**
 * Register all Inngest functions
 */
import kieAiWebhookMonitorFunctions from './functions/kieAiWebhookMonitor'
import { logger } from '@/utils/logger'

// Collect all functions (raw array with potential undefined values)
const allFunctionsRaw = [
  ...kieAiWebhookMonitorFunctions,
]

// Filter out undefined functions and log warnings
export const allInngestFunctions = allFunctionsRaw.filter((f, index) => {
  if (!f) {
    logger.warn(`⚠️ [INNGEST] Function at index ${index} is undefined - skipping`)
    return false
  }
  return true
})

// Log all registered functions
logger.info('🚀 [INNGEST] Registering functions', {
  count: allInngestFunctions.length,
  functions: allInngestFunctions.map(f => f.name || 'unnamed'),
})

export default allInngestFunctions
