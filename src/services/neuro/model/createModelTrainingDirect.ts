import { MyContext } from '@/interfaces/telegram-bot.interface'
import { logger } from '@/utils/logger'
import { API_URL } from '@/config'
import {
  ModelTrainingConfig,
  validateModelFile,
  uploadModelFile,
  cleanupModelFiles,
  getModelTrainingMessages,
  generateModelRequestId,
} from '@/services/shared/model.utils'
import { replicate } from '@/core/replicate'
import { ModeEnum } from '@/interfaces/modes'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import { TransactionType } from '@/interfaces/payments.interface'
import { inngest } from '@/inngest-functions/clients'

interface ReplicateTrainingResponse {
  id: string
  status: string
  urls?: {
    cancel?: string
  }
}

export interface ModelTrainingDirectResult {
  success: boolean
  error?: string
  requestId?: string
  trainingId?: string
}

export const createModelTrainingDirect = async (
  ctx: MyContext,
  filePath: string,
  config: ModelTrainingConfig,
  sendMessage = true
): Promise<ModelTrainingDirectResult> => {
  const requestId = generateModelRequestId(config.telegram_id, config.modelName)

  try {
    logger.info({
      message: '🚀 Starting digital avatar training with Replicate',
      modelName: config.modelName,
      telegram_id: config.telegram_id,
      requestId,
    })

    // 1. Оплата: рассчитываем стоимость и списываем средства
    const cost = calculateModeCost({ mode: ModeEnum.DigitalAvatarBody, steps: config.steps }).stars
    const paymentOperationId = `model-training-${config.telegram_id}-${Date.now()}-${config.modelName}`
    await inngest.send({
      id: paymentOperationId,
      name: 'payment/process',
      data: {
        telegram_id: config.telegram_id,
        amount: cost,
        is_ru: config.is_ru,
        bot_name: config.botName,
        type: TransactionType.MONEY_EXPENSE,
        description: `Оплата за обучение модели ${config.modelName} (${config.steps} шагов)`,
        operation_id: paymentOperationId,
        service_type: ModeEnum.DigitalAvatarBodyV2,
        metadata: {
          service_type: ModeEnum.DigitalAvatarBodyV2,
          model_name: config.modelName,
          steps: config.steps,
        },
      },
    })

    // Validate file
    const modelFile = await validateModelFile(filePath)

    // Upload file
    const uploadResult = await uploadModelFile(modelFile)
    if (!uploadResult.success || !uploadResult.url) {
      throw new Error(uploadResult.error || 'Failed to upload model file')
    }

    // Get Replicate username from env
    const username = process.env.REPLICATE_USERNAME
    if (!username) {
      throw new Error('REPLICATE_USERNAME not set')
    }

    // Create or get existing model
    let destination: string
    try {
      const existing = await replicate.models.get(username, config.modelName)
      logger.info({
        message: '🔵 Existing model found:',
        url: existing.url,
      })
      destination = `${username}/${config.modelName}`
    } catch (error) {
      logger.info({
        message: '🏗️ Creating new model...',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      const newModel = await replicate.models.create(username, config.modelName, {
        description: `LoRA: ${config.triggerWord}`,
        visibility: 'public',
        hardware: 'gpu-t4',
      })
      logger.info({
        message: '✅ New model created:',
        url: newModel.url,
      })
      destination = `${username}/${config.modelName}`
    }

    // Start training
    const training = await replicate.trainings.create(
      'ostris',
      'flux-dev-lora-trainer',
      'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
      {
        destination: destination as `${string}/${string}`,
        input: {
          input_images: uploadResult.url,
          trigger_word: config.triggerWord,
          steps: config.steps,
          lora_rank: 128,
          optimizer: 'adamw8bit',
          batch_size: 1,
          resolution: '512,768,1024',
          learning_rate: 0.0001,
          wandb_project: 'flux_train_replicate',
        },
        webhook: `${API_URL}/webhooks/replicate`,
        webhook_events_filter: ['completed'],
      }
    )

    logger.info({
      message: '✅ Training started successfully in Replicate',
      trainingId: training.id,
      requestId,
    })

    // Cleanup temporary files
    await cleanupModelFiles(filePath)

    if (sendMessage) {
      const messages = getModelTrainingMessages(config.is_ru)
      await ctx.reply(messages.success, { parse_mode: 'HTML' })
    }

    return {
      success: true,
      requestId,
      trainingId: training.id,
    }

  } catch (error) {
    logger.error({
      message: '❌ Error in digital avatar training',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      requestId,
    })

    if (sendMessage) {
      const messages = getModelTrainingMessages(config.is_ru)
      await ctx.reply(messages.error(error instanceof Error ? error.message : 'Unknown error'), {
        parse_mode: 'HTML',
      })
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId,
    }
  }
}