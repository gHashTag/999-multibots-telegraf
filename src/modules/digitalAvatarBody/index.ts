import type {
  InitiateModelTrainingPayload,
  PaymentType, // Use local PaymentType
  ReplicateTrainingResponse, // Use local ReplicateTrainingResponse
  ModelTrainingInngestEventData, // ADDED: For explicit typing of event data
  InitiateModelTrainingResult, // Import for return type
} from './types'
import { logger } from './utils/logger'
import { sendModuleTelegramMessage } from './utils/telegramNotifier'
import { publishDigitalAvatarTrainingEvent } from './utils/inngestPublisher'
import { getBotByName, BotInstanceResult } from '@/core/bot'
import { inngest } from '@/inngest_app/client' // ADDED IMPORT FOR INNGREST CLIENT
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
import { TRAINING_MESSAGES as CONST_TRAINING_MESSAGES } from './constants/messages' // Импорт для сообщений об ошибках
import { getDigitalAvatarUserProfile } from './helpers/userProfileDb'
import { uploadFileToPinata } from './utils/fileStorageUtils'

export type { InitiateModelTrainingPayload }

export async function initiateDigitalAvatarModelTraining(
  payload: InitiateModelTrainingPayload
): Promise<InitiateModelTrainingResult> {
  logger.info(
    '[DigitalAvatarBody] Received request to initiate model training.',
    { telegramId: payload.telegram_id }
  )
  const config = getDigitalAvatarBodyConfig()
  const botInfo: BotInstanceResult = getBotByName(payload.bot_name)

  if (botInfo.error || !botInfo.bot) {
    logger.error(
      `[DigitalAvatarBody] Bot instance ${payload.bot_name} not found.`,
      { telegramId: payload.telegram_id, error: botInfo.error }
    )
    return {
      success: false,
      message: 'Bot instance not found',
      data: { plan: 'A', db_id: 'error_no_db_id' },
    }
  }

  const user = await getDigitalAvatarUserProfile(String(payload.telegram_id))
  if (!user) {
    logger.error(
      '[DigitalAvatarBody] User not found for training initiation.',
      { telegramId: payload.telegram_id }
    )
    await sendModuleTelegramMessage(
      String(payload.telegram_id),
      CONST_TRAINING_MESSAGES.userNotFound[payload.is_ru ? 'ru' : 'en'],
      botInfo
    )
    return {
      success: false,
      message: 'User not found',
      data: { plan: 'A', db_id: 'error_no_db_id' },
    }
  }

  if (!payload.localZipPath) {
    logger.error('[DigitalAvatarBody] Local zip path is required.', {
      telegramId: payload.telegram_id,
    })
    await sendModuleTelegramMessage(
      String(payload.telegram_id),
      CONST_TRAINING_MESSAGES.errorGeneral[payload.is_ru ? 'ru' : 'en'],
      botInfo
    )
    return {
      success: false,
      message: 'Missing local zip path',
      data: { plan: 'A', db_id: 'error_no_db_id' },
    }
  }

  let publicZipUrlFromPinata: string
  try {
    publicZipUrlFromPinata = await uploadFileToPinata(payload.localZipPath)
    logger.info(
      `[DigitalAvatarBody] File uploaded to Pinata: ${publicZipUrlFromPinata}`,
      { telegramId: payload.telegram_id }
    )
  } catch (uploadError: any) {
    logger.error('[DigitalAvatarBody] Pinata upload failed.', {
      telegramId: payload.telegram_id,
      error: uploadError.message,
    })
    await sendModuleTelegramMessage(
      String(payload.telegram_id),
      CONST_TRAINING_MESSAGES.errorFileUpload[payload.is_ru ? 'ru' : 'en'],
      botInfo
    )
    return {
      success: false,
      message: 'Pinata upload failed',
      data: { plan: 'A', db_id: 'error_no_db_id' },
    }
  }

  // payload.publicZipUrl = 'http://example.com/mock-zip-url.zip' // ЗАГЛУШКА УДАЛЕНА

  const cacheId = `${payload.telegram_id}-${payload.model_name}`

  const preparationResult = await validateAndPrepareTrainingRequest(
    Number(payload.telegram_id),
    publicZipUrlFromPinata,
    payload.model_name,
    payload.trigger_word,
    payload.is_ru,
    payload.bot_name,
    payload.operation_type_for_refund,
    payload.calculatedCost
  )

  if (!preparationResult) {
    logger.warn(
      `[DigitalAvatarBody] Validation failed or insufficient funds for user: ${payload.telegram_id}.`
    )
    return {
      success: false,
      message: 'Insufficient funds or validation failed',
      data: { plan: 'A', db_id: 'error_no_db_id' },
    }
  }

  const validatedUser = preparationResult.user
  const finalCostInStars = preparationResult.costInStars

  // Создаем запись в БД БЕЗ zip_url
  const dbTrainingRecord = await createDigitalAvatarTraining({
    user_id: validatedUser.id,
    telegram_id: String(payload.telegram_id),
    model_name: payload.model_name,
    trigger_word: payload.trigger_word,
    // zip_url: publicZipUrlFromPinata, // НЕ СОХРАНЯЕМ URL ОБУЧАЮЩИХ ДАННЫХ В БД
    public_url: payload.publicUrl, // Оставляем это поле, если оно имеет другое назначение
    steps_amount: payload.stepsAmount,
    status: 'PENDING_INNGST',
    gender: payload.gender,
    cost_in_stars: finalCostInStars,
    bot_name: payload.bot_name,
    api: 'replicate',
  })

  if (!dbTrainingRecord || !dbTrainingRecord.id) {
    logger.error(
      `[DigitalAvatarBody] Failed to create DB record for user: ${payload.telegram_id}`
    )
    await sendModuleTelegramMessage(
      String(payload.telegram_id),
      CONST_TRAINING_MESSAGES.error(
        payload.is_ru ? 'Ошибка сохранения данных' : 'Data saving error'
      )[payload.is_ru ? 'ru' : 'en'],
      botInfo
    )
    return {
      success: false,
      message: 'DB record creation failed',
      data: { plan: 'A', db_id: 'error_no_db_id' },
    }
  }
  const currentTrainingDbId = dbTrainingRecord.id

  if (
    config.inngestEventNameGenerateModelTraining &&
    !config.isDevEnvironment
  ) {
    try {
      const eventData: ModelTrainingInngestEventData = {
        telegram_id: String(payload.telegram_id),
        zipUrl: publicZipUrlFromPinata,
        model_name: payload.model_name,
        trigger_word: payload.trigger_word,
        is_ru: payload.is_ru,
        bot_name: payload.bot_name,
        operation_type_for_refund: payload.operation_type_for_refund,
        calculatedCost: payload.calculatedCost,
        steps: payload.steps,
        gender: payload.gender,
        trainingDbIdFromEvent: String(currentTrainingDbId),
        user_replicate_username: validatedUser.replicate_username ?? '',
        user_api: validatedUser.api ?? '',
      }
      await publishDigitalAvatarTrainingEvent(
        inngest,
        config.inngestEventNameGenerateModelTraining,
        eventData,
        { telegram_id: String(payload.telegram_id) }
      )
      logger.info(
        `[DigitalAvatarBody] Inngest event sent via publisher for user: ${payload.telegram_id}, model: ${payload.model_name}`
      )
      return {
        success: true,
        message: payload.is_ru
          ? 'Запрос на обучение модели принят и поставлен в очередь.'
          : 'Model training request accepted and queued.',
        data: { plan: 'A', db_id: currentTrainingDbId },
      }
    } catch (error) {
      logger.error(
        `[DigitalAvatarBody] Error sending Inngest event via publisher for user: ${payload.telegram_id}, model: ${payload.model_name}`,
        { error }
      )
      await sendModuleTelegramMessage(
        String(payload.telegram_id),
        CONST_TRAINING_MESSAGES.error(
          payload.is_ru
            ? 'Ошибка отправки Inngest события'
            : 'Inngest event sending error'
        )[payload.is_ru ? 'ru' : 'en'],
        botInfo
      )
      return {
        success: false,
        message: 'Error sending Inngest event',
        data: { plan: 'A', db_id: currentTrainingDbId },
      }
    }
  }

  logger.info(
    `[DigitalAvatarBody] Proceeding with Plan B for user: ${payload.telegram_id}, model: ${payload.model_name}`
  )
  let replicateTraining: ReplicateTrainingResponse | undefined
  try {
    replicateTraining = await startReplicateTraining(
      validatedUser,
      payload.model_name,
      publicZipUrlFromPinata,
      payload.trigger_word || 'woman',
      payload.steps
    )

    if (!replicateTraining || !replicateTraining.id) {
      throw new Error('Replicate training failed to start or returned no ID')
    }

    logger.info(
      `[DigitalAvatarBody] Replicate training started (Plan B) for user: ${payload.telegram_id}, replicate_id: ${replicateTraining.id}`
    )

    await updateDigitalAvatarTraining(String(currentTrainingDbId), {
      replicate_training_id: replicateTraining.id,
      status: 'PROCESSING',
    })

    await sendModuleTelegramMessage(
      String(payload.telegram_id),
      CONST_TRAINING_MESSAGES.start[payload.is_ru ? 'ru' : 'en'],
      botInfo
    )

    return {
      success: true,
      message: payload.is_ru
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
      `[DigitalAvatarBody] Error during Plan B Replicate training for user: ${payload.telegram_id}`,
      { error: error.message, stack: error.stack }
    )

    await updateDigitalAvatarTraining(String(currentTrainingDbId), {
      replicate_training_id: null,
      status: 'FAILED',
      error: error.message || 'Unknown Replicate error (Plan B)',
    })

    await sendModuleTelegramMessage(
      String(payload.telegram_id),
      CONST_TRAINING_MESSAGES.error(
        payload.is_ru
          ? 'Ошибка при запуске обучения (План Б)'
          : 'Training start error (Plan B)'
      )[payload.is_ru ? 'ru' : 'en'],
      botInfo
    )

    return {
      success: false,
      message: `Plan B failed: ${error.message}`,
      data: { plan: 'B', db_id: currentTrainingDbId },
    }
  }
}
