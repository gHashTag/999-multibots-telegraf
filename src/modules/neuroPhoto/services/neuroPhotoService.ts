import {
  NeuroPhotoServiceDependencies,
  GetLatestUserModelFn,
  GetUserDataFn,
  SavePromptDirectFn,
  GetAspectRatioFn,
  GetUserByTelegramIdStringFn,
  UpdateUserLevelPlusOneFn,
  NeuroPhotoOverallResult,
  NeuroPhotoServiceResultItem,
  NeuroPhotoErrorItem,
  NeuroPhotoSuccessItem,
  GenerateV2Params,
} from '../interfaces/neuroPhotoDependencies.interface'
import { BotName } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/modes' // Потребуется для service_type в savePromptDirect и т.д.
import { ApiResponse } from '@/interfaces/api.interface'
import { MediaPulseOptions } from '@/helpers/pulse'
import { PaymentType } from '@/interfaces/payments.interface'
import path from 'path'

// Типы для параметров функций, чтобы избежать дублирования и для ясности
export interface GenerateV1Params {
  prompt: string
  userModelUrl: string // Прямой URL модели Replicate, специфичный для V1
  numImages: number
  telegramId: string
  username: string
  isRu: boolean
  botName: BotName
  // Возможно, другие параметры, которые раньше извлекались из ctx или сессии для V1
  // например, bypass_payment_check, если он отличается от V2
  bypassPaymentCheck?: boolean
  // Опция для управления отправкой сообщений извне, если это будет необходимо
  // disableTelegramSending?: boolean;
}

export async function generateNeuroPhotoV1(
  params: GenerateV1Params,
  dependencies: NeuroPhotoServiceDependencies
): Promise<NeuroPhotoOverallResult> {
  dependencies.logInfo({
    message: 'neuroPhotoService.generateNeuroPhotoV1 called',
    details: {
      prompt: params.prompt.substring(0, 50) + '...',
      userModelUrl: params.userModelUrl,
      numImages: params.numImages,
      telegramId: params.telegramId,
      botName: params.botName,
      bypassPaymentCheck: params.bypassPaymentCheck,
    },
  })

  // Вспомогательная функция для создания объекта ошибки, специфичная для этого сервиса,
  // чтобы избежать дублирования при создании NeuroPhotoErrorItem для NeuroPhotoOverallResult
  const createErrorOverallResult = (
    errorKey: string,
    logMessage: string,
    userMessageRu: string,
    userMessageEn: string,
    details?: Record<string, any>
  ): NeuroPhotoOverallResult => {
    dependencies.logError({
      message: `[V1_SERVICE] ${logMessage}`,
      telegramId: params.telegramId,
      details: details || { errorKey },
    })
    return {
      status: 'error',
      message: params.isRu ? userMessageRu : userMessageEn,
      results: [
        {
          success: false,
          error: errorKey,
          errorMessage: params.isRu ? userMessageRu : userMessageEn,
          originalPrompt: params.prompt,
          // другие поля NeuroPhotoErrorItem по умолчанию null или undefined
        } as NeuroPhotoErrorItem, // Явное приведение типа
      ],
    }
  }

  try {
    if (!params.prompt) {
      return createErrorOverallResult(
        'NO_PROMPT',
        'Отсутствует промпт для генерации',
        'Промпт не указан.',
        'Prompt not provided.'
      )
    }

    if (!params.userModelUrl) {
      return createErrorOverallResult(
        'NO_MODEL_URL',
        'Отсутствует URL модели для генерации',
        'URL модели не указан.',
        'Model URL not provided.'
      )
    }

    const validNumImages =
      params.numImages && params.numImages > 0 ? params.numImages : 1

    const user = await dependencies.getUserByTelegramIdString(params.telegramId)
    if (!user) {
      return createErrorOverallResult(
        'USER_NOT_FOUND',
        'Пользователь не найден в базе данных',
        'Ваш аккаунт не найден. Пожалуйста, перезапустите бота (/start).',
        'Your account was not found. Please restart the bot (/start).'
      )
    }

    dependencies.logInfo({
      message: '[V1_SERVICE] Пользователь найден в базе данных',
      telegramId: params.telegramId,
      userIdDb: user.id, // Предполагаем, что у типа User есть id
    })

    // Шаг 2: Обновление уровня пользователя (если необходимо)
    // TODO: Критически пересмотреть необходимость этой логики именно здесь.
    // Возможно, это должно быть частью другого процесса или управляться иначе.
    // Пока переносим как есть для сохранения оригинального поведения.
    if (user.level === 1) {
      // Оригинальная логика имела user.level === 1
      // В оригинале был странный if (!user.level), который всегда false, если user.level === 1.
      // Оставляем более простое обновление.
      await dependencies.updateUserLevelPlusOne(params.telegramId, user.level)
      dependencies.logInfo({
        message: '[V1_SERVICE] Уровень пользователя обновлен',
        telegramId: params.telegramId,
        oldLevel: user.level,
        newLevel: user.level + 1, // Предполагаемое новое значение
      })
    }

    // Шаг 3: Расчет стоимости
    dependencies.logInfo({
      message: '[V1_SERVICE] Расчет стоимости генерации',
      details: {
        numImages: validNumImages,
        mode: ModeEnum.NeuroPhoto,
        telegramId: params.telegramId,
      },
    })
    const costResult = dependencies.calculateModeCost({
      mode: ModeEnum.NeuroPhoto, // V1 всегда использует этот режим для стоимости
      steps: validNumImages,
    })
    // Убедимся, что costResult.stars это число или может быть преобразовано в число
    const costPerImage = Number(costResult.stars)
    if (isNaN(costPerImage)) {
      return createErrorOverallResult(
        'COST_CALCULATION_ERROR',
        'Некорректная стоимость за изображение',
        'Ошибка расчета стоимости.',
        'Error calculating cost.',
        { costResultStars: costResult.stars }
      )
    }
    const totalCost = costPerImage * validNumImages
    dependencies.logInfo({
      message: '[V1_SERVICE] Рассчитана стоимость генерации',
      details: {
        costPerImage,
        // totalCost, // Уже есть ниже
        numImages: validNumImages,
        telegramId: params.telegramId,
      },
      totalCost, // Добавим totalCost в лог для наглядности
    })

    // Шаг 4: Обработка платежа
    const paymentOperationId = `payment-${params.telegramId}-${Date.now()}-${validNumImages}-${dependencies.generateUUID()}`
    dependencies.logInfo({
      message: '[V1_SERVICE] Обработка оплаты',
      details: {
        telegramId: params.telegramId,
        totalCost,
        paymentOperationId,
        bypassPaymentCheck: params.bypassPaymentCheck,
      },
    })

    let paymentProcessError: string | undefined = undefined // Для хранения ошибки платежа
    if (!params.bypassPaymentCheck && totalCost > 0) {
      const paymentDescription = params.isRu
        ? `Генерация ${validNumImages} изображений нейрофото V1`
        : `Generation of ${validNumImages} neuroimages V1`

      const paymentResult = await dependencies.directPaymentProcessor({
        telegram_id: params.telegramId,
        amount: totalCost,
        type: PaymentType.MONEY_OUTCOME,
        description: paymentDescription,
        bot_name: params.botName,
        service_type: ModeEnum.NeuroPhoto, // Убедимся, что ModeEnum корректно используется
        inv_id: paymentOperationId, // Используем ранее сгенерированный ID
        metadata: {
          prompt: params.prompt,
          userModelUrl: params.userModelUrl,
          numImages: validNumImages,
        },
      })

      if (!paymentResult.success) {
        paymentProcessError =
          paymentResult.error ||
          (params.isRu ? 'Ошибка оплаты.' : 'Payment error.')
        dependencies.logError({
          message: '[V1_SERVICE] Ошибка оплаты',
          telegramId: params.telegramId,
          error: paymentProcessError,
        })
        return {
          status: 'error',
          message: paymentProcessError,
          results: [
            {
              success: false,
              error: 'PAYMENT_ERROR',
              errorMessage: paymentProcessError,
              originalPrompt: params.prompt,
            } as NeuroPhotoErrorItem,
          ],
          cost: totalCost, // Стоимость была рассчитана
          paymentError: paymentProcessError,
        }
      }
      dependencies.logInfo({
        message: '[V1_SERVICE] Оплата прошла успешно',
        telegramId: params.telegramId,
        paymentId: paymentResult.payment_id,
      })
    }

    // Шаг 5: Подготовка к вызову Replicate и сама генерация
    const individualResults: NeuroPhotoServiceResultItem[] = [] // Переименовали и типизировали
    let userAspectRatio = null // Инициализация
    try {
      userAspectRatio = await dependencies.getAspectRatio(
        Number(params.telegramId)
      )
    } catch (e: any) {
      dependencies.logWarn({
        message:
          '[V1_SERVICE] Не удалось получить аспект-ратио пользователя, используется значение по умолчанию.',
        telegramId: params.telegramId,
        error: e.message,
      })
    }
    const aspectRatioToUse = userAspectRatio || '1:1'

    // Цикл генерации изображений
    for (let i = 0; i < validNumImages; i++) {
      const imageStartTime = Date.now()
      let currentImageUrl: string | undefined
      let currentLocalPath: string | undefined
      let currentPromptId: string | null = null
      const currentIsNsfw = false
      let replicateId: string | undefined

      try {
        dependencies.logInfo({
          message: `[V1_SERVICE] Начало генерации изображения ${i + 1}/${validNumImages}`,
          telegramId: params.telegramId,
        })

        const replicateInput: any = {
          prompt: params.prompt, // Добавляем другие необходимые параметры для модели
          // num_outputs: 1, // Replicate обычно генерирует по одному, если не указано иное
        }

        // Пример добавления параметров аспект-ратио, если модель их поддерживает
        // Это нужно будет адаптировать под конкретную модель, используемую в params.userModelUrl
        // if (params.userModelUrl.includes('sdxl')) { // Пример
        //   const [w, h] = aspectRatioToUse.split(':').map(Number);
        //   replicateInput.width = w * 512; // Примерное масштабирование
        //   replicateInput.height = h * 512;
        // }

        // Вызов Replicate
        const replicateResponse = await dependencies.replicateRun(
          params.userModelUrl,
          {
            input: replicateInput,
          }
        )

        replicateId = replicateResponse.id
        dependencies.logInfo({
          message: '[V1_SERVICE] Ответ от Replicate получен',
          telegramId: params.telegramId,
          replicateId: replicateId,
          status: replicateResponse.status,
        })

        if (
          replicateResponse.status === 'failed' ||
          replicateResponse.status === 'canceled'
        ) {
          let errorMsg = 'Replicate job failed or was canceled.'
          if (replicateResponse.error) {
            // Пытаемся извлечь более детальную ошибку
            if (typeof replicateResponse.error === 'string') {
              errorMsg = replicateResponse.error
            } else if (
              typeof replicateResponse.error === 'object' &&
              replicateResponse.error !== null
            ) {
              // Replicate может возвращать ошибку как объект { detail: "..." } или { title: "..." }
              errorMsg =
                (replicateResponse.error as any).detail ||
                (replicateResponse.error as any).title ||
                JSON.stringify(replicateResponse.error)
            }
          }
          dependencies.logError({
            message:
              '[V1_SERVICE] Replicate job status indicates failure or cancellation',
            telegramId: params.telegramId,
            replicateId: replicateId,
            status: replicateResponse.status,
            error: replicateResponse.error,
          })
          throw new Error(errorMsg)
        }

        let extractedImageUrl: string | undefined
        const output = replicateResponse.output

        if (typeof output === 'string') {
          extractedImageUrl = output
        } else if (
          Array.isArray(output) &&
          output.length > 0 &&
          typeof output[0] === 'string'
        ) {
          extractedImageUrl = output[0]
        } else if (typeof output === 'object' && output !== null) {
          // Проверяем, есть ли в объекте output поле 'output' (как было в textToImage)
          // или если сам объект output является результатом (например, у некоторых моделей Replicate)
          const nestedOutput = (output as any).output
          if (typeof nestedOutput === 'string') {
            extractedImageUrl = nestedOutput
          } else if (
            Array.isArray(nestedOutput) &&
            nestedOutput.length > 0 &&
            typeof nestedOutput[0] === 'string'
          ) {
            extractedImageUrl = nestedOutput[0]
          }
        }

        if (!extractedImageUrl) {
          dependencies.logWarn({
            message:
              '[V1_SERVICE] Failed to extract image URL from Replicate response',
            telegramId: params.telegramId,
            replicateId: replicateId,
            replicateOutput: output,
          })
          throw new Error('Failed to get image URL from Replicate output.')
        }
        currentImageUrl = extractedImageUrl

        // Сохранение файла локально
        currentLocalPath = await dependencies.saveFileLocally(
          params.telegramId,
          currentImageUrl,
          'neurophoto-v1',
          path.extname(currentImageUrl) || '.png' // Определяем расширение
        )

        dependencies.logInfo({
          message: '[V1_SERVICE] Изображение сохранено локально',
          telegramId: params.telegramId,
          localPath: currentLocalPath,
        })

        // Сохранение промпта в БД
        // Адаптируем параметры для savePromptDirect
        currentPromptId = await dependencies.savePromptDirect({
          prompt: params.prompt,
          model_name: params.userModelUrl, // или другое имя модели, если есть
          replicate_id: replicateId || 'unknown',
          image_urls: [currentImageUrl], // URL от Replicate
          telegram_id: Number(params.telegramId),
          service_type: ModeEnum.NeuroPhoto, // <--- ИСПРАВЛЕНИЕ: NeuroPhotoV1 -> NeuroPhoto
          generation_time: Date.now() - imageStartTime,
        })

        // TODO: Детекция NSFW (если есть такая зависимость и логика)
        // currentIsNsfw = await dependencies.detectNsfw(currentLocalPath);
        // if (currentIsNsfw) { throw new Error('NSFW content detected.'); }

        individualResults.push({
          success: true,
          imageUrl: currentImageUrl,
          localPath: currentLocalPath,
          // s3Path: undefined, // Если не загружаем в S3
          promptId: currentPromptId,
          isNsfw: currentIsNsfw,
          originalPrompt: params.prompt,
          duration: (Date.now() - imageStartTime) / 1000,
          // seed: replicateResponse.seed, // Если Replicate возвращает seed
        } as NeuroPhotoSuccessItem)

        // Отправка в Pulse
        await dependencies.sendMediaToPulse({
          mediaType: 'photo',
          mediaSource: currentLocalPath!, // Используем локальный путь, добавляем non-null assertion, т.к. выше должна быть проверка
          telegramId: params.telegramId,
          username: params.username,
          language: params.isRu ? 'ru' : 'en',
          serviceType: ModeEnum.NeuroPhoto, // Используем общий тип, если NeuroPhotoV1 не определен в ModeEnum
          prompt: params.prompt,
          botName: params.botName,
          additionalInfo: {
            model: params.userModelUrl,
            cost: String(costPerImage), // Преобразуем в строку
            isPrivate: String(user?.vip || false), // Преобразуем в строку
            replicateId: replicateId || 'unknown',
          },
        })
      } catch (genError: any) {
        dependencies.logError({
          message: `[V1_SERVICE] Ошибка при генерации изображения ${i + 1}`,
          telegramId: params.telegramId,
          error: genError.message,
          stack: genError.stack,
          replicateId,
        })
        individualResults.push({
          success: false,
          error: genError.message || 'Image generation failed',
          errorMessage: genError.message,
          originalPrompt: params.prompt,
          isNsfw: currentIsNsfw, // может быть true, если NSFW было причиной ошибки
          duration: (Date.now() - imageStartTime) / 1000,
        } as NeuroPhotoErrorItem)
      }
    } // Конец цикла for

    // Финальное формирование NeuroPhotoOverallResult
    const successfulGenerations = individualResults.filter(
      r => r.success
    ).length
    const finalStatus =
      successfulGenerations === validNumImages
        ? 'success'
        : successfulGenerations > 0
          ? 'partial_success'
          : 'error'

    let finalMessage = ''
    if (finalStatus === 'success') {
      finalMessage = params.isRu
        ? `Успешно сгенерировано изображений: ${successfulGenerations}.`
        : `Successfully generated images: ${successfulGenerations}.`
    } else if (finalStatus === 'partial_success') {
      finalMessage = params.isRu
        ? `Частичный успех. Сгенерировано изображений: ${successfulGenerations} из ${validNumImages}.`
        : `Partial success. Generated images: ${successfulGenerations} of ${validNumImages}.`
    } else {
      finalMessage = params.isRu
        ? 'Ошибка генерации изображений.'
        : 'Error generating images.'
      if (
        individualResults.length > 0 &&
        individualResults[0].errorMessage &&
        validNumImages === 1
      ) {
        // Если была одна попытка и есть ошибка, берем ее как основное сообщение
        finalMessage = individualResults[0].errorMessage
      }
    }

    return {
      status: finalStatus,
      message: finalMessage,
      results: individualResults,
      cost: totalCost,
      paymentError: paymentProcessError,
      // balanceAfter: undefined, // Пока не получаем баланс после
    }
  } catch (error: any) {
    dependencies.logError({
      message: '[V1_SERVICE] Unhandled exception in generateNeuroPhotoV1',
      error: error.message,
      stack: error.stack,
      telegramId: params.telegramId,
    })
    return {
      status: 'error',
      message: params.isRu
        ? 'Внутренняя ошибка сервиса при генерации V1.'
        : 'Internal service error during V1 generation.',
      results: [
        {
          success: false,
          error: 'UNHANDLED_EXCEPTION',
          errorMessage: error.message || 'Unhandled exception',
          originalPrompt: params.prompt,
        } as NeuroPhotoErrorItem,
      ],
      cost: 0, // Стоимость может быть неизвестна или 0 при такой ошибке
    }
  }
}

// Helper to create a standard error response item for V2 (can be similar to V1)
const createV2ErrorItem = (
  errorKey: string,
  errorMessage: string,
  originalPrompt: string,
  revisedPrompt?: string
): NeuroPhotoErrorItem => ({
  success: false,
  error: errorKey,
  errorMessage,
  originalPrompt,
  revisedPrompt,
  imageUrl: null,
  localPath: null,
  s3Path: null,
  promptId: null,
  isNsfw: false, // Default, can be overridden
})

// Helper to create an overall error result for V2
const createV2ErrorOverallResult = (
  errorItem: NeuroPhotoErrorItem,
  userMessage?: string
): NeuroPhotoOverallResult => ({
  status: 'error',
  message: userMessage || errorItem.errorMessage,
  results: [errorItem],
  cost: 0,
})

const DETAIL_PROMPT_V2 = `Cinematic Lighting, ethereal light, intricate details, extremely detailed, incredible details, full colored, complex details, insanely detailed and intricate, hypermaximalist, extremely detailed with rich colors. masterpiece, best quality, aerial view, HDR, UHD, unreal engine, Representative, fair skin, beautiful face, Rich in details High quality, gorgeous, glamorous, 8k, super detail, gorgeous light and shadow, detailed decoration, detailed lines`

// Main service function for V2 NeuroPhoto generation
export const generateNeuroPhotoV2 = async (
  params: GenerateV2Params,
  dependencies: NeuroPhotoServiceDependencies
): Promise<NeuroPhotoOverallResult> => {
  dependencies.logInfo({
    message: '[V2_SERVICE] generateNeuroPhotoV2 called',
    details: {
      basePrompt: params.basePrompt.substring(0, 50) + '...',
      numImages: params.numImages,
      telegramId: params.telegramId,
      botName: params.botName,
      bypassPaymentCheck: params.bypassPaymentCheck,
    },
  })

  const createV2ErrorItemInternal = (
    errorKey: string,
    logMessage: string,
    userMessage: string,
    details?: Record<string, any>,
    revisedPrompt?: string,
    isNsfw: boolean = false
  ): NeuroPhotoErrorItem => {
    const currentTimestamp = new Date().toISOString()
    const errorDetails = {
      ...details,
      timestamp: currentTimestamp,
    }
    dependencies.logError({
      message: `[V2_SERVICE_ERROR] ${logMessage}`,
      details: errorDetails,
      errorKey,
    })
    return {
      success: false,
      error: errorKey,
      errorMessage: userMessage,
      originalPrompt:
        details?.originalPrompt || revisedPrompt || 'Unknown prompt',
      revisedPrompt,
      isNsfw,
      timestamp: currentTimestamp,
      duration: details?.processingTime || 0,
    }
  }

  const createV2ErrorOverallResultInternal = (
    errorItem: NeuroPhotoErrorItem,
    cost: number = 0
  ): NeuroPhotoOverallResult => ({
    status: 'error',
    results: [errorItem],
    cost,
    paymentError: undefined,
    message: errorItem.errorMessage,
    totalProcessingTime: errorItem.duration || 0,
  })

  try {
    if (!params.basePrompt) {
      const errorItem = createV2ErrorItemInternal(
        'NO_PROMPT',
        'Отсутствует базовый промпт для генерации V2',
        params.isRu ? 'Промпт не указан.' : 'Prompt not provided.'
      )
      return createV2ErrorOverallResultInternal(errorItem)
    }

    const validNumImages =
      params.numImages && params.numImages > 0 ? params.numImages : 1

    const user = await dependencies.getUserByTelegramIdString(params.telegramId)
    if (!user) {
      const errorItem = createV2ErrorItemInternal(
        'USER_NOT_FOUND',
        'Пользователь не найден в базе данных для V2',
        params.isRu
          ? 'Ваш аккаунт не найден. Пожалуйста, перезапустите бота (/start).'
          : 'Your account was not found. Please restart the bot (/start).'
      )
      return createV2ErrorOverallResultInternal(errorItem)
    }
    dependencies.logInfo({
      message: '[V2_SERVICE] Пользователь найден в базе данных',
      telegramId: params.telegramId,
      userIdDb: user.id,
    })

    if (user.level === 1) {
      await dependencies.updateUserLevelPlusOne(params.telegramId, user.level)
      dependencies.logInfo({
        message: '[V2_SERVICE] Уровень пользователя обновлен',
        telegramId: params.telegramId,
        oldLevel: user.level,
        newLevel: user.level + 1,
      })
    }

    dependencies.logInfo({
      message: '[V2_SERVICE] Расчет стоимости генерации V2',
      details: {
        numImages: validNumImages,
        mode: ModeEnum.NeuroPhotoV2,
        telegramId: params.telegramId,
      },
    })
    const costResult = dependencies.calculateModeCost({
      mode: ModeEnum.NeuroPhotoV2,
      steps: validNumImages,
    })

    const costPerOperation = Number(costResult.stars)
    const totalCost = costPerOperation * validNumImages

    if (isNaN(costPerOperation) || costPerOperation < 0 || isNaN(totalCost)) {
      const errorItem = createV2ErrorItemInternal(
        'COST_CALCULATION_ERROR_V2',
        'Некорректная общая стоимость для V2',
        params.isRu
          ? 'Ошибка расчета стоимости V2.'
          : 'Error calculating V2 cost.',
        {
          calculatedCostPerOperation: costResult.stars,
          numImages: validNumImages,
        }
      )
      return createV2ErrorOverallResultInternal(errorItem)
    }
    dependencies.logInfo({
      message: '[V2_SERVICE] Рассчитана стоимость генерации V2',
      details: {
        totalCost,
        numImages: validNumImages,
        telegramId: params.telegramId,
      },
    })

    const paymentOperationId = `payment-v2-${params.telegramId}-${Date.now()}-${validNumImages}-${dependencies.generateUUID()}`
    let paymentProcessError: string | undefined = undefined
    if (!params.bypassPaymentCheck && totalCost > 0) {
      const paymentDescription = params.isRu
        ? `Генерация ${validNumImages} изображений нейрофото V2`
        : `Generation of ${validNumImages} neuroimages V2`
      const paymentResult = await dependencies.directPaymentProcessor({
        telegram_id: params.telegramId,
        amount: totalCost,
        type: PaymentType.MONEY_OUTCOME,
        description: paymentDescription,
        bot_name: params.botName,
        service_type: ModeEnum.NeuroPhotoV2,
        inv_id: paymentOperationId,
        metadata: { basePrompt: params.basePrompt, numImages: validNumImages },
      })
      if (!paymentResult.success) {
        paymentProcessError =
          paymentResult.error ||
          (params.isRu ? 'Ошибка оплаты V2.' : 'V2 Payment error.')
        dependencies.logError({
          message: '[V2_SERVICE] Ошибка оплаты V2',
          telegramId: params.telegramId,
          error: paymentProcessError,
          details: { paymentOperationId, totalCost },
        })
        const errorItem = createV2ErrorItemInternal(
          'PAYMENT_ERROR_V2',
          'Ошибка оплаты V2',
          paymentProcessError,
          { paymentOperationId }
        )
        return createV2ErrorOverallResultInternal(errorItem)
      }
      dependencies.logInfo({
        message: '[V2_SERVICE] Оплата V2 прошла успешно',
        telegramId: params.telegramId,
        paymentId: paymentResult.payment_id,
      })
    }

    // 1. Получаем актуальную BFL модель пользователя
    const userBflModel = await dependencies.getLatestUserModel(
      Number(params.telegramId),
      'bfl' // "bfl" - Заменяем MODEL_TYPE_BFL на строку
    )

    if (!userBflModel) {
      const errorItem = createV2ErrorItemInternal(
        'NO_BFL_MODEL_OR_TRIGGER',
        'BFL model or trigger word not found for user V2',
        params.isRu
          ? 'Ваша персональная AI-модель (bfl) не найдена. Обучите ее сначала.'
          : 'Your personal AI model (bfl) was not found. Please train it first.',
        { telegramId: params.telegramId }
      )
      return createV2ErrorOverallResultInternal(errorItem)
    }

    // 3. Получение данных пользователя (для gender)
    const userData = await dependencies.getUserData(params.telegramId)
    let genderPromptPart = 'person' // По умолчанию
    if (userData?.gender === 'female') {
      genderPromptPart = 'female'
    } else if (userData?.gender === 'male') {
      genderPromptPart = 'male'
    }
    dependencies.logInfo({
      message: '[V2_SERVICE] Данные пользователя (gender) получены',
      telegramId: params.telegramId,
      details: { gender: userData?.gender, genderPromptPart },
    })

    // 4. Формирование полного промпта для V2
    const fullPromptV2 = `Fashionable ${userBflModel.trigger_word} ${genderPromptPart}, ${params.basePrompt}, ${DETAIL_PROMPT_V2}`
    dependencies.logInfo({
      message: '[V2_SERVICE] Полный промпт для Replicate V2 сформирован',
      telegramId: params.telegramId,
      details: { fullPrompt: fullPromptV2.substring(0, 100) + '...' },
    })

    // 5. Получение аспект-ратио пользователя (как в V1)
    let userAspectRatio = null
    try {
      userAspectRatio = await dependencies.getAspectRatio(
        Number(params.telegramId)
      )
    } catch (e: any) {
      dependencies.logWarn({
        message:
          '[V2_SERVICE] Не удалось получить аспект-ратио, используется значение по умолчанию.',
        telegramId: params.telegramId,
        error: e.message,
      })
    }
    // const aspectRatioToUse = userAspectRatio || '1:1'; // Пока не используем явно в Replicate input

    // 6. Цикл генерации изображений
    const individualResults: NeuroPhotoServiceResultItem[] = []
    let anyErrorOccurredInLoop = false
    let anySuccessOccurredInLoop = false
    let cumulativeProcessingTime = 0

    for (let i = 0; i < validNumImages; i++) {
      const imageStartTime = Date.now()
      let replicateId: string | undefined = undefined
      let currentImageUrl: string | undefined = undefined
      let currentLocalPath: string | undefined = undefined
      let currentPromptId: string | null = null
      let isNsfwDetected = false // Флаг для NSFW
      const currentImageTimestamp = new Date().toISOString() // Timestamp для этого конкретного изображения

      try {
        dependencies.logInfo({
          message: `[V2_SERVICE] Начало генерации изображения ${i + 1}/${validNumImages}`,
          telegramId: params.telegramId,
          attempt: i + 1,
          model_url: userBflModel.model_url,
        })

        // TODO: Адаптировать input для конкретных V2 моделей (playground-v2.5, sdxl-lightning)
        // Пока используем только prompt. Могут понадобиться width, height, scheduler, etc.
        // Эти параметры нужно будет либо передавать в GenerateV2Params, либо определять их здесь.
        const replicateInputV2: any = {
          prompt: fullPromptV2,
          // negative_prompt: "...", (если нужно)
          // width: ..., height: ..., (если модель требует и мы их знаем)
          // num_outputs: 1, (обычно по умолчанию 1)
        }

        const replicateResponse = await dependencies.replicateRun(
          userBflModel.model_url, // Используем URL модели BFL пользователя
          { input: replicateInputV2 }
        )
        replicateId = replicateResponse.id
        dependencies.logInfo({
          message: '[V2_SERVICE] Ответ от Replicate получен',
          telegramId: params.telegramId,
          replicateId,
          status: replicateResponse.status,
          attempt: i + 1,
        })

        if (
          replicateResponse.status === 'failed' ||
          replicateResponse.status === 'canceled'
        ) {
          let errorMsg = params.isRu
            ? 'Ошибка генерации на стороне Replicate (V2).'
            : 'Replicate job failed or was canceled (V2).'
          if (replicateResponse.error) {
            errorMsg =
              typeof replicateResponse.error === 'string'
                ? replicateResponse.error
                : JSON.stringify(replicateResponse.error)
          }
          throw new Error(errorMsg)
        }

        const output = replicateResponse.output
        if (
          Array.isArray(output) &&
          output.length > 0 &&
          typeof output[0] === 'string'
        ) {
          currentImageUrl = output[0]
        } else if (typeof output === 'string') {
          currentImageUrl = output
        }

        if (!currentImageUrl) {
          dependencies.logWarn({
            message:
              '[V2_SERVICE] Не удалось извлечь URL изображения из ответа Replicate',
            telegramId: params.telegramId,
            replicateId,
            replicateOutput: output,
            attempt: i + 1,
          })
          throw new Error(
            params.isRu
              ? 'Не получен URL изображения от Replicate (V2).'
              : 'Failed to get image URL from Replicate (V2).'
          )
        }

        // Простая проверка NSFW по URL (как в V1, может быть неэффективна)
        if (currentImageUrl.includes('nsfw')) {
          isNsfwDetected = true
          dependencies.logWarn({
            message: `[V2_SERVICE] Обнаружен NSFW контент (по URL) для изображения ${i + 1}`,
            telegramId: params.telegramId,
            replicateId,
            imageUrl: currentImageUrl,
          })
          // Не прерываем, но помечаем результат как NSFW
        }

        currentLocalPath = await dependencies.saveFileLocally(
          params.telegramId,
          currentImageUrl,
          'neuro-photo-v2',
          path.extname(new URL(currentImageUrl).pathname) || '.jpg'
        )
        dependencies.logInfo({
          message: `[V2_SERVICE] Изображение ${i + 1} сохранено локально: ${currentLocalPath}`,
          telegramId: params.telegramId,
        })

        currentPromptId = await dependencies.savePromptDirect({
          prompt: params.basePrompt,
          model_name: userBflModel.model_url,
          replicate_id: replicateId || 'unknown_v2_replicate_id',
          image_urls: [currentImageUrl],
          telegram_id: Number(params.telegramId),
          service_type: ModeEnum.NeuroPhotoV2,
          generation_time: Date.now() - imageStartTime,
          additional_data: {
            service_version: 'v2',
            revised_prompt: fullPromptV2,
            trigger_word: userBflModel.trigger_word,
            gender_used: genderPromptPart,
          },
        })
        dependencies.logInfo({
          message: `[V2_SERVICE] Промпт для изображения ${i + 1} сохранен в БД, ID: ${currentPromptId}`,
          telegramId: params.telegramId,
        })

        if (currentLocalPath && !isNsfwDetected) {
          // Отправляем в Pulse только не-NSFW
          try {
            await dependencies.sendMediaToPulse({
              mediaType: 'photo',
              mediaSource: currentLocalPath,
              telegramId: params.telegramId,
              username: params.username,
              language: params.isRu ? 'ru' : 'en',
              serviceType: ModeEnum.NeuroPhotoV2,
              prompt: params.basePrompt,
              botName: params.botName,
              additionalInfo: {
                model: userBflModel.model_url,
                cost: String(totalCost / validNumImages), // Примерная стоимость за изображение
                isPrivate: String(user?.vip || false),
                replicateId,
                service_version: 'v2',
                revised_prompt: fullPromptV2,
                trigger_word: userBflModel.trigger_word,
              },
            })
            dependencies.logInfo({
              message: `[V2_SERVICE] Медиа ${i + 1} отправлено в Pulse`,
              telegramId: params.telegramId,
            })
          } catch (pulseError: any) {
            dependencies.logError({
              message: `[V2_SERVICE] Ошибка отправки медиа ${i + 1} в Pulse: ${pulseError.message}`,
              telegramId: params.telegramId,
              error: pulseError,
            })
          }
        }

        if (isNsfwDetected) {
          individualResults.push(
            createV2ErrorItemInternal(
              'NSFW_CONTENT_DETECTED_V2',
              `Обнаружен NSFW контент для изображения ${i + 1}`,
              params.isRu
                ? 'Обнаружен неприемлемый контент (NSFW).'
                : 'NSFW content detected.',
              { imageUrl: currentImageUrl },
              fullPromptV2,
              true
            )
          )
          anyErrorOccurredInLoop = true
        } else {
          const duration = (Date.now() - imageStartTime) / 1000
          cumulativeProcessingTime += duration
          individualResults.push({
            success: true,
            imageUrl: currentImageUrl,
            localPath: currentLocalPath,
            promptId: currentPromptId,
            isNsfw: false,
            originalPrompt: params.basePrompt,
            revisedPrompt: fullPromptV2,
            duration: duration,
            timestamp: currentImageTimestamp, // Добавляем timestamp для успешного результата
          } as NeuroPhotoSuccessItem)
          anySuccessOccurredInLoop = true
        }
      } catch (genError: any) {
        const duration = (Date.now() - imageStartTime) / 1000
        cumulativeProcessingTime += duration
        dependencies.logError({
          message: `[V2_SERVICE] Ошибка при генерации изображения ${i + 1}: ${genError.message}`,
          telegramId: params.telegramId,
          error: genError,
          stack: genError.stack,
          replicateId,
        })
        individualResults.push(
          createV2ErrorItemInternal(
            'IMAGE_GENERATION_ERROR_V2',
            `Ошибка генерации изображения ${i + 1}: ${genError.message}`,
            genError.message ||
              (params.isRu
                ? 'Ошибка генерации изображения (V2).'
                : 'Image generation error (V2).'),
            { attempt: i + 1, processingTime: duration }, // Передаем processingTime в details
            fullPromptV2,
            genError.message.toLowerCase().includes('nsfw')
          )
        )
        anyErrorOccurredInLoop = true
      }
    } // Конец цикла for

    let finalStatus: NeuroPhotoOverallResult['status'] = 'error'
    if (anySuccessOccurredInLoop && !anyErrorOccurredInLoop) {
      finalStatus = 'success'
    } else if (anySuccessOccurredInLoop && anyErrorOccurredInLoop) {
      finalStatus = 'partial_success'
    }

    const overallMessage = params.isRu
      ? `Генерация V2 завершена. Успешно: ${individualResults.filter(r => r.success).length}/${validNumImages}`
      : `V2 generation completed. Successful: ${individualResults.filter(r => r.success).length}/${validNumImages}`

    return {
      status: finalStatus,
      message: overallMessage,
      results: individualResults,
      cost: totalCost,
      paymentError: paymentProcessError,
      totalProcessingTime: cumulativeProcessingTime, // Устанавливаем общее время обработки
    }
  } catch (error: any) {
    const errorMessage = error.message || 'Unknown error during V2 generation.'
    dependencies.logError({
      message: '[V2_SERVICE] Непредвиденная ошибка в generateNeuroPhotoV2',
      telegramId: params.telegramId,
      error: error,
      stack: error.stack,
    })
    const errorItem = createV2ErrorItemInternal(
      'UNEXPECTED_ERROR_V2',
      `Непредвиденная ошибка: ${errorMessage}`,
      params.isRu
        ? 'Произошла неизвестная серверная ошибка V2.'
        : 'An unknown server error occurred for V2.',
      {
        replicateError: error,
      }
    )
    // При общей ошибке стоимость и ошибка платежа могут быть неизвестны или нерелевантны на этом этапе
    return createV2ErrorOverallResultInternal(errorItem)
  }
}
