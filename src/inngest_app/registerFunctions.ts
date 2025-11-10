/**
 * Register all Inngest functions
 */
import kieAiWebhookMonitorFunctions from './functions/kieAiWebhookMonitor'

/**
 * Array of all Inngest functions to register
 *
 * ✅ ВАЖНО: Экспортируем НАПРЯМУЮ без промежуточных переменных
 * чтобы избежать Tree Shaking оптимизации TypeScript
 */
export const allInngestFunctions = [
  ...kieAiWebhookMonitorFunctions,
]

export default allInngestFunctions
