import {
  NeuroPhotoServiceDependencies,
  GetLatestUserModelFn,
  GetUserDataFn,
  SavePromptDirectFn,
  GetAspectRatioFn,
  GetUserByTelegramIdStringFn,
  UpdateUserLevelPlusOneFn,
} from '../interfaces/neuroPhotoDependencies.interface'
import { BotName } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/modes' // Потребуется для service_type в savePromptDirect и т.д.
import { ApiResponse } from '@/interfaces/api.interface'
import { MediaPulseOptions } from '@/helpers/pulse'
import { PaymentType } from '@/interfaces/payments.interface'

// Временный интерфейс для ответа от Replicate.run
// На основе стандартного ответа Replicate API
interface ReplicateJobResponse {
  id: string
  version?: string
  status?: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  input?: any
  output?: any // ApiResponse (string | string[] | { output: string }) по факту тут
  error?: any
  logs?: string
  metrics?: { predict_time?: number }
  created_at?: string
  started_at?: string
  completed_at?: string
}

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

export interface GenerateV2Params {
  prompt: string
  // userModelUrl здесь не нужен, т.к. V2 получает модель через getLatestUserModel по 'bfl'
  numImages: number
  telegramId: string
  username: string
  isRu: boolean
  botName: BotName
  // Возможно, другие параметры, которые раньше извлекались из ctx или сессии для V2
  bypassPaymentCheck?: boolean
  // disableTelegramSending?: boolean;
}

export interface GenerationResultItem {
  imageUrl?: string // URL изображения от Replicate (или локальный после скачивания, если модуль этим занимается)
  localPath?: string // Локальный путь, если файл сохраняется модулем
  promptId?: string | null // ID сохраненного промпта
  error?: string // Сообщение об ошибке для конкретного изображения, если что-то пошло не так
  isNsfw?: boolean // Флаг, если обнаружен NSFW контент
}

export async function generateNeuroPhotoV1(
  params: GenerateV1Params,
  dependencies: NeuroPhotoServiceDependencies
): Promise<GenerationResultItem[]> {
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

  try {
    if (!params.prompt) {
      dependencies.logError({
        message: '[V1_SERVICE] Отсутствует промпт для генерации',
        telegramId: params.telegramId,
      })
      // Возвращаем ошибку, которую обработает вызывающий код (сцена)
      return [
        { error: params.isRu ? 'Промпт не указан.' : 'Prompt not provided.' },
      ]
    }

    if (!params.userModelUrl) {
      dependencies.logError({
        message: '[V1_SERVICE] Отсутствует URL модели для генерации',
        telegramId: params.telegramId,
      })
      return [
        {
          error: params.isRu
            ? 'URL модели не указан.'
            : 'Model URL not provided.',
        },
      ]
    }

    const validNumImages =
      params.numImages && params.numImages > 0 ? params.numImages : 1
    // username и isRu теперь приходят из params

    // Шаг 1: Получение пользователя
    const user = await dependencies.getUserByTelegramIdString(params.telegramId)
    if (!user) {
      dependencies.logError({
        message: '[V1_SERVICE] Пользователь не найден в базе данных',
        telegramId: params.telegramId,
      })
      return [
        {
          error: params.isRu
            ? 'Ваш аккаунт не найден. Пожалуйста, перезапустите бота (/start).'
            : 'Your account was not found. Please restart the bot (/start).',
        },
      ]
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
      dependencies.logError({
        message: '[V1_SERVICE] Некорректная стоимость за изображение',
        details: {
          costResultStars: costResult.stars,
          telegramId: params.telegramId,
        },
      })
      return [
        {
          error: params.isRu
            ? 'Ошибка расчета стоимости.'
            : 'Error calculating cost.',
        },
      ]
    }
    const totalCost = costPerImage * validNumImages
    dependencies.logInfo({
      message: '[V1_SERVICE] Рассчитана стоимость генерации',
      details: {
        costPerImage,
        totalCost,
        numImages: validNumImages,
        telegramId: params.telegramId,
      },
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

    if (!params.bypassPaymentCheck) {
      const paymentResult = await dependencies.directPaymentProcessor({
        telegram_id: params.telegramId,
        amount: totalCost,
        type: PaymentType.MONEY_OUTCOME,
        description: `NeuroPhoto V1: ${validNumImages} image(s) for ${params.username}. Prompt: ${params.prompt.slice(0, 30)}...`,
        bot_name: params.botName,
        service_type: ModeEnum.NeuroPhoto,
        inv_id: paymentOperationId,
        bypass_payment_check: params.bypassPaymentCheck,
        metadata: {
          prompt: params.prompt.substring(0, 100),
          num_images: validNumImages,
          model_url: params.userModelUrl, // Специфично для V1
          service_version: 'v1',
        },
      })

      if (!paymentResult.success) {
        dependencies.logError({
          message: '[V1_SERVICE] Ошибка при обработке платежа',
          details: {
            error: paymentResult.error,
            telegramId: params.telegramId,
          },
        })
        const paymentErrorMessage =
          paymentResult.error ||
          (params.isRu ? 'Ошибка платежа.' : 'Payment error.')
        return [{ error: paymentErrorMessage }]
      }

      dependencies.logInfo({
        message: '[V1_SERVICE] Платеж успешно обработан',
        details: {
          paymentId: paymentResult.payment_id,
          telegramId: params.telegramId,
        },
      })
    } else {
      dependencies.logInfo({
        message:
          '[V1_SERVICE] Проверка платежа пропущена (bypassPaymentCheck=true)',
        details: { telegramId: params.telegramId },
      })
    }

    // Шаг 5: Подготовка к вызову Replicate и сама генерация
    const generationResults: GenerationResultItem[] = []
    let userAspectRatio = null
    try {
      userAspectRatio = await dependencies.getAspectRatio(
        Number(params.telegramId)
      )
    } catch (e: any) {
      dependencies.logWarn({
        message:
          '[V1_SERVICE] Не удалось получить aspectRatio для пользователя, используется дефолтный.',
        telegramId: params.telegramId,
        error: e.message,
      })
    }
    const aspectRatioToUse = userAspectRatio || '1:1' // Дефолтное значение, если не найдено

    dependencies.logInfo({
      message: '[V1_SERVICE] Подготовка к генерации изображений',
      details: {
        numImages: validNumImages,
        modelUrl: params.userModelUrl,
        aspectRatio: aspectRatioToUse,
        telegramId: params.telegramId,
      },
    })

    for (let i = 0; i < validNumImages; i++) {
      const replicateId = dependencies.generateUUID() // Уникальный ID для этой конкретной попытки Replicate
      try {
        dependencies.logInfo({
          message: `[V1_SERVICE] Начало генерации изображения ${i + 1}/${validNumImages}`,
          details: {
            telegramId: params.telegramId,
            replicateAttemptId: replicateId,
          },
        })

        const replicateInput: any = {
          prompt: params.prompt,
          // aspect_ratio может отличаться для разных моделей, нужно проверить документацию Replicate для конкретной модели
          // или если модель сама его не поддерживает, то этот параметр может быть не нужен.
          // Пока что добавляем его, если он есть.
        }
        // Некоторые модели Replicate могут ожидать aspect_ratio, другие нет.
        // Если модель в params.userModelUrl его поддерживает, его нужно добавить.
        // Для универсальности, здесь можно добавить условие или передавать это как часть userModelUrl/config
        // Пока предполагаем, что если aspectRatioToUse есть, мы его передаем.
        if (
          aspectRatioToUse &&
          !params.userModelUrl.includes('swinir') &&
          !params.userModelUrl.includes('esrgan')
        ) {
          //Пример исключения для апскейлеров
          replicateInput.aspect_ratio = aspectRatioToUse
        }

        // Вызываем replicateRun и сохраняем весь ответ
        const replicateJobResponse = await dependencies.replicateRun(
          params.userModelUrl as any,
          {
            input: replicateInput,
          }
        ) // Убираем приведение типа as ReplicateJobResponse

        // Теперь типы id и output должны быть доступны напрямую
        const outputForProcessing = replicateJobResponse.output
        const replicateJobId = replicateJobResponse.id

        if (!replicateJobId) {
          dependencies.logWarn({
            message: '[V1_SERVICE] Replicate job ID не найден в ответе',
            details: {
              telegramId: params.telegramId,
              responseKeys: Object.keys(replicateJobResponse),
            },
          })
        }

        // processApiResponse должен уметь обрабатывать как одиночный URL, так и массив
        const imageUrls =
          await dependencies.processApiResponse(outputForProcessing)
        if (!imageUrls || imageUrls.length === 0) {
          throw new Error('Replicate не вернул URL изображений.')
        }

        // В V1 мы генерируем по одному изображению за вызов replicate.run (если numImages > 1, цикл внешний)
        // Но если replicate.run сам возвращает несколько картинок за один вызов (для некоторых моделей),
        // то нужно обработать их все и учесть в стоимости и numImages.
        // В текущей реализации generateNeuroPhotoDirect, похоже, что каждый вызов replicate.run = 1 картинка (в контексте цикла for)
        // Поэтому берем первый URL, если их несколько (хотя для V1 это маловероятно без доп. параметров)
        const imageUrl = imageUrls[0]

        const subfolder = `neurophoto_v1/${dependencies.generateUUID()}`
        const imageLocalPath = await dependencies.saveFileLocally(
          params.telegramId,
          imageUrl,
          subfolder, // Уникальная подпапка для каждой генерации
          '.jpg' // Расширение файла
        )

        // URL для сохранения в БД (относительный или абсолютный, в зависимости от конфигурации сервера)
        // const publicImageUrl = `/uploads/${params.telegramId}/${subfolder}/${path.basename(imageLocalPath)}`;
        // path.basename потребует импорта 'path'. Для чистоты функции, лучше если saveFileLocally вернет и publicUrl
        // Пока будем считать, что imageLocalPath достаточно или publicUrl формируется в savePromptDirect

        const promptDataToSave = {
          prompt: params.prompt,
          model_name: params.userModelUrl, // Или более осмысленное имя/версия модели
          replicate_id: replicateJobId || replicateId, // ID из ответа Replicate, если есть, иначе наш UUID
          image_urls: [imageUrl], // Сохраняем URL от Replicate
          telegram_id: Number(params.telegramId),
          service_type: ModeEnum.NeuroPhoto, // Явно V1
          additional_data: {
            localPath: imageLocalPath,
            aspectRatio: aspectRatioToUse,
          },
          // generation_time: ..., // Можно замерять время выполнения replicateRun
        }

        const promptId = await dependencies.savePromptDirect(promptDataToSave)

        // Отправка в Pulse
        // sendMediaToPulse ожидает MediaPulseOptions
        const finalPulseOptionsV1: MediaPulseOptions = {
          mediaType: 'photo',
          mediaSource: imageLocalPath,
          telegramId: params.telegramId,
          username: params.username,
          language: params.isRu ? 'ru' : 'en',
          botName: params.botName,
          prompt: params.prompt,
          serviceType: ModeEnum.NeuroPhoto,
          additionalInfo: {
            model: params.userModelUrl,
            aspectRatio: aspectRatioToUse,
          },
        }
        await dependencies.sendMediaToPulse(finalPulseOptionsV1)

        generationResults.push({
          imageUrl,
          localPath: imageLocalPath,
          promptId,
        })
        dependencies.logInfo({
          message: `[V1_SERVICE] Изображение ${i + 1}/${validNumImages} успешно сгенерировано и обработано`,
          details: {
            telegramId: params.telegramId,
            imageUrl,
            localPath: imageLocalPath,
            promptId,
          },
        })
      } catch (genError: any) {
        dependencies.logError({
          message: `[V1_SERVICE] Ошибка при генерации изображения ${i + 1}/${validNumImages}`,
          details: {
            telegramId: params.telegramId,
            replicateAttemptId: replicateId,
            error: genError.message,
            stack: genError.stack,
          },
        })
        // Обработка специфичных ошибок, например NSFW
        let userErrorMessage = params.isRu
          ? 'Ошибка генерации изображения.'
          : 'Image generation error.'
        let isNsfw = false
        if (
          genError.message &&
          genError.message.toLowerCase().includes('nsfw')
        ) {
          userErrorMessage = params.isRu
            ? 'Обнаружен NSFW контент. Попробуйте другой запрос.'
            : 'NSFW content detected. Please try another prompt.'
          isNsfw = true
        }
        generationResults.push({ error: userErrorMessage, isNsfw })
        // Не прерываем цикл, если только одна из генераций не удалась, собираем все результаты
      }
    }

    dependencies.logInfo({
      message: '[V1_SERVICE] Все генерации завершены, возврат результатов',
      details: {
        telegramId: params.telegramId,
        resultsCount: generationResults.length,
      },
    })
    return generationResults
  } catch (error: any) {
    dependencies.logError({
      message: '[V1_SERVICE] Unexpected error in generateNeuroPhotoV1',
      telegramId: params.telegramId,
      error: error.message,
      stack: error.stack,
    })
    // Возвращаем общую ошибку, которую обработает вызывающий код
    const errorMessage = params.isRu
      ? 'Произошла непредвиденная ошибка при генерации V1.'
      : 'An unexpected error occurred during V1 generation.'
    return [{ error: errorMessage }]
  }
}

export async function generateNeuroPhotoV2(
  params: GenerateV2Params,
  dependencies: NeuroPhotoServiceDependencies
): Promise<GenerationResultItem[]> {
  dependencies.logInfo({
    message: 'neuroPhotoService.generateNeuroPhotoV2 called',
    details: params, // Логируем все входные параметры
  })

  try {
    // === Шаг 1: Получение пользователя ===
    const user = await dependencies.getUserByTelegramIdString(params.telegramId)
    if (!user) {
      dependencies.logError({
        message: '[V2_SERVICE] Пользователь не найден в базе данных',
        telegramId: params.telegramId,
      })
      return [
        {
          error: params.isRu
            ? 'Ваш аккаунт не найден. Пожалуйста, перезапустите бота (/start).'
            : 'Your account was not found. Please restart the bot (/start).',
        },
      ]
    }
    dependencies.logInfo({
      message: '[V2_SERVICE] Пользователь найден в базе данных',
      telegramId: params.telegramId,
      userIdDb: user.id,
    })

    // === Шаг 2: Получение модели пользователя ('bfl') ===
    const userModel = await dependencies.getLatestUserModel(
      Number(params.telegramId),
      'bfl'
    )
    if (!userModel || !userModel.model_url || !userModel.trigger_word) {
      dependencies.logError({
        message: "[V2_SERVICE] Модель 'bfl' не найдена для пользователя",
        telegramId: params.telegramId,
      })
      return [
        {
          error: params.isRu
            ? 'Ваша персональная AI-модель (bfl) не найдена. Обучите ее сначала.'
            : 'Your personal AI model (bfl) was not found. Please train it first.',
        },
      ]
    }
    const { model_url: replicateModelUrl, trigger_word } = userModel
    dependencies.logInfo({
      message: "[V2_SERVICE] Модель 'bfl' получена",
      details: {
        replicateModelUrl,
        trigger_word,
        telegramId: params.telegramId,
      },
    })

    // === Шаг 3: Получение данных пользователя (для gender) ===
    const userData = await dependencies.getUserData(params.telegramId)
    let genderPromptPart = 'person' // Дефолт
    if (userData?.gender === 'female') {
      genderPromptPart = 'female'
    } else if (userData?.gender === 'male') {
      genderPromptPart = 'male'
    }
    dependencies.logInfo({
      message: '[V2_SERVICE] Пол для промпта определен',
      details: { genderPromptPart, telegramId: params.telegramId },
    })

    // === Шаг 4: Формирование полного промпта ===
    const detailPrompt = `Cinematic Lighting, ethereal light, intricate details, extremely detailed, incredible details, full colored, complex details, insanely detailed and intricate, hypermaximalist, extremely detailed with rich colors. masterpiece, best quality, aerial view, HDR, UHD, unreal engine, Representative, fair skin, beautiful face, Rich in details High quality, gorgeous, glamorous, 8k, super detail, gorgeous light and shadow, detailed decoration, detailed lines`
    const fullPrompt = `Fashionable ${trigger_word} ${genderPromptPart}, ${params.prompt}, ${detailPrompt}`
    dependencies.logInfo({
      message: '[V2_SERVICE] Полный промпт сформирован',
      details: {
        fullPromptSubstring: fullPrompt.substring(0, 100) + '...',
        telegramId: params.telegramId,
      },
    })

    // Шаг 5: Обновление уровня пользователя (аналогично V1, если user.level === 1)
    if (user.level === 1) {
      await dependencies.updateUserLevelPlusOne(params.telegramId, user.level)
      dependencies.logInfo({
        message: '[V2_SERVICE] Уровень пользователя обновлен',
        telegramId: params.telegramId,
        oldLevel: user.level,
        newLevel: user.level + 1,
      })
    }

    // Шаг 6: Расчет стоимости
    const validNumImages =
      params.numImages && params.numImages > 0 ? params.numImages : 1

    // Используем ModeEnum.NeuroPhoto для расчета стоимости, как и в V1,
    // т.к. отдельного режима для V2 в ModeEnum может не быть, а стоимость может быть такой же.
    // Если стоимость отличается, потребуется либо новый ModeEnum, либо другая логика в calculateModeCost.
    const costResult = dependencies.calculateModeCost({
      mode: ModeEnum.NeuroPhoto,
      steps: validNumImages,
    })
    const costPerImage = Number(costResult.stars)
    if (isNaN(costPerImage)) {
      dependencies.logError({
        message: '[V2_SERVICE] Некорректная стоимость за изображение',
        details: {
          costResultStars: costResult.stars,
          telegramId: params.telegramId,
        },
      })
      return [
        {
          error: params.isRu
            ? 'Ошибка расчета стоимости.'
            : 'Error calculating cost.',
        },
      ]
    }
    const totalCost = costPerImage * validNumImages
    dependencies.logInfo({
      message: '[V2_SERVICE] Рассчитана стоимость генерации',
      details: {
        costPerImage,
        totalCost,
        numImages: validNumImages,
        telegramId: params.telegramId,
      },
    })

    // Шаг 7: Обработка платежа
    if (!params.bypassPaymentCheck) {
      const paymentOperationId = `payment-v2-${params.telegramId}-${Date.now()}-${validNumImages}-${dependencies.generateUUID()}`
      dependencies.logInfo({
        message: '[V2_SERVICE] Обработка оплаты',
        details: {
          telegramId: params.telegramId,
          totalCost,
          paymentOperationId,
          bypassPaymentCheck: params.bypassPaymentCheck,
        },
      })
      const paymentResult = await dependencies.directPaymentProcessor({
        telegram_id: params.telegramId,
        amount: totalCost,
        type: PaymentType.MONEY_OUTCOME,
        description: `NeuroPhoto V2: ${validNumImages} image(s) for ${params.username}. Prompt: ${params.prompt.slice(0, 30)}...`,
        bot_name: params.botName,
        service_type: ModeEnum.NeuroPhoto, // Используем общий тип, версия в metadata
        inv_id: paymentOperationId,
        bypass_payment_check: params.bypassPaymentCheck,
        metadata: {
          prompt: params.prompt.substring(0, 100),
          full_prompt_substring: fullPrompt.substring(0, 200) + '...',
          num_images: validNumImages,
          model_url: replicateModelUrl,
          trigger_word: trigger_word,
          service_version: 'v2',
        },
      })

      if (!paymentResult.success) {
        dependencies.logError({
          message: '[V2_SERVICE] Ошибка при обработке платежа',
          details: {
            error: paymentResult.error,
            telegramId: params.telegramId,
          },
        })
        const paymentErrorMessage =
          paymentResult.error ||
          (params.isRu ? 'Ошибка платежа.' : 'Payment error.')
        return [{ error: paymentErrorMessage }]
      }
      dependencies.logInfo({
        message: '[V2_SERVICE] Платеж успешно обработан',
        details: {
          paymentId: paymentResult.payment_id,
          telegramId: params.telegramId,
        },
      })
    } else {
      dependencies.logInfo({
        message:
          '[V2_SERVICE] Проверка платежа пропущена (bypassPaymentCheck=true)',
        details: { telegramId: params.telegramId },
      })
    }

    // Шаг 8: Подготовка к вызову Replicate и сама генерация
    const generationResults: GenerationResultItem[] = []
    dependencies.logInfo({
      message: '[V2_SERVICE] Подготовка к генерации изображений',
      details: {
        numImages: validNumImages,
        modelUrl: replicateModelUrl,
        telegramId: params.telegramId,
      },
    })

    for (let i = 0; i < validNumImages; i++) {
      const replicateAttemptId = dependencies.generateUUID()
      try {
        dependencies.logInfo({
          message: `[V2_SERVICE] Начало генерации изображения ${i + 1}/${validNumImages}`,
          details: { telegramId: params.telegramId, replicateAttemptId },
        })

        const replicateInput: any = { prompt: fullPrompt }
        // Для V2 aspectRatio не используется из пользовательских настроек

        const replicateJobResponse = await dependencies.replicateRun(
          replicateModelUrl,
          { input: replicateInput }
        )

        const outputForProcessing = replicateJobResponse.output
        const replicateJobId = replicateJobResponse.id

        if (!replicateJobId) {
          dependencies.logWarn({
            message: '[V2_SERVICE] Replicate job ID не найден в ответе',
            details: {
              telegramId: params.telegramId,
              response: replicateJobResponse,
            },
          })
        }

        const imageUrls = await dependencies.processApiResponse(
          outputForProcessing,
          fullPrompt, // Передаем полный промпт для возможного использования в логгере processApiResponse
          dependencies.logError
        )
        if (!imageUrls || imageUrls.length === 0) {
          throw new Error('Replicate не вернул URL изображений.')
        }
        const imageUrl = imageUrls[0] // Предполагаем 1 URL за вызов для V2

        const subfolder = `neurophoto_v2/${dependencies.generateUUID()}`
        const imageLocalPath = await dependencies.saveFileLocally(
          params.telegramId,
          imageUrl,
          subfolder,
          '.jpg'
        )

        const promptDataToSave = {
          prompt: fullPrompt,
          model_name: replicateModelUrl,
          replicate_id: replicateJobId || replicateAttemptId,
          image_urls: [imageUrl],
          telegram_id: Number(params.telegramId),
          service_type: ModeEnum.NeuroPhoto, // Используем общий тип, версия в additional_data
          additional_data: {
            localPath: imageLocalPath,
            original_user_prompt: params.prompt,
            gender_part: genderPromptPart,
            trigger_word: trigger_word,
            service_version: 'v2',
            // aspectRatio для V2 не сохраняется, т.к. не используется в генерации
          },
        }
        const promptId = await dependencies.savePromptDirect(promptDataToSave)

        const finalPulseOptionsV2: MediaPulseOptions = {
          mediaType: 'photo',
          mediaSource: imageLocalPath,
          telegramId: params.telegramId,
          username: params.username,
          language: params.isRu ? 'ru' : 'en',
          botName: params.botName,
          prompt: fullPrompt,
          serviceType: ModeEnum.NeuroPhoto, // Используем общий тип
          additionalInfo: {
            model: replicateModelUrl,
            service_version: 'v2',
            original_user_prompt: params.prompt,
            trigger_word: trigger_word,
          },
        }
        await dependencies.sendMediaToPulse(finalPulseOptionsV2)

        generationResults.push({
          imageUrl,
          localPath: imageLocalPath,
          promptId,
        })
        dependencies.logInfo({
          message: `[V2_SERVICE] Изображение ${i + 1}/${validNumImages} успешно сгенерировано и обработано`,
          details: {
            telegramId: params.telegramId,
            imageUrl,
            localPath: imageLocalPath,
            promptId,
          },
        })
      } catch (genError: any) {
        dependencies.logError({
          message: `[V2_SERVICE] Ошибка при генерации изображения ${i + 1}/${validNumImages}`,
          details: {
            telegramId: params.telegramId,
            replicateAttemptId,
            error: genError.message,
            stack: genError.stack?.substring(0, 300),
          },
        })
        let userErrorMessage = params.isRu
          ? 'Ошибка генерации изображения (V2).'
          : 'Image generation error (V2).'
        let isNsfw = false
        if (
          genError.message &&
          genError.message.toLowerCase().includes('nsfw')
        ) {
          userErrorMessage = params.isRu
            ? 'Обнаружен NSFW контент. Попробуйте другой запрос (V2).'
            : 'NSFW content detected. Please try another prompt (V2).'
          isNsfw = true
        }
        generationResults.push({ error: userErrorMessage, isNsfw })
      }
    }

    dependencies.logInfo({
      message: '[V2_SERVICE] Все генерации завершены, возврат результатов',
      details: {
        telegramId: params.telegramId,
        resultsCount: generationResults.length,
      },
    })
    return generationResults
  } catch (error: any) {
    dependencies.logError({
      message: '[V2_SERVICE] Unexpected error in generateNeuroPhotoV2',
      telegramId: params.telegramId,
      error: error.message,
      stack: error.stack?.substring(0, 300),
    })
    const errorMessage = params.isRu
      ? 'Произошла непредвиденная ошибка при генерации V2.'
      : 'An unexpected error occurred during V2 generation.'
    // Возвращаем массив ошибок такой же длины, как ожидалось изображений, или одну общую
    const numReturnItems =
      params.numImages && params.numImages > 0 ? params.numImages : 1
    return Array(numReturnItems)
      .fill(null)
      .map(() => ({ error: errorMessage }))
  }
}
