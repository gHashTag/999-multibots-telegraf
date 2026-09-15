// @ts-nocheck
import Replicate from 'replicate'
import fs from 'fs'
import { MyContext } from '@/interfaces'
import { supabase } from '@/core/supabase'
import { REPLICATE_API_TOKEN, REPLICATE_USERNAME, FAL_KEY } from '@/config'
import { logger } from '@/utils/logger'
import {
  sanitizeModelName,
  isValidReplicateModelName,
} from '@/helpers/sanitizeModelName'
import { trainFalFluxModel } from './trainFalFluxModel'

interface ModelTrainingRequest {
  filePath: string
  triggerWord: string
  modelName: string
  telegram_id: string
  is_ru: boolean
  steps: number
  botName: string
  gender: string
  // Новый параметр для выбора провайдера
  provider?: 'replicate' | 'fal-ai'
}

interface ModelTrainingResponse {
  message: string
  model_id?: string
  bot_name?: string
  training_id?: string
  provider?: 'replicate' | 'fal-ai'
}

/**
 * ✅ LOCAL MODEL TRAINING - Runs directly on bot-farm
 *
 * Supports multiple providers:
 * - Replicate (ostris/flux-dev-lora-trainer) - ~1-2 hours
 * - Fal.ai (fal-ai/flux-lora-portrait-trainer) - ~15-30 minutes (recommended for portraits)
 *
 * Adapted from ai-server/src/inngest-functions/generateModelTraining.ts
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
    // ✅ STEP 0: Auto-select provider if not specified
    // Fal.ai preferred for portraits (faster), Replicate as fallback
    const provider = requestData.provider || (FAL_KEY ? 'fal-ai' : 'replicate')

    logger.info('[LOCAL TRAINING] Provider selection', {
      provider,
      hasFalKey: !!FAL_KEY,
      hasReplicateCreds: !!REPLICATE_API_TOKEN && !!REPLICATE_USERNAME,
    })

    // ✅ STEP 1: Route to appropriate provider
    if (provider === 'fal-ai') {
      if (!FAL_KEY) {
        throw new Error('❌ FAL_KEY not configured, falling back to Replicate')
      }
      logger.info('[LOCAL TRAINING] Using Fal.ai provider')
      return await trainFalFluxModel(requestData, ctx)
    }

    // Replicate provider
    if (!REPLICATE_API_TOKEN || !REPLICATE_USERNAME) {
      // Называем КОНКРЕТНО отсутствующее: прежнее «TOKEN or USERNAME» не
      // позволяло понять, что именно не настроено, и одинаково выглядело в
      // обоих случаях.
      const missing = [
        !REPLICATE_API_TOKEN && 'Missing REPLICATE_API_TOKEN',
        !REPLICATE_USERNAME && 'Missing REPLICATE_USERNAME',
      ]
        .filter(Boolean)
        .join(', ')
      throw new Error(`❌ ${missing} in .env`)
    }

    logger.info('[LOCAL TRAINING] Using Replicate credentials', {
      username: REPLICATE_USERNAME,
      hasToken: !!REPLICATE_API_TOKEN,
    })

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

    // ✅ STEP 4: Replicate client
    //
    // ИСПРАВЛЕНО: комментарий утверждал, что клиент «уже инициализирован в
    // @core/replicate», но в этом файле идентификатор `replicate` НЕ был
    // объявлен вообще — импортировался только класс Replicate, который ни разу
    // не создавался. Из-за `// @ts-nocheck` в шапке файла tsc об этом молчал, а
    // ветка обучения через Replicate падала в рантайме с
    // «ReferenceError: replicate is not defined» (строки .models.get /
    // .models.create / .trainings.create ниже). Общий экспорт из
    // @core/replicate тоже не подходит: там только .run, без .models и
    // .trainings. Создаём клиента здесь.
    const replicate = new Replicate({ auth: REPLICATE_API_TOKEN })

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
        original: requestData.modelName,
      })
      modelNameSanitized = sanitizeModelName(requestData.modelName)
      logger.info('[LOCAL TRAINING] Model name sanitized', {
        original: requestData.modelName,
        sanitized: modelNameSanitized,
      })
    }

    // Ensure lowercase for Replicate API
    const modelNameLower = modelNameSanitized.toLowerCase()

    // ✅ Создаем уникальное имя модели с timestamp (чтобы избежать конфликтов)
    const uniqueModelName = `${modelNameLower}-${Date.now()}`
    const destination = `${REPLICATE_USERNAME}/${uniqueModelName}`

    logger.info('[LOCAL TRAINING] Preparing model destination...', {
      destination,
      owner: REPLICATE_USERNAME,
      originalName: requestData.modelName,
      sanitizedName: modelNameSanitized,
      timestamp: Date.now(),
    })

    // ✅ STEP 7: Check if model exists and create if needed
    let modelExists = false
    try {
      logger.info(`[LOCAL TRAINING] Checking if model exists: ${destination}`)
      await replicate.models.get(REPLICATE_USERNAME, uniqueModelName)
      logger.info(`[LOCAL TRAINING] Model ${destination} exists.`)
      modelExists = true
    } catch (error: any) {
      if (error?.response?.status === 404) {
        logger.info(
          `[LOCAL TRAINING] Model ${destination} does not exist. Creating...`
        )
        modelExists = false
      } else {
        logger.error('[LOCAL TRAINING] Error checking model existence:', error)
        throw error
      }
    }

    if (!modelExists) {
      try {
        logger.info(`[LOCAL TRAINING] Creating model ${destination}...`)
        await replicate.models.create(
          REPLICATE_USERNAME, // owner
          uniqueModelName,
          {
            description: `LoRA: ${requestData.triggerWord}`,
            visibility: 'public',
            hardware: 'gpu-l40s',
          }
        )
        logger.info(
          `[LOCAL TRAINING] ✅ Model ${destination} created successfully`
        )
        // Wait for model to be fully initialized
        await new Promise(resolve => setTimeout(resolve, 5000))
      } catch (createError: any) {
        logger.error('[LOCAL TRAINING] Failed to create model', {
          error: createError?.message || String(createError),
          owner: REPLICATE_USERNAME,
        })

        // Детальная ошибка для пользователя
        const errorMsg = createError?.message || String(createError)

        if (
          errorMsg.includes("You don't have permission") ||
          errorMsg.includes('permission')
        ) {
          // Специальное сообщение для ошибки прав
          const userMessage = requestData.is_ru
            ? `❌ Ошибка прав доступа к Replicate\n\n🔍 Проблема: Токен REPLICATE и аккаунт ${REPLICATE_USERNAME} принадлежат разным пользователям.\n\n💡 Решения:\n1. Добавьте REPLICATE_USERNAME=ghashtag в Infisical (имя аккаунта с токеном)\n2. Или используйте токен от аккаунта ghashtag\n\n🌐 Проверить аккаунт: https://replicate.com/account`
            : `❌ Access Rights Error\n\n🔍 Problem: REPLICATE token and ${REPLICATE_USERNAME} account belong to different users.\n\n💡 Solutions:\n1. Add REPLICATE_USERNAME=ghashtag to Infisical (token owner account name)\n2. Or use token from ghashtag account\n\n🌐 Check account: https://replicate.com/account`

          throw new Error(userMessage)
        }

        throw new Error(`Failed to create Replicate model: ${errorMsg}`)
      }
    }

    // ✅ STEP 8: Create training on Replicate
    const model = 'ostris/flux-dev-lora-trainer'
    const version =
      'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497'

    logger.info('[LOCAL TRAINING] Creating Replicate training...', {
      model,
      version,
      destination,
      steps: requestData.steps,
    })

    // ✅ Webhook URL для уведомлений о завершении тренировки
    // ИСПРАВЛЕНО: Гарантируем HTTPS для Replicate
    const baseUrl = process.env.BASE_WEBHOOK_URL || process.env.API_SERVER_URL
    // ВНИМАНИЕ: адрес НИГДЕ не передаётся в Replicate — он только пишется в
    // лог ниже. Поэтому отсутствие переменной не должно ронять тренировку
    // (раньше оно давало «Cannot read properties of undefined (reading
    // 'startsWith')» — падение на ровном месте). Отмечаем это явно.
    const webhookUrl = !baseUrl
      ? 'not configured (BASE_WEBHOOK_URL / API_SERVER_URL not set)'
      : baseUrl.startsWith('http')
        ? `${baseUrl}/api/webhooks/replicate`
        : `https://${baseUrl}/api/webhooks/replicate`

    logger.info('[LOCAL TRAINING] Webhook configuration', {
      webhookUrl,
      baseUrl,
      hasBaseWebhookUrl: !!process.env.BASE_WEBHOOK_URL,
      hasServerApiUrl: !!process.env.API_SERVER_URL,
    })

    // ✅ Создаем тренировку с destination (модель создана)
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
          autocaption: true,
          learning_rate: 0.0001,
          wandb_project: 'flux_train_replicate',
        },
        // ✅ Webhook отключен для локальной тренировки
        // (Replicate требует HTTPS, а BASE_WEBHOOK_URL использует HTTP)
      }
    )

    logger.info('[LOCAL TRAINING] ✅ Training created successfully', {
      training_id: training.id,
      status: training.status,
      model: 'ostris/flux-dev-lora-trainer',
      version,
      destination,
      elapsed: `${Date.now() - startTime}ms`,
    })

    // ✅ STEP 9: Save training record to Supabase
    const trainingRecord = {
      telegram_id: requestData.telegram_id, // Используем telegram_id, а не user_id
      model_name: requestData.modelName,
      trigger_word: requestData.triggerWord,
      zip_url: requestData.filePath, // Local path for reference
      replicate_training_id: training.id,
      status: 'processing', // Changed from training.status to 'processing'
      bot_name: requestData.botName,
      steps: requestData.steps,
      gender: requestData.gender,
      is_ru: requestData.is_ru,
      // Using destination model
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

    // ✅ STEP 10: Clean up local ZIP file
    try {
      await fs.promises.unlink(requestData.filePath)
      logger.info('[LOCAL TRAINING] Local ZIP file deleted')
    } catch (unlinkError) {
      logger.warn('[LOCAL TRAINING] Failed to delete ZIP (non-fatal)', {
        error:
          unlinkError instanceof Error
            ? unlinkError.message
            : String(unlinkError),
      })
    }

    // ✅ STEP 11: Return success response
    const successMessage = requestData.is_ru
      ? // promise-checked: a training report, no number any code enforces
        `✅ Тренировка модели запущена!\n\n📦 Модель: ${requestData.modelName}\n🆔 ID: ${training.id}\n⚡ Провайдер: Replicate\n⏱️ Время: ~1-2 часа`
      : `✅ Model training started!\n\n📦 Model: ${requestData.modelName}\n🆔 ID: ${training.id}\n⚡ Provider: Replicate\n⏱️ Time: ~1-2 hours`

    return {
      message: successMessage,
      model_id: `ostris/flux-dev-lora-trainer`,
      bot_name: requestData.botName,
      training_id: training.id,
      provider: 'replicate',
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
        error:
          unlinkError instanceof Error
            ? unlinkError.message
            : String(unlinkError),
      })
    }

    // User-friendly error message
    const errorMessage = requestData.is_ru
      ? `❌ Ошибка при запуске тренировки:\n${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
      : `❌ Error starting training:\n${error instanceof Error ? error.message : 'Unknown error'}`

    throw new Error(errorMessage)
  }
}
