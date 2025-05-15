import type {
  InitiateModelTrainingPayload,
  PaymentType, // Use local PaymentType
  ReplicateTrainingResponse, // Use local ReplicateTrainingResponse
  ModelTrainingInngestEventData, // ADDED: For explicit typing of event data
  InitiateModelTrainingResult,
} from './types'
import { logger } from './utils/logger'
import { sendModuleTelegramMessage } from './utils/telegramNotifier'
import { publishDigitalAvatarTrainingEvent } from './utils/inngestPublisher' // ADDED
// import type { Training } from 'replicate' // Removed global import, using local ReplicateTrainingResponse
import {
  validateAndPrepareTrainingRequest,
  startReplicateTraining,
  TRAINING_MESSAGES,
} from './helpers/trainingHelpers'
import {
  createDigitalAvatarTraining,
  updateDigitalAvatarTraining,
} from './helpers/modelTrainingsDb'
import { getDigitalAvatarBodyConfig } from './config'
import { getDigitalAvatarUserProfile } from './helpers/userProfileDb'
import { uploadFileToPinata } from './utils/fileStorageUtils'
import { TRAINING_MESSAGES as CONST_TRAINING_MESSAGES } from './constants/messages' // CORRECTED IMPORT PATH

export type { InitiateModelTrainingPayload }

export const initiateDigitalAvatarModelTraining = async (
  telegramId: number,
  localZipPath: string,
  modelName: string,
  triggerWord: string | undefined,
  isRuLanguage: boolean,
  botName: string,
  paymentOperationTypeParam: PaymentType,
  costInStars: number,
  stepsAmount?: number,
  gender?: 'male' | 'female' | 'other'
): Promise<{ success: boolean; message: string; data?: any }> => {
  const config = getDigitalAvatarBodyConfig()
  const functionName = 'initiateDigitalAvatarModelTraining'
  logger.info(
    `[${functionName}] Initiated for user: ${telegramId}, model: ${modelName}`
  )

  const preparedData = await validateAndPrepareTrainingRequest(
    telegramId,
    '',
    modelName,
    triggerWord,
    isRuLanguage,
    botName,
    paymentOperationTypeParam,
    costInStars
  )

  if (!preparedData) {
    logger.warn(
      `[${functionName}] Validation failed or insufficient funds for user: ${telegramId}.`
    )
    return {
      success: false,
      message: 'Validation failed or insufficient funds',
    }
  }

  const { user } = preparedData

  let publicZipUrl: string
  try {
    publicZipUrl = 'http://example.com/mock-zip-url.zip'
    if (!publicZipUrl) {
      throw new Error('Failed to get public URL for zip file')
    }
  } catch (error: any) {
    logger.error(
      `[${functionName}] Error during public URL generation for user: ${telegramId}`,
      error
    )
    await sendModuleTelegramMessage(
      String(telegramId),
      TRAINING_MESSAGES.error(
        isRuLanguage ? 'Ошибка подготовки файла' : 'File preparation error'
      )[isRuLanguage ? 'ru' : 'en'],
      botName
    )
    return { success: false, message: 'File processing error' }
  }

  const dbTrainingRecord = await createDigitalAvatarTraining({
    user_id: String(user.id),
    telegram_id: String(telegramId),
    model_name: modelName,
    zip_url: publicZipUrl,
    trigger_word: triggerWord,
    status: 'PENDING_INNGST',
    gender: gender,
    steps_amount: stepsAmount,
    cost_in_stars: costInStars,
    bot_name: botName,
    api: 'replicate',
  })

  if (!dbTrainingRecord || !dbTrainingRecord.id) {
    logger.error(
      `[${functionName}] Failed to create DB record for user: ${telegramId}`
    )
    await sendModuleTelegramMessage(
      String(telegramId),
      TRAINING_MESSAGES.error(
        isRuLanguage ? 'Ошибка сохранения данных' : 'Data saving error'
      )[isRuLanguage ? 'ru' : 'en'],
      botName
    )
    return { success: false, message: 'DB record creation failed' }
  }
  const currentTrainingDbId = dbTrainingRecord.id

  if (
    config.inngestEventNameGenerateModelTraining &&
    !config.isDevEnvironment
  ) {
    try {
      const eventData: ModelTrainingInngestEventData = {
        telegram_id: String(telegramId),
        zipUrl: publicZipUrl,
        model_name: modelName,
        trigger_word: triggerWord,
        is_ru: isRuLanguage,
        bot_name: botName,
        operation_type_for_refund: paymentOperationTypeParam,
        calculatedCost: costInStars,
        steps: stepsAmount,
        gender: gender,
        trainingDbIdFromEvent: String(currentTrainingDbId),
        user_replicate_username: user.replicate_username ?? '',
        user_api: user.api ?? '',
      }
      await publishDigitalAvatarTrainingEvent(
        config.inngestEventNameGenerateModelTraining,
        eventData,
        { telegram_id: String(telegramId) }
      )
      logger.info(
        `[${functionName}] Inngest event sent via publisher for user: ${telegramId}, model: ${modelName}`
      )
      return {
        success: true,
        message: isRuLanguage
          ? 'Запрос на обучение модели принят и поставлен в очередь.'
          : 'Model training request accepted and queued.',
        data: { plan: 'A', db_id: currentTrainingDbId },
      }
    } catch (error) {
      logger.error(
        `[${functionName}] Error sending Inngest event via publisher for user: ${telegramId}, model: ${modelName}`,
        { error }
      )
    }
  }

  logger.info(
    `[${functionName}] Proceeding with Plan B for user: ${telegramId}, model: ${modelName}`
  )
  let replicateTraining: ReplicateTrainingResponse | undefined
  try {
    replicateTraining = await startReplicateTraining(
      user,
      modelName,
      publicZipUrl,
      triggerWord || 'woman',
      stepsAmount
    )

    if (!replicateTraining || !replicateTraining.id) {
      throw new Error('Replicate training failed to start or returned no ID')
    }

    logger.info(
      `[${functionName}] Replicate training started (Plan B) for user: ${telegramId}, replicate_id: ${replicateTraining.id}`
    )

    await updateDigitalAvatarTraining(String(currentTrainingDbId), {
      replicate_training_id: replicateTraining.id,
      status: 'PROCESSING',
    })

    await sendModuleTelegramMessage(
      String(telegramId),
      TRAINING_MESSAGES.start[isRuLanguage ? 'ru' : 'en'],
      botName
    )

    return {
      success: true,
      message: isRuLanguage
        ? 'Обучение модели запущено напрямую. Ожидайте уведомления о завершении.'
        : 'Model training started directly. Wait for completion notification.',
      data: {
        plan: 'B',
        replicate_id: replicateTraining.id,
        db_id: currentTrainingDbId,
      },
    }
  } catch (error: any) {
    logger.error(
      `[${functionName}] Error during Plan B Replicate training for user: ${telegramId}`,
      { error: error.message, stack: error.stack }
    )

    await updateDigitalAvatarTraining(String(currentTrainingDbId), {
      replicate_training_id: null,
      status: 'FAILED',
      error: error.message || 'Unknown Replicate error (Plan B)',
    })

    await sendModuleTelegramMessage(
      String(telegramId),
      TRAINING_MESSAGES.error(
        isRuLanguage
          ? 'Ошибка при запуске обучения (План Б)'
          : 'Training start error (Plan B)'
      )[isRuLanguage ? 'ru' : 'en'],
      botName
    )

    return {
      success: false,
      message: `Plan B failed: ${error.message}`,
      data: { plan: 'B', db_id: currentTrainingDbId },
    }
  }
}
