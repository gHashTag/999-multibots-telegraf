/**
 * Register all Inngest functions
 */
import kieAiWebhookMonitorFunctions from './functions/kieAiWebhookMonitor'

/**
 * Array of all Inngest functions to register
 */
export const allInngestFunctions = [
  ...kieAiWebhookMonitorFunctions,
]

export default allInngestFunctions
