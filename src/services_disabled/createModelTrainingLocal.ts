import Replicate from 'replicate'
import fs from 'fs'
import { MyContext } from '@/interfaces'
import { supabase } from '@/core/supabase'
import { REPLICATE_API_TOKEN, REPLICATE_USERNAME } from '@/config'
import { logger } from '@/utils/logger'
import { sanitizeModelName, isValidReplicateModelName } from '@/helpers/sanitizeModelName'

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

    // ✅ STEP 3: REMOVED duplicate training check
    // Пользователи могут запускать неограниченное количество тренировок
    // Новая тренировка просто создаст новую версию модели на Replicate
    logger.info('[LOCAL TRAINING] Starting training (no duplicate check)', {
      telegram_id: requestData.telegram_id,
      model_name: requestData.modelName,
    })

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

    // ✅ STEP 6: Sanitize and validate model name for Replicate
    let modelNameSanitized = requestData.modelName

    // If model name is not valid, sanitize it
    if (!isValidReplicateModelName(requestData.modelName)) {
      logger.warn('[LOCAL TRAINING] Invalid model name, sanitizing...', {
        original: requestData.modelName
      })
      modelNameSanitized = sanitizeModelName(requestData.modelName)
      logger.info('[LOCAL TRAINING] Model name sanitized', {
        original: requestData.modelName,
        sanitized: modelNameSanitized
      })
    }

    // Ensure lowercase for Replicate API
    const modelNameLower = modelNameSanitized.toLowerCase()
    const destination = `${REPLICATE_USERNAME}/${modelNameLower}`

    logger.info('[LOCAL TRAINING] Checking if model exists...', {
      destination,
      originalName: requestData.modelName,
      sanitizedName: modelNameSanitized,
      lowercaseName: modelNameLower
    })

    try {
      // Try to get existing model
      const existingModel = await replicate.models.get(REPLICATE_USERNAME, modelNameLower)
      logger.info('[LOCAL TRAINING] Model exists', { url: existingModel.url })
    } catch (error) {
      // Model doesn't exist, create it
      logger.info('[LOCAL TRAINING] Model not found, creating new model...', {
        username: REPLICATE_USERNAME,
        modelName: modelNameLower,
        originalName: requestData.modelName,
      })

      try {
        const newModel = await replicate.models.create(
          REPLICATE_USERNAME,
          modelNameLower,
          {
            description: `LoRA: ${requestData.triggerWord}`,
            visibility: 'public',
            hardware: 'gpu-l40s',
          }
        )
        logger.info('[LOCAL TRAINING] ✅ Model created successfully', {
          url: newModel.url,
          version: newModel.latest_version?.id,
        })

        // Wait 5 seconds for model to be fully initialized
        logger.info('[LOCAL TRAINING] Waiting 5 seconds for model initialization...')
        await new Promise(resolve => setTimeout(resolve, 5000))
      } catch (createError) {
        logger.error('[LOCAL TRAINING] Failed to create model', {
          error: createError instanceof Error ? createError.message : String(createError),
        })
        throw new Error('Failed to create Replicate model')
      }
    }

    // ✅ STEP 7: Create training on Replicate
    const model = 'ostris/flux-dev-lora-trainer'
    const version = 'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497'

    logger.info('[LOCAL TRAINING] Creating Replicate training...', {
      model,
      version,
      destination,
      steps: requestData.steps,
    })

    // ✅ Webhook URL для уведомлений о завершении тренировки
    // ИСПРАВЛЕНО: Используем локальный webhook вместо внешнего ai-server
    const webhookUrl = process.env.API_SERVER_URL
      ? `${process.env.API_SERVER_URL}/api/webhooks/replicate`
      : 'http://localhost:3000/api/webhooks/replicate'

    logger.info('[LOCAL TRAINING] Webhook configuration', {
      webhookUrl,
      hasServerApiUrl: !!process.env.SERVER_API_URL,
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
        // ✅ Webhook для получения уведомлений о завершении тренировки
        webhook: webhookUrl,
        webhook_events_filter: ['completed'],
      }
    )

    logger.info('[LOCAL TRAINING] ✅ Training created successfully', {
      training_id: training.id,
      status: training.status,
      destination,
      elapsed: `${Date.now() - startTime}ms`,
    })

    // ✅ STEP 8: Save training record to Supabase
    const trainingRecord = {
      telegram_id: requestData.telegram_id, // Используем telegram_id, а не user_id
      model_name: requestData.modelName,
      trigger_word: requestData.triggerWord,
      zip_url: requestData.filePath, // Local path for reference
      replicate_training_id: training.id,
      status: training.status,
      bot_name: requestData.botName,
      steps: requestData.steps,
      gender: requestData.gender,
      is_ru: requestData.is_ru,
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

    // ✅ STEP 9: Clean up local ZIP file
    try {
      await fs.promises.unlink(requestData.filePath)
      logger.info('[LOCAL TRAINING] Local ZIP file deleted')
    } catch (unlinkError) {
      logger.warn('[LOCAL TRAINING] Failed to delete ZIP (non-fatal)', {
        error: unlinkError instanceof Error ? unlinkError.message : String(unlinkError),
      })
    }

    // ✅ STEP 10: Return success response
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
