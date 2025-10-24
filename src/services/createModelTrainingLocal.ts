import Replicate from 'replicate'
import fs from 'fs'
import { MyContext } from '@/interfaces'
import { supabase } from '@/core/supabase'
import { REPLICATE_API_TOKEN, REPLICATE_USERNAME } from '@/config'
import { logger } from '@/utils/logger'

interface ModelTrainingRequest {
  filePath: string
  triggerWord: string
  modelName: string
  telegram_id: string
  is_ru: boolean
  steps: number
  botName: string
  gender: string
}

interface ModelTrainingResponse {
  message: string
  model_id?: string
  bot_name?: string
  training_id?: string
}

/**
 * ✅ LOCAL MODEL TRAINING - Runs directly on bot-farm
 *
 * Adapted from ai-server/src/inngest-functions/generateModelTraining.ts
 *
 * This function creates model training directly on Replicate without
 * using external AI server, reducing latency and server costs.
 */
export async function createModelTrainingLocal(
  requestData: ModelTrainingRequest,
  ctx: MyContext
): Promise<ModelTrainingResponse> {
  const startTime = Date.now()

  console.log('[LOCAL TRAINING] 🚀 Starting model training on bot-farm')
  console.log('[LOCAL TRAINING] Request data:', {
    modelName: requestData.modelName,
    triggerWord: requestData.triggerWord,
    telegram_id: requestData.telegram_id,
    gender: requestData.gender,
    steps: requestData.steps,
  })

  try {
    // ✅ STEP 1: Validate Replicate credentials
    if (!REPLICATE_API_TOKEN || !REPLICATE_USERNAME) {
      throw new Error('❌ Missing REPLICATE_API_TOKEN or REPLICATE_USERNAME in .env')
    }

    // ✅ STEP 2: Validate ZIP file exists
    if (!fs.existsSync(requestData.filePath)) {
      throw new Error(`❌ ZIP file not found: ${requestData.filePath}`)
    }

    const fileStats = fs.statSync(requestData.filePath)
    logger.info('[LOCAL TRAINING] ZIP file validated', {
      size: fileStats.size,
      path: requestData.filePath,
    })

    // ✅ STEP 3: Check for existing active training (prevent duplicates)
    const { data: existingTrainings } = await supabase
      .from('model_trainings')
      .select('id, replicate_training_id, status')
      .eq('user_id', requestData.telegram_id)
      .eq('model_name', requestData.modelName)
      .in('status', ['starting', 'processing'])
      .order('created_at', { ascending: false })
      .limit(1)

    if (existingTrainings && existingTrainings.length > 0) {
      const existing = existingTrainings[0]
      logger.warn('[LOCAL TRAINING] Active training already exists', {
        training_id: existing.replicate_training_id,
        status: existing.status,
      })

      throw new Error(
        requestData.is_ru
          ? '⚠️ Тренировка этой модели уже запущена. Пожалуйста, подождите.'
          : '⚠️ Training for this model is already running. Please wait.'
      )
    }

    // ✅ STEP 4: Initialize Replicate client
    const replicate = new Replicate({
      auth: REPLICATE_API_TOKEN,
    })

    // ✅ STEP 5: Prepare file as base64 data URI for Replicate
    logger.info('[LOCAL TRAINING] Converting ZIP to base64...')
    const fileBuffer = fs.readFileSync(requestData.filePath)
    const base64Data = fileBuffer.toString('base64')
    const dataUri = `data:application/zip;base64,${base64Data}`

    logger.info('[LOCAL TRAINING] Base64 conversion complete', {
      originalSize: fileBuffer.length,
      base64Length: base64Data.length,
    })

    // ✅ STEP 6: Create training on Replicate
    const model = 'ostris/flux-dev-lora-trainer'
    const version = 'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497'
    const destination = `${REPLICATE_USERNAME}/${requestData.modelName}`

    logger.info('[LOCAL TRAINING] Creating Replicate training...', {
      model,
      version,
      destination,
      steps: requestData.steps,
    })

    const training = await replicate.trainings.create(
      'ostris', // owner
      'flux-dev-lora-trainer', // model name
      version, // version ID
      {
        destination: destination as `${string}/${string}`,
        input: {
          input_images: dataUri,
          trigger_word: requestData.triggerWord,
          steps: requestData.steps,
          // ✅ Hardware optimization from ai-server
          lora_rank: 128,
          optimizer: 'adamw8bit',
          batch_size: 1,
          resolution: '512,768,1024',
          learning_rate: 0.0001,
          wandb_project: 'flux_train_replicate',
        },
        // ✅ Webhook URL for status updates (optional)
        // webhook: `${process.env.SERVER_API_URL}/api/webhooks/replicate`,
        // webhook_events_filter: ['completed'],
      }
    )

    logger.info('[LOCAL TRAINING] ✅ Training created successfully', {
      training_id: training.id,
      status: training.status,
      destination,
      elapsed: `${Date.now() - startTime}ms`,
    })

    // ✅ STEP 7: Save training record to Supabase
    const trainingRecord = {
      user_id: requestData.telegram_id,
      model_name: requestData.modelName,
      trigger_word: requestData.triggerWord,
      zip_url: requestData.filePath, // Local path for reference
      replicate_training_id: training.id,
      status: training.status,
      // Additional metadata
      created_at: new Date().toISOString(),
    }

    const { error: dbError } = await supabase
      .from('model_trainings')
      .insert(trainingRecord)

    if (dbError) {
      logger.error('[LOCAL TRAINING] Database error (non-fatal)', {
        error: dbError.message,
        telegram_id: requestData.telegram_id,
      })
      // Don't throw - training already started successfully
    } else {
      logger.info('[LOCAL TRAINING] Training record saved to database')
    }

    // ✅ STEP 8: Clean up local ZIP file
    try {
      await fs.promises.unlink(requestData.filePath)
      logger.info('[LOCAL TRAINING] Local ZIP file deleted')
    } catch (unlinkError) {
      logger.warn('[LOCAL TRAINING] Failed to delete ZIP (non-fatal)', {
        error: unlinkError instanceof Error ? unlinkError.message : String(unlinkError),
      })
    }

    // ✅ STEP 9: Return success response
    const successMessage = requestData.is_ru
      ? `✅ Тренировка модели запущена!\n\n📦 Модель: ${requestData.modelName}\n🆔 ID: ${training.id}\n⏱️ Время: ~1-2 часа`
      : `✅ Model training started!\n\n📦 Model: ${requestData.modelName}\n🆔 ID: ${training.id}\n⏱️ Time: ~1-2 hours`

    return {
      message: successMessage,
      model_id: destination,
      bot_name: requestData.botName,
      training_id: training.id,
    }
  } catch (error) {
    logger.error('[LOCAL TRAINING] ❌ Error occurred', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      telegram_id: requestData.telegram_id,
      elapsed: `${Date.now() - startTime}ms`,
    })

    // Clean up file on error
    try {
      if (fs.existsSync(requestData.filePath)) {
        await fs.promises.unlink(requestData.filePath)
        logger.info('[LOCAL TRAINING] ZIP file cleaned up after error')
      }
    } catch (unlinkError) {
      logger.warn('[LOCAL TRAINING] Failed to cleanup ZIP on error', {
        error: unlinkError instanceof Error ? unlinkError.message : String(unlinkError),
      })
    }

    // User-friendly error message
    const errorMessage = requestData.is_ru
      ? `❌ Ошибка при запуске тренировки:\n${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
      : `❌ Error starting training:\n${error instanceof Error ? error.message : 'Unknown error'}`

    throw new Error(errorMessage)
  }
}
