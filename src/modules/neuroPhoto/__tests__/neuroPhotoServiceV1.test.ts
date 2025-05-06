/// <reference types="vitest/globals" />
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { MockedFunction } from 'vitest'
import {
  generateNeuroPhotoV1,
  GenerateV1Params,
  GenerationResultItem,
} from '../services/neuroPhotoService'
import {
  NeuroPhotoServiceDependencies,
  // Импортируем типы функций для моков, если они не слишком громоздкие,
  // иначе можно будет использовать vi.MockedFunction
  GetUserByTelegramIdStringFn,
  UpdateUserLevelPlusOneFn,
  SavePromptDirectFn,
  GetAspectRatioFn,
  GetLatestUserModelFn,
  GetUserDataFn,
  DirectPaymentProcessorFn,
  CalculateModeCostFn,
  SaveFileLocallyFn,
  SendMediaToPulseFn,
  ProcessApiResponseFn,
  LoggerFn,
} from '../interfaces/neuroPhotoDependencies.interface'
// Импортируем тип Replicate из библиотеки и сам экземпляр replicate из нашего модуля
import ReplicateInstance from 'replicate'
import { replicate as replicateClient } from '@/core/replicate' // Переименовываем, чтобы не было конфликта с типом
import { ModeEnum } from '@/interfaces/modes'
import { PaymentType } from '@/interfaces/payments.interface'

// Мокаем зависимости
// vi.mock('@/core/replicate'); // Если replicateRun это метод класса, возможно, понадобится мокать весь модуль

const mockDependencies = (): NeuroPhotoServiceDependencies => ({
  replicateRun: vi.fn() as unknown as MockedFunction<
    NeuroPhotoServiceDependencies['replicateRun']
  >, // Используем тип из интерфейса
  getUserByTelegramIdString:
    vi.fn() as MockedFunction<GetUserByTelegramIdStringFn>,
  updateUserLevelPlusOne: vi.fn() as MockedFunction<UpdateUserLevelPlusOneFn>,
  savePromptDirect: vi.fn() as MockedFunction<SavePromptDirectFn>,
  getAspectRatio: vi.fn() as MockedFunction<GetAspectRatioFn>,
  getLatestUserModel: vi.fn() as MockedFunction<GetLatestUserModelFn>,
  getUserData: vi.fn() as MockedFunction<GetUserDataFn>,
  directPaymentProcessor: vi.fn() as MockedFunction<DirectPaymentProcessorFn>,
  calculateModeCost: vi.fn() as MockedFunction<CalculateModeCostFn>,
  saveFileLocally: vi.fn() as MockedFunction<SaveFileLocallyFn>,
  sendMediaToPulse: vi.fn() as MockedFunction<SendMediaToPulseFn>,
  processApiResponse: vi.fn() as MockedFunction<ProcessApiResponseFn>,
  generateUUID: vi.fn() as MockedFunction<() => string>,
  logInfo: vi.fn() as MockedFunction<LoggerFn>,
  logError: vi.fn() as MockedFunction<LoggerFn>,
  logWarn: vi.fn() as MockedFunction<LoggerFn>,
})

let deps: NeuroPhotoServiceDependencies

describe('generateNeuroPhotoV1', () => {
  beforeEach(() => {
    deps = mockDependencies()
    // Настроим дефолтные успешные ответы для большинства моков
    ;(
      deps.getUserByTelegramIdString as MockedFunction<
        typeof deps.getUserByTelegramIdString
      >
    ).mockResolvedValue({
      id: BigInt(123456789),
      telegram_id: BigInt(defaultParams.telegramId),
      username: 'testuser',
      level: 2,
      balance: 1000,
      created_at: new Date(),
      language_code: 'ru',
      first_name: 'Test',
      last_name: 'User',
      is_bot: false,
      user_id: 'mock_user_uuid', // Добавлено обязательное поле user_id
    })
    ;(
      deps.updateUserLevelPlusOne as MockedFunction<
        typeof deps.updateUserLevelPlusOne
      >
    ).mockResolvedValue(undefined)
    ;(
      deps.calculateModeCost as MockedFunction<typeof deps.calculateModeCost>
    ).mockReturnValue({ stars: 10 }) // Стоимость 10 звезд
    ;(
      deps.directPaymentProcessor as MockedFunction<
        typeof deps.directPaymentProcessor
      >
    ).mockResolvedValue({ success: true, payment_id: 'mock_payment_id' })
    ;(
      deps.getAspectRatio as MockedFunction<typeof deps.getAspectRatio>
    ).mockResolvedValue('1:1')
    ;(
      deps.replicateRun as MockedFunction<
        NeuroPhotoServiceDependencies['replicateRun']
      >
    ).mockResolvedValue({
      id: 'replicate_run_id',
      status: 'succeeded',
      output: ['http://example.com/image.jpg'],
    })
    ;(
      deps.processApiResponse as MockedFunction<typeof deps.processApiResponse>
    ).mockImplementation(async (apiOutput, prompt, logError) =>
      apiOutput ? (Array.isArray(apiOutput) ? apiOutput : [apiOutput]) : []
    )
    ;(
      deps.saveFileLocally as MockedFunction<typeof deps.saveFileLocally>
    ).mockResolvedValue('/path/to/local/image.jpg')
    ;(
      deps.savePromptDirect as MockedFunction<typeof deps.savePromptDirect>
    ).mockResolvedValue('mock_prompt_id')
    ;(
      deps.sendMediaToPulse as MockedFunction<typeof deps.sendMediaToPulse>
    ).mockResolvedValue(undefined)
    ;(
      deps.generateUUID as MockedFunction<typeof deps.generateUUID>
    ).mockReturnValue('mock-uuid-12345')
  })

  const defaultParams: GenerateV1Params = {
    prompt: 'A cute cat',
    userModelUrl: 'replicate/model-v1:version_hash',
    numImages: 1,
    telegramId: '12345',
    username: 'testuser',
    isRu: true,
    botName: 'neuro_blogger_bot',
    bypassPaymentCheck: false,
  }

  it('should successfully generate an image with default parameters', async () => {
    const results = await generateNeuroPhotoV1(defaultParams, deps)

    expect(deps.logInfo).toHaveBeenCalled()
    expect(deps.getUserByTelegramIdString).toHaveBeenCalledWith(
      defaultParams.telegramId
    )
    expect(deps.calculateModeCost).toHaveBeenCalledWith({
      mode: ModeEnum.NeuroPhoto,
      steps: 1,
    })
    expect(deps.directPaymentProcessor).toHaveBeenCalled()
    expect(deps.replicateRun).toHaveBeenCalled()
    expect(deps.saveFileLocally).toHaveBeenCalled()
    expect(deps.savePromptDirect).toHaveBeenCalled()
    expect(deps.sendMediaToPulse).toHaveBeenCalled()

    expect(results).toHaveLength(1)
    expect(results[0].error).toBeUndefined()
    expect(results[0].imageUrl).toBe('http://example.com/image.jpg')
    expect(results[0].localPath).toBe('/path/to/local/image.jpg')
    expect(results[0].promptId).toBe('mock_prompt_id')
  })

  it('should return an error if prompt is not provided', async () => {
    const paramsWithoutPrompt: GenerateV1Params = {
      ...defaultParams,
      prompt: '', // Пустой промпт
    }

    const results = await generateNeuroPhotoV1(paramsWithoutPrompt, deps)

    expect(deps.logError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '[V1_SERVICE] Отсутствует промпт для генерации',
      })
    )
    expect(results).toHaveLength(1)
    expect(results[0].error).toBe(
      paramsWithoutPrompt.isRu ? 'Промпт не указан.' : 'Prompt not provided.'
    )
    // Убедимся, что ключевые функции не были вызваны
    expect(deps.getUserByTelegramIdString).not.toHaveBeenCalled()
    expect(deps.directPaymentProcessor).not.toHaveBeenCalled()
    expect(deps.replicateRun).not.toHaveBeenCalled()
  })

  it('should return an error if model URL is not provided', async () => {
    const paramsWithoutModelUrl: GenerateV1Params = {
      ...defaultParams,
      userModelUrl: '', // Пустой URL модели
    }

    const results = await generateNeuroPhotoV1(paramsWithoutModelUrl, deps)

    expect(deps.logError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '[V1_SERVICE] Отсутствует URL модели для генерации',
      })
    )
    expect(results).toHaveLength(1)
    expect(results[0].error).toBe(
      paramsWithoutModelUrl.isRu
        ? 'URL модели не указан.'
        : 'Model URL not provided.'
    )
    expect(deps.getUserByTelegramIdString).not.toHaveBeenCalled()
    expect(deps.directPaymentProcessor).not.toHaveBeenCalled()
    expect(deps.replicateRun).not.toHaveBeenCalled()
  })

  it('should return an error if user is not found', async () => {
    ;(
      deps.getUserByTelegramIdString as MockedFunction<
        typeof deps.getUserByTelegramIdString
      >
    ).mockResolvedValueOnce(null) // Мокаем возврат null - пользователь не найден

    const results = await generateNeuroPhotoV1(defaultParams, deps)

    expect(deps.logError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '[V1_SERVICE] Пользователь не найден в базе данных',
      })
    )
    expect(results).toHaveLength(1)
    expect(results[0].error).toBe(
      defaultParams.isRu
        ? 'Ваш аккаунт не найден. Пожалуйста, перезапустите бота (/start).'
        : 'Your account was not found. Please restart the bot (/start).'
    )
    // Убедимся, что другие ключевые функции не были вызваны
    expect(deps.calculateModeCost).not.toHaveBeenCalled()
    expect(deps.directPaymentProcessor).not.toHaveBeenCalled()
    expect(deps.replicateRun).not.toHaveBeenCalled()
  })

  it('should call updateUserLevelPlusOne if user.level is 1', async () => {
    ;(
      deps.getUserByTelegramIdString as MockedFunction<
        typeof deps.getUserByTelegramIdString
      >
    ).mockResolvedValueOnce({
      id: BigInt(123456789),
      telegram_id: BigInt(defaultParams.telegramId),
      username: 'testuser',
      level: 1, // Устанавливаем уровень пользователя = 1
      balance: 1000,
      created_at: new Date(),
      language_code: 'ru',
      first_name: 'Test',
      last_name: 'User',
      is_bot: false,
      user_id: 'mock_user_uuid_level1', // Добавлено обязательное поле user_id
    })

    await generateNeuroPhotoV1(defaultParams, deps)

    expect(deps.updateUserLevelPlusOne).toHaveBeenCalledWith(
      defaultParams.telegramId,
      1
    )
    // Также убедимся, что основной флоу продолжился
    expect(deps.directPaymentProcessor).toHaveBeenCalled()
    expect(deps.replicateRun).toHaveBeenCalled()
  })

  it('should return an error if calculateModeCost returns invalid cost', async () => {
    ;(
      deps.calculateModeCost as MockedFunction<typeof deps.calculateModeCost>
    ).mockReturnValueOnce({ stars: 'invalid_cost' }) // Мокаем некорректную стоимость

    const results = await generateNeuroPhotoV1(defaultParams, deps)

    expect(deps.logError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '[V1_SERVICE] Некорректная стоимость за изображение',
      })
    )
    expect(results).toHaveLength(1)
    expect(results[0].error).toBe(
      defaultParams.isRu
        ? 'Ошибка расчета стоимости.'
        : 'Error calculating cost.'
    )
    // Убедимся, что другие ключевые функции не были вызваны
    expect(deps.directPaymentProcessor).not.toHaveBeenCalled()
    expect(deps.replicateRun).not.toHaveBeenCalled()
  })

  it('should return an error if directPaymentProcessor fails', async () => {
    ;(
      deps.directPaymentProcessor as MockedFunction<
        typeof deps.directPaymentProcessor
      >
    ).mockResolvedValueOnce({ success: false, error: 'Недостаточно средств' })

    const results = await generateNeuroPhotoV1(defaultParams, deps)

    expect(deps.logError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '[V1_SERVICE] Ошибка при обработке платежа',
        details: expect.objectContaining({ error: 'Недостаточно средств' }),
      })
    )
    expect(results).toHaveLength(1)
    expect(results[0].error).toBe('Недостаточно средств')
    // Убедимся, что replicateRun не был вызван
    expect(deps.replicateRun).not.toHaveBeenCalled()
  })

  it('should return an error if replicateRun fails', async () => {
    ;(
      deps.replicateRun as MockedFunction<
        NeuroPhotoServiceDependencies['replicateRun']
      >
    ).mockRejectedValueOnce(new Error('Replicate failed miserably'))

    const results = await generateNeuroPhotoV1(defaultParams, deps)

    // Проверяем, что была залогирована ошибка генерации
    expect(deps.logError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          '[V1_SERVICE] Ошибка при генерации изображения'
        ),
        details: expect.objectContaining({
          error: 'Replicate failed miserably',
        }),
      })
    )
    expect(results).toHaveLength(1)
    expect(results[0].error).toBe(
      defaultParams.isRu
        ? 'Ошибка генерации изображения.'
        : 'Image generation error.'
    )
    expect(results[0].isNsfw).toBe(false) // Ожидаем, что isNsfw будет false, если ошибка не связана с NSFW
  })

  it('should return an error if processApiResponse returns no URLs', async () => {
    ;(
      deps.processApiResponse as MockedFunction<typeof deps.processApiResponse>
    ).mockResolvedValueOnce([]) // Мокаем возврат пустого массива URL

    const results = await generateNeuroPhotoV1(defaultParams, deps)

    expect(deps.logError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          '[V1_SERVICE] Ошибка при генерации изображения'
        ),
        details: expect.objectContaining({
          error: 'Replicate не вернул URL изображений.',
        }),
      })
    )
    expect(results).toHaveLength(1)
    expect(results[0].error).toBe(
      defaultParams.isRu
        ? 'Ошибка генерации изображения.'
        : 'Image generation error.'
    )
  })

  it('should handle NSFW content detection', async () => {
    // Мокаем replicateRun так, чтобы он вернул ошибку, содержащую 'nsfw'
    ;(
      deps.replicateRun as MockedFunction<
        NeuroPhotoServiceDependencies['replicateRun']
      >
    ).mockRejectedValueOnce(new Error('Detected NSFW content by Replicate'))

    const results = await generateNeuroPhotoV1(defaultParams, deps)

    expect(deps.logError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          '[V1_SERVICE] Ошибка при генерации изображения'
        ),
        details: expect.objectContaining({
          error: 'Detected NSFW content by Replicate',
        }),
      })
    )
    expect(results).toHaveLength(1)
    expect(results[0].error).toBe(
      defaultParams.isRu
        ? 'Обнаружен NSFW контент. Попробуйте другой запрос.'
        : 'NSFW content detected. Please try another prompt.'
    )
    expect(results[0].isNsfw).toBe(true)
  })

  it('should generate multiple images if numImages > 1', async () => {
    const numImagesToGenerate = 3
    const paramsWithMultipleImages: GenerateV1Params = {
      ...defaultParams,
      numImages: numImagesToGenerate,
    }
    console.log(
      '[TEST DEBUG] paramsWithMultipleImages:',
      paramsWithMultipleImages
    )

    // Мокаем replicateRun, чтобы он каждый раз возвращал новый уникальный URL
    let replicateCallCount = 0
    ;(
      deps.replicateRun as MockedFunction<
        NeuroPhotoServiceDependencies['replicateRun']
      >
    ).mockImplementation(async () => {
      replicateCallCount++
      return {
        id: `replicate_run_id_${replicateCallCount}`,
        status: 'succeeded',
        output: [`http://example.com/image_${replicateCallCount}.jpg`],
      }
    })
    ;(
      deps.processApiResponse as MockedFunction<typeof deps.processApiResponse>
    ).mockImplementation(async (apiOutput, prompt, logError) => {
      if (Array.isArray(apiOutput)) {
        return apiOutput
      } else if (typeof apiOutput === 'string') {
        return [apiOutput]
      }
      return []
    })

    let uuidCount = 0
    ;(
      deps.generateUUID as MockedFunction<typeof deps.generateUUID>
    ).mockImplementation(() => `mock-uuid-${++uuidCount}`)
    ;(
      deps.saveFileLocally as MockedFunction<typeof deps.saveFileLocally>
    ).mockImplementation(
      async (tgId, url, sub, ext) => `/test/path/${sub}/file${ext}`
    )
    ;(
      deps.savePromptDirect as MockedFunction<typeof deps.savePromptDirect>
    ).mockImplementation(async params => `prompt_${params.replicate_id}`)
    ;(
      deps.sendMediaToPulse as MockedFunction<typeof deps.sendMediaToPulse>
    ).mockResolvedValue(undefined)

    const results = await generateNeuroPhotoV1(paramsWithMultipleImages, deps)

    expect(deps.replicateRun).toHaveBeenCalledTimes(numImagesToGenerate)
    expect(deps.saveFileLocally).toHaveBeenCalledTimes(numImagesToGenerate)
    expect(deps.savePromptDirect).toHaveBeenCalledTimes(numImagesToGenerate)
    expect(deps.sendMediaToPulse).toHaveBeenCalledTimes(numImagesToGenerate)

    expect(results).toHaveLength(numImagesToGenerate)
    for (let i = 0; i < numImagesToGenerate; i++) {
      expect(results[i].error).toBeUndefined()
      expect(results[i].imageUrl).toBe(`http://example.com/image_${i + 1}.jpg`)
    }

    // Проверим, что платеж был один раз на общую сумму
    const expectedTotalCost =
      Number(
        (
          deps.calculateModeCost as MockedFunction<
            typeof deps.calculateModeCost
          >
        ).mock.results[0].value.stars
      ) * numImagesToGenerate
    expect(deps.directPaymentProcessor).toHaveBeenCalledTimes(1)
    expect(deps.directPaymentProcessor).toHaveBeenCalledWith(
      expect.objectContaining({ amount: expectedTotalCost })
    )
  })

  it('[TEMP DEBUG] should generate 1 image with specific mock re-implementation', async () => {
    const paramsForOneImage: GenerateV1Params = {
      ...defaultParams,
      numImages: 1,
    }

    let replicateCallCount = 0
    ;(
      deps.replicateRun as MockedFunction<
        NeuroPhotoServiceDependencies['replicateRun']
      >
    ).mockImplementation(async () => {
      replicateCallCount++
      console.log('[TEMP DEBUG] Mocked replicateRun called')
      return {
        id: `replicate_run_id_temp_${replicateCallCount}`,
        status: 'succeeded',
        output: [`http://example.com/image_temp_${replicateCallCount}.jpg`],
      }
    })
    ;(
      deps.processApiResponse as MockedFunction<typeof deps.processApiResponse>
    ).mockImplementation(async (apiOutput, prompt, logError) => {
      console.log(
        '[TEMP DEBUG] processApiResponse mock: Received apiOutput:',
        apiOutput
      )
      console.log(
        '[TEMP DEBUG] processApiResponse mock: Type of apiOutput:',
        typeof apiOutput
      )
      if (Array.isArray(apiOutput)) {
        console.log(
          '[TEMP DEBUG] processApiResponse mock: apiOutput is an array, returning it.'
        )
        return apiOutput
      } else if (typeof apiOutput === 'string') {
        console.log(
          '[TEMP DEBUG] processApiResponse mock: apiOutput is a string, wrapping in array.'
        )
        return [apiOutput]
      } else {
        console.log(
          '[TEMP DEBUG] processApiResponse mock: apiOutput is unexpected or null/undefined, returning [].'
        )
        return []
      }
    })
    ;(
      deps.generateUUID as MockedFunction<typeof deps.generateUUID>
    ).mockReturnValue('fixed-uuid-for-debug')
    ;(
      deps.getUserByTelegramIdString as MockedFunction<
        typeof deps.getUserByTelegramIdString
      >
    ).mockResolvedValueOnce({
      id: BigInt(98765),
      telegram_id: BigInt(paramsForOneImage.telegramId),
      username: paramsForOneImage.username,
      level: 2,
      balance: 1000,
      created_at: new Date(),
      language_code: 'ru',
      first_name: 'Temp',
      last_name: 'User',
      is_bot: false,
      user_id: 'mock_user_uuid_debug',
    })
    ;(
      deps.calculateModeCost as MockedFunction<typeof deps.calculateModeCost>
    ).mockReturnValueOnce({ stars: 10 })
    ;(
      deps.directPaymentProcessor as MockedFunction<
        typeof deps.directPaymentProcessor
      >
    ).mockResolvedValueOnce({ success: true, payment_id: 'temp_payment_id' })
    ;(
      deps.saveFileLocally as MockedFunction<typeof deps.saveFileLocally>
    ).mockResolvedValueOnce('/debug/local/path.jpg')
    ;(
      deps.savePromptDirect as MockedFunction<typeof deps.savePromptDirect>
    ).mockResolvedValueOnce('debug_prompt_id')
    ;(
      deps.sendMediaToPulse as MockedFunction<typeof deps.sendMediaToPulse>
    ).mockResolvedValueOnce(undefined)

    const results = await generateNeuroPhotoV1(paramsForOneImage, deps)
    console.log('[TEMP DEBUG] Results:', results)

    expect(deps.replicateRun).toHaveBeenCalledTimes(1)
    expect(deps.saveFileLocally).toHaveBeenCalledTimes(1)
    expect(results).toHaveLength(1)
    expect(results[0].error).toBeUndefined()
    expect(results[0].imageUrl).toBe('http://example.com/image_temp_1.jpg')
  })

  it('should bypass payment if bypassPaymentCheck is true', async () => {
    const paramsWithBypass: GenerateV1Params = {
      ...defaultParams,
      bypassPaymentCheck: true,
    }

    const results = await generateNeuroPhotoV1(paramsWithBypass, deps)

    // Проверяем, что платежный процессор НЕ был вызван
    expect(deps.directPaymentProcessor).not.toHaveBeenCalled()

    // Проверяем, что остальные ключевые шаги были выполнены
    expect(deps.getUserByTelegramIdString).toHaveBeenCalledWith(
      paramsWithBypass.telegramId
    )
    expect(deps.replicateRun).toHaveBeenCalled()
    expect(deps.saveFileLocally).toHaveBeenCalled()
    expect(deps.savePromptDirect).toHaveBeenCalled()
    expect(deps.sendMediaToPulse).toHaveBeenCalled()

    // Проверяем успешный результат генерации
    expect(results).toHaveLength(1)
    expect(results[0].error).toBeUndefined()
    expect(results[0].imageUrl).toBe('http://example.com/image.jpg') // Ожидаем URL из мока beforeEach для replicateRun
  })

  it('should use custom aspect ratio if returned by getAspectRatio', async () => {
    const customAspectRatio = '16:9'
    ;(
      deps.getAspectRatio as MockedFunction<typeof deps.getAspectRatio>
    ).mockResolvedValueOnce(customAspectRatio)

    await generateNeuroPhotoV1(defaultParams, deps)

    expect(deps.getAspectRatio).toHaveBeenCalledWith(
      Number(defaultParams.telegramId)
    )
    // Проверяем, что replicateRun был вызван с правильным aspectRatio
    expect(deps.replicateRun).toHaveBeenCalledWith(
      defaultParams.userModelUrl,
      expect.objectContaining({
        input: expect.objectContaining({ aspect_ratio: customAspectRatio }),
      })
    )
    // Проверяем, что aspectRatio сохранен в promptData
    expect(deps.savePromptDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        additional_data: expect.objectContaining({
          aspectRatio: customAspectRatio,
        }),
      })
    )
  })

  it('should use default aspect ratio (1:1) if getAspectRatio returns null', async () => {
    ;(
      deps.getAspectRatio as MockedFunction<typeof deps.getAspectRatio>
    ).mockResolvedValueOnce(null) // getAspectRatio возвращает null

    await generateNeuroPhotoV1(defaultParams, deps)

    expect(deps.getAspectRatio).toHaveBeenCalledWith(
      Number(defaultParams.telegramId)
    )
    // Проверяем, что replicateRun был вызван с дефолтным aspectRatio
    expect(deps.replicateRun).toHaveBeenCalledWith(
      defaultParams.userModelUrl,
      expect.objectContaining({
        input: expect.objectContaining({ aspect_ratio: '1:1' }), // Ожидаем дефолтное значение
      })
    )
    // Проверяем, что дефолтный aspectRatio сохранен в promptData
    expect(deps.savePromptDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        additional_data: expect.objectContaining({ aspectRatio: '1:1' }), // Ожидаем дефолтное значение
      })
    )
  })

  // TODO: Добавить больше тестов:
  // - Ошибка: Пользователь не найден
  // - Случай, когда user.level === 1 (проверить вызов updateUserLevelPlusOne)
  // - Ошибка: Некорректная стоимость (calculateModeCost возвращает NaN)
  // - Ошибка: Недостаточно средств (directPaymentProcessor возвращает success: false)
  // - Ошибка: Replicate возвращает ошибку (например, deps.replicateRun.mockRejectedValueOnce(new Error('Replicate failed')))
  // - Ошибка: NSFW контент (replicateRun возвращает что-то, что processApiResponse или сама функция определит как NSFW)
  // - Генерация нескольких изображений (numImages > 1)
  // - bypassPaymentCheck: true
  // - Разные значения aspectRatio
})
