/**
 * Inngest Function: Model Training (Flux LoRA) - SIMPLIFIED TEST VERSION
 *
 * Async model training with Replicate webhook callback
 *
 * Flow:
 * 1. Receive event 'model/training.start'
 * 2. Process and return success
 * 3. TODO: Add Replicate training logic
 * 4. TODO: Add Telegram notification
 */

interface ModelTrainingEvent {
  name: 'model/training.start'
  data: {
    telegram_id: string
    bot_name: string
    modelName: string
    triggerWord: string
    zipUrl: string // HTTP URL to ZIP file
    steps: number | string // Can be string from scene
    is_ru: boolean
    gender: string
  }
}

export function createGenerateModelTrainingFunction(inngest: any) {
  return inngest.createFunction(
    {
      id: 'generate-model-training',
      name: 'Model Training - Flux LoRA',
      concurrency: [
        {
          limit: 2, // Max 2 concurrent trainings
        },
      ],
      retries: 0, // No retries for training - user can restart manually
    },
    { event: 'model/training.start' },
    async ({ event, step }) => {
      try {
        const eventData = event.data as ModelTrainingEvent['data']
        const startTime = Date.now()

        // ✅ TEMPORARY: Simple test function without imports
        console.log(
          '[INNGEST TRAINING] 🚀 Starting model training (SIMPLE TEST)',
          {
            telegram_id: eventData.telegram_id,
            modelName: eventData.modelName,
            zipUrl: eventData.zipUrl,
            steps: eventData.steps,
          }
        )

        // ✅ STEP 1: Simple test - just return success
        await step.run('test-step', async () => {
          console.log('[INNGEST TRAINING] Test step executed')
          return { success: true }
        })

        console.log('[INNGEST TRAINING] About to return response')

        // Return immediately for testing
        const result = {
          success: true,
          test: true,
          message: 'Simple test function executed',
          telegram_id: eventData.telegram_id,
          elapsed_ms: Date.now() - startTime,
        }

        console.log('[INNGEST TRAINING] Returning result:', JSON.stringify(result))
        return result

        // Function simplified for testing - will add back complexity after verifying JSON response works
      } catch (error) {
        console.log('[INNGEST TRAINING] ❌ Training failed', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        })

        // Return error in a serializable format
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          telegram_id: (event.data as any)?.telegram_id || 'unknown',
        }
      }
    }
  )
}
