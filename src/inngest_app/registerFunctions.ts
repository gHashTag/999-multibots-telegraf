/**
 * Register all Inngest functions - LAZY VERSION
 *
 * ✅ ВАЖНО: Создаем функции только после загрузки секретов из Infisical
 * чтобы избежать ошибки "Could not find event key"
 */
import { createWebhookMonitorFunctions } from './functions/kieAiWebhookMonitor'

// Import migrated functions from ai-server - these also need to be made lazy
import { createGenerateModelTrainingFunction } from './functions/existing/generateModelTrainingFunction'
import { createHandleModelTrainingCompletedFunction } from './functions/existing/handleModelTrainingCompleted'

// Import webhook health guard functions (CRITICAL for video monitoring)
import {
  webhookHealthCheck,
  validateWebhookBeforeGeneration,
  periodicWebhookHealthCheck,
} from './functions/webhookHealthGuard'

// Import neuro image generation and morphing functions
import { neuroImageGeneration } from './functions/neuroImageGeneration'
import { morphImages } from './functions/morphImages'

/**
 * Factory function to create all Inngest functions
 * This is called AFTER secrets are loaded from Infisical
 */
export function createAllInngestFunctions(inngestClient?: any) {
  console.log('🔧 [INNGEST] Creating Inngest functions after secrets loaded...')

  const kieAiWebhookMonitorFunctions = createWebhookMonitorFunctions()
  console.log(
    `📋 Kie.ai webhook monitor functions: ${kieAiWebhookMonitorFunctions.length}`
  )

  // Create model training function using factory pattern
  let modelTrainingFunction = null
  try {
    console.log('🔄 Creating model training function...')
    modelTrainingFunction = createGenerateModelTrainingFunction(inngestClient)
    console.log('✅ Model training function created successfully', {
      type: typeof modelTrainingFunction,
      isNull: modelTrainingFunction === null,
      isUndefined: modelTrainingFunction === undefined,
      hasId: !!modelTrainingFunction?.id,
      hasName: !!modelTrainingFunction?.name,
      allKeys: Object.keys(modelTrainingFunction || {}),
    })
  } catch (error) {
    console.error('❌ Failed to create model training function:', error)
    throw error
  }

  // Create model training completed handler function
  let modelTrainingCompletedFunction = null
  try {
    console.log('🔄 Creating model training completed handler function...')
    modelTrainingCompletedFunction =
      createHandleModelTrainingCompletedFunction(inngestClient)
    console.log('✅ Model training completed handler function created successfully', {
      type: typeof modelTrainingCompletedFunction,
      isNull: modelTrainingCompletedFunction === null,
      isUndefined: modelTrainingCompletedFunction === undefined,
      hasId: !!modelTrainingCompletedFunction?.id,
      hasName: !!modelTrainingCompletedFunction?.name,
    })
  } catch (error) {
    console.error(
      '❌ Failed to create model training completed handler:',
      error
    )
    throw error
  }

  // Add webhook health guard functions (CRITICAL for video monitoring)
  const webhookHealthGuardFunctions = [
    webhookHealthCheck,
    validateWebhookBeforeGeneration,
    periodicWebhookHealthCheck,
  ]

  console.log(
    `📋 Webhook health guard functions: ${webhookHealthGuardFunctions.length}`
  )

  // Neuro image generation and morphing functions
  const mediaProcessingFunctions = [
    neuroImageGeneration,
    morphImages,
  ]

  console.log(
    `📋 Media processing functions: ${mediaProcessingFunctions.length}`
  )

  const allInngestFunctions = [
    ...kieAiWebhookMonitorFunctions,
    ...webhookHealthGuardFunctions,
    ...mediaProcessingFunctions,
    modelTrainingFunction,
    modelTrainingCompletedFunction,
  ]

  console.log(
    `✅ [INNGEST] Created ${allInngestFunctions.length} Inngest functions`
  )
  return allInngestFunctions
}
