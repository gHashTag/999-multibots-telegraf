import { replicate } from '../../src/core/replicate'
import { VIDEO_MODELS_CONFIG } from '../../src/modules/videoGenerator/config/models.config'
import { logger } from '../../src/utils/logger'

const TEST_MODEL_ID = 'kling-v1.6-pro'
// TODO: Заменить на реальный URL изображения, доступный для Replicate, или реализовать загрузку файла
const TEST_IMAGE_URL =
  'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/landingpage/avatars/neuro_blogger_bot/flux_pro.jpeg' // Это пример URL видео, нужен URL изображения
const TEST_PROMPT = 'A beautiful sunset over the mountains, cinematic lighting'

describe('Replicate Kling Video Generation Cost Test', () => {
  it('should run a video generation and log predict_time and estimated cost', async () => {
    logger.info('[ReplicateCostTest] Starting test...')

    const modelConfig = VIDEO_MODELS_CONFIG[TEST_MODEL_ID]
    if (!modelConfig || !modelConfig.api?.model || !modelConfig.imageKey) {
      logger.error(
        `[ReplicateCostTest] Model config not found or incomplete for ${TEST_MODEL_ID}`
      )
      throw new Error(
        `Model config not found or incomplete for ${TEST_MODEL_ID}`
      )
    }

    const replicateModelId = modelConfig.api.model
    const pricePerSecond = modelConfig.basePrice

    logger.info(
      `[ReplicateCostTest] Using model: ${replicateModelId}, pricePerSecond: ${pricePerSecond}`
    )
    logger.info(
      '[ReplicateCostTest] >>> ГУРУ, ПОЖАЛУЙСТА, ЗАФИКСИРУЙТЕ ТЕКУЩИЙ БАЛАНС REPLICATE ПЕРЕД ПРОДОЛЖЕНИЕМ! <<<'
    )

    // Ожидание подтверждения от Гуру (симуляция).
    // В реальном сценарии здесь может быть пауза или запрос подтверждения.
    await new Promise(resolve => setTimeout(resolve, 5000)) // Пауза 5 секунд для Гуру

    let predictionResult: any
    try {
      logger.info(
        `[ReplicateCostTest] Calling replicate.run for model: ${replicateModelId}`
      )
      const input = {
        ...(modelConfig.api.input || {}),
        prompt: TEST_PROMPT,
        [modelConfig.imageKey]: TEST_IMAGE_URL,
        // aspect_ratio: "16:9", // Можно добавить или взять из modelConfig если там есть
      }

      logger.info('[ReplicateCostTest] Input for Replicate:', input)
      predictionResult = await replicate.run(replicateModelId as any, { input })
      logger.info('[ReplicateCostTest] Replicate run completed.', {
        predictionResult,
      })
    } catch (error: any) {
      logger.error('[ReplicateCostTest] Error during Replicate run', {
        message: error.message,
        stack: error.stack,
        response: error.response?.data,
      })
      throw error
    }

    let predictTime: number | undefined
    if (
      predictionResult &&
      typeof predictionResult === 'object' &&
      predictionResult.metrics &&
      typeof predictionResult.metrics.predict_time === 'number'
    ) {
      predictTime = predictionResult.metrics.predict_time
    } else {
      logger.warn(
        '[ReplicateCostTest] Could not automatically extract predict_time from Replicate response. Response:',
        { predictionResult }
      )
    }

    if (predictTime !== undefined) {
      logger.info(`[ReplicateCostTest] predict_time: ${predictTime} seconds`)
      const estimatedCost = predictTime * pricePerSecond
      logger.info(
        `[ReplicateCostTest] Estimated cost (based on config price ${pricePerSecond}/sec): $${estimatedCost.toFixed(6)}`
      )
    } else {
      logger.error(
        '[ReplicateCostTest] predict_time is undefined. Cannot calculate cost automatically.'
      )
    }

    logger.info('[ReplicateCostTest] Test finished.')
    logger.info(
      '[ReplicateCostTest] >>> ГУРУ, ПОЖАЛУЙСТА, ПРОВЕРЬТЕ СПИСАНИЯ В REPLICATE И СООБЩИТЕ ФАКТИЧЕСКУЮ СТОИМОСТЬ И predict_time (если он не был получен автоматически) ДЛЯ ВЕРИФИКАЦИИ. <<<'
    )
  }, 600000) // Таймаут 10 минут
})
