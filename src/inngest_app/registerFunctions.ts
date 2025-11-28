/**
 * Register all Inngest functions - LAZY VERSION
 *
 * ✅ ВАЖНО: Создаем функции только после загрузки секретов из Infisical
 * чтобы избежать ошибки "Could not find event key"
 */
import { createWebhookMonitorFunctions } from './functions/kieAiWebhookMonitor'

// Import migrated functions from ai-server - these also need to be made lazy
// import { neuroImageGeneration } from './functions/neuroImageGeneration'
// import { morphImages } from './functions/morphImages'
// import { generateModelTraining } from './functions/generateModelTraining'

/**
 * Factory function to create all Inngest functions
 * This is called AFTER secrets are loaded from Infisical
 */
export function createAllInngestFunctions() {
  console.log('🔧 [INNGEST] Creating Inngest functions after secrets loaded...')

  const kieAiWebhookMonitorFunctions = createWebhookMonitorFunctions()

  // TODO: Convert other functions to lazy pattern
  // const neuroImageGeneration = createNeuroImageGeneration()
  // const morphImages = createMorphImages()
  // const generateModelTraining = createGenerateModelTraining()

  const allInngestFunctions = [
    ...kieAiWebhookMonitorFunctions,
    // ...neuroImageGeneration,
    // ...morphImages,
    // ...generateModelTraining,
  ]

  console.log(`✅ [INNGEST] Created ${allInngestFunctions.length} Inngest functions`)
  return allInngestFunctions
}
