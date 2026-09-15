import { fal } from '@fal-ai/client'
import * as fs from 'fs'
import { MyContext } from '@/interfaces'
import { supabase } from '@/core/supabase'
import { FAL_KEY } from '@/config'
import { logger } from '@/utils/logger'
import {
  sanitizeModelName,
  isValidReplicateModelName,
} from '@/helpers/sanitizeModelName'
import { PUBLIC_URL } from '@/config'

interface FalModelTrainingRequest {
  filePath: string
  triggerWord: string
  modelName: string
  telegram_id: string
  is_ru: boolean
  steps: number
  botName: string
  gender: string
  learning_rate?: number
}

interface FalModelTrainingResponse {
  message: string
  model_id?: string
  bot_name?: string
  training_id?: string
  provider: 'fal-ai'
}

/**
 * ✅ FAL.AI MODEL TRAINING - Новая оптимизированная модель для портретов
 *
 * Использует fal-ai/flux-lora-portrait-trainer для обучения LoRA моделей
 * Оптимизирована для портретной генерации с яркими бликами и детальными результатами
 */
export async function trainFalFluxModel(
  requestData: FalModelTrainingRequest,
  ctx: MyContext
): Promise<FalModelTrainingResponse> {
  const startTime = Date.now()

  console.log('[FAL TRAINING] 🚀 Starting Fal.ai model training')
  console.log('[FAL TRAINING] Request data:', {
    modelName: requestData.modelName,
    triggerWord: requestData.triggerWord,
    telegram_id: requestData.telegram_id,
    gender: requestData.gender,
    steps: requestData.steps,
    learning_rate: requestData.learning_rate,
  })

  try {
    // ✅ STEP 1: Validate Fal.ai credentials
    if (!FAL_KEY) {
      throw new Error('❌ Missing FAL_KEY in environment variables')
    }

    // Configure Fal.ai client
    fal.config({
      credentials: FAL_KEY,
    })

    // ✅ STEP 2: Validate ZIP file exists
    if (!fs.existsSync(requestData.filePath)) {
      throw new Error(`❌ ZIP file not found: ${requestData.filePath}`)
    }

    const fileStats = fs.statSync(requestData.filePath)
    logger.info('[FAL TRAINING] ZIP file validated', {
      size: fileStats.size,
      path: requestData.filePath,
    })

    // ✅ STEP 3: Read file and prepare data URL
    logger.info('[FAL TRAINING] Preparing file upload...')
    const fileBuffer = fs.readFileSync(requestData.filePath)
    const base64Data = fileBuffer.toString('base64')
    const dataUri = `data:application/zip;base64,${base64Data}`

    logger.info('[FAL TRAINING] File prepared for upload', {
      originalSize: fileBuffer.length,
      base64Length: base64Data.length,
    })

    // ✅ STEP 4: Prepare trigger phrase
    const triggerPhrase = requestData.triggerWord || 'PORTRAIT_TOKEN'

    // ВЕБХУКА ЗДЕСЬ НЕТ И НЕ БЫЛО.
    //
    // Раньше на этом месте вычислялся `${baseUrl}/api/webhooks/fal-model` и
    // писался в лог. Дальше он НИКУДА не передавался: `fal.subscribe` ниже
    // ждёт завершения прямо в этом вызове и отдаёт прогресс через
    // onQueueUpdate. То есть переменная существовала только чтобы попасть в
    // лог — и указывала на маршрут, которого в приложении нет (под
    // /api/webhooks есть только /replicate).
    //
    // Строка в логе выглядела как настройка вебхука и вводила в заблуждение
    // при разборе зависших обучений: казалось, что колбэк настроен.
    logger.info('[FAL TRAINING] Configuration', {
      triggerPhrase,
      steps: requestData.steps,
      learning_rate: requestData.learning_rate || 0.00009,
      completion: 'inline via fal.subscribe (вебхук не используется)',
    })

    // ✅ STEP 6: Submit training to Fal.ai
    logger.info(
      '[FAL TRAINING] Submitting to fal-ai/flux-lora-portrait-trainer...'
    )

    const result = await fal.subscribe('fal-ai/flux-lora-portrait-trainer', {
      input: {
        images_data_url: dataUri,
        trigger_phrase: triggerPhrase,
        steps: requestData.steps,
        learning_rate: requestData.learning_rate || 0.00009,
        multiresolution_training: true,
        subject_crop: true,
        create_masks: false,
      },
      logs: true,
      onQueueUpdate: update => {
        if (update.status === 'IN_PROGRESS') {
          update.logs
            .map(log => log.message)
            .forEach(message => {
              console.log('[FAL TRAINING]', message)
            })
        }
      },
    })

    logger.info('[FAL TRAINING] ✅ Training completed successfully', {
      training_id: result.requestId,
      elapsed: `${Date.now() - startTime}ms`,
    })

    // Extract file URLs from result
    const loraFileUrl = result.data?.diffusers_lora_file?.url
    const configFileUrl = result.data?.config_file?.url

    if (!loraFileUrl) {
      throw new Error('❌ No LoRA file URL in response')
    }

    // ✅ STEP 7: Save training record to Supabase
    const trainingRecord = {
      telegram_id: requestData.telegram_id,
      model_name: requestData.modelName,
      trigger_word: triggerPhrase,
      zip_url: requestData.filePath,
      replicate_training_id: result.requestId, // Using requestId as training identifier
      status: 'completed',
      bot_name: requestData.botName,
      steps: requestData.steps,
      gender: requestData.gender,
      is_ru: requestData.is_ru,
      provider: 'fal-ai',
      lora_url: loraFileUrl,
      config_url: configFileUrl,
      created_at: new Date().toISOString(),
    }

    const { error: dbError } = await supabase
      .from('model_trainings')
      .insert(trainingRecord)

    if (dbError) {
      logger.error('[FAL TRAINING] Database error (non-fatal)', {
        error: dbError.message,
        telegram_id: requestData.telegram_id,
      })
      // Don't throw - training already completed successfully
    } else {
      logger.info('[FAL TRAINING] Training record saved to database')
    }

    // ✅ STEP 8: Clean up local ZIP file
    try {
      await fs.promises.unlink(requestData.filePath)
      logger.info('[FAL TRAINING] Local ZIP file deleted')
    } catch (unlinkError) {
      logger.warn('[FAL TRAINING] Failed to delete ZIP (non-fatal)', {
        error:
          unlinkError instanceof Error
            ? unlinkError.message
            : String(unlinkError),
      })
    }

    // ✅ STEP 9: Return success response
    const successMessage = requestData.is_ru
      ? // promise-checked: a vendor name and a training report, no number any code enforces
        `✅ Модель обучена через Fal.ai!\n\n📦 Модель: ${requestData.modelName}\n🆔 ID: ${result.requestId}\n⚡ Провайдер: Fal.ai\n⏱️ Время: ~15-30 минут`
      : `✅ Model trained via Fal.ai!\n\n📦 Model: ${requestData.modelName}\n🆔 ID: ${result.requestId}\n⚡ Provider: Fal.ai\n⏱️ Time: ~15-30 minutes`

    return {
      message: successMessage,
      model_id: requestData.modelName,
      bot_name: requestData.botName,
      training_id: result.requestId,
      provider: 'fal-ai',
    }
  } catch (error) {
    logger.error('[FAL TRAINING] ❌ Error occurred', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      telegram_id: requestData.telegram_id,
      elapsed: `${Date.now() - startTime}ms`,
    })

    // Clean up file on error
    try {
      if (fs.existsSync(requestData.filePath)) {
        await fs.promises.unlink(requestData.filePath)
        logger.info('[FAL TRAINING] ZIP file cleaned up after error')
      }
    } catch (unlinkError) {
      logger.warn('[FAL TRAINING] Failed to cleanup ZIP on error', {
        error:
          unlinkError instanceof Error
            ? unlinkError.message
            : String(unlinkError),
      })
    }

    // User-friendly error message
    const errorMessage = requestData.is_ru
      ? `❌ Ошибка при обучении модели:\n${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
      : `❌ Error training model:\n${error instanceof Error ? error.message : 'Unknown error'}`

    throw new Error(errorMessage)
  }
}
