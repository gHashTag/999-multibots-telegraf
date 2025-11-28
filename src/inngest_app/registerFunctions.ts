/**
 * Register all Inngest functions - LAZY VERSION
 *
 * ✅ ВАЖНО: Создаем функции только после загрузки секретов из Infisical
 * чтобы избежать ошибки "Could not find event key"
 */
import { createWebhookMonitorFunctions } from './functions/kieAiWebhookMonitor'

// Import migrated functions from ai-server - these also need to be made lazy
import { createGenerateModelTrainingFunction } from './functions/existing/generateModelTrainingFunction'
// import { neuroImageGeneration } from './functions/neuroImageGeneration'
// import { morphImages } from './functions/morphImages'

/**
 * Factory function to create all Inngest functions
 * This is called AFTER secrets are loaded from Infisical
 */
export function createAllInngestFunctions(inngestClient?: any) {
  console.log('🔧 [INNGEST] Creating Inngest functions after secrets loaded...')

  const kieAiWebhookMonitorFunctions = createWebhookMonitorFunctions()
  console.log(`📋 Kie.ai webhook monitor functions: ${kieAiWebhookMonitorFunctions.length}`)

  // Create model training function using factory pattern
  let modelTrainingFunction = null
  try {
    console.log('🔄 Creating model training function...')
    modelTrainingFunction = createGenerateModelTrainingFunction(inngestClient)
    console.log('✅ Model training function created successfully')
  } catch (error) {
    console.error('❌ Failed to create model training function:', error)
    throw error
  }

  // TODO: Convert other functions to lazy pattern
  // const neuroImageGeneration = createNeuroImageGeneration()
  // const morphImages = createMorphImages()

  const allInngestFunctions = [
    ...kieAiWebhookMonitorFunctions,
    modelTrainingFunction,
    // ...neuroImageGeneration,
    // ...morphImages,
  ]

  console.log(
    `✅ [INNGEST] Created ${allInngestFunctions.length} Inngest functions`
  )
  return allInngestFunctions
}
