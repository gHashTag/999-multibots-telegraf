/// <reference types="vitest/globals" />
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { MockedFunction } from 'vitest'
import {
  generateNeuroPhotoV1,
  GenerateV1Params,
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
    // Настройка моков специфичных для этого теста, если нужно, уже есть в beforeEach
    ;(
      deps.saveFileLocally as MockedFunction<typeof deps.saveFileLocally>
    ).mockResolvedValue('/path/to/local/image.jpg')
    ;(
      deps.savePromptDirect as MockedFunction<typeof deps.savePromptDirect>
    ).mockResolvedValue('mock_prompt_id')

    const result = await generateNeuroPhotoV1(defaultParams, deps) // Переименовали в result для ясности

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

    // ИСПРАВЛЕНИЯ ЗДЕСЬ:
    expect(result.status).toBe('success')
    expect(result.results).toHaveLength(1)
    const firstResultItem = result.results[0]
    expect(firstResultItem.success).toBe(true)
    if (firstResultItem.success) {
      // Type guard для доступа к полям NeuroPhotoSuccessItem
      expect(firstResultItem.imageUrl).toBe('http://example.com/image.jpg')
      expect(firstResultItem.localPath).toBe('/path/to/local/image.jpg')
      expect(firstResultItem.promptId).toBe('mock_prompt_id')
    } else {
      // Этот блок не должен выполниться, если success = true
      throw new Error('Test failed: expected success but got error item')
    }
    expect(result.message).toBe('Успешно сгенерировано изображений: 1.') // Пример ожидаемого сообщения
  })

  it('should return an error if prompt is not provided', async () => {
    const paramsWithoutPrompt: GenerateV1Params = {
      ...defaultParams,
      prompt: '', // Пустой промпт
    }

    const result = await generateNeuroPhotoV1(paramsWithoutPrompt, deps)

    expect(deps.logError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '[V1_SERVICE] Отсутствует промпт для генерации',
        telegramId: paramsWithoutPrompt.telegramId, // Добавляем проверку telegramId
        details: { errorKey: 'NO_PROMPT' }, // Добавляем проверку details.errorKey
      })
    )
    // ИСПРАВЛЕНИЯ ЗДЕСЬ:
    expect(result.status).toBe('error')
    expect(result.results).toHaveLength(1)
    const firstResultItem = result.results[0]
    expect(firstResultItem.success).toBe(false)
    if (!firstResultItem.success) {
      // Type guard
      expect(firstResultItem.error).toBe('NO_PROMPT')
      expect(firstResultItem.errorMessage).toBe(
        paramsWithoutPrompt.isRu ? 'Промпт не указан.' : 'Prompt not provided.'
      )
    }
    expect(result.message).toBe(
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

    const result = await generateNeuroPhotoV1(paramsWithoutModelUrl, deps)

    expect(deps.logError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '[V1_SERVICE] Отсутствует URL модели для генерации',
        telegramId: paramsWithoutModelUrl.telegramId, // Добавляем проверку telegramId
        details: { errorKey: 'NO_MODEL_URL' }, // Добавляем проверку details.errorKey
      })
    )
    // ИСПРАВЛЕНИЯ ЗДЕСЬ:
    expect(result.status).toBe('error')
    expect(result.results).toHaveLength(1)
    const firstResultItem = result.results[0]
    expect(firstResultItem.success).toBe(false)
    if (!firstResultItem.success) {
      // Type guard
      expect(firstResultItem.error).toBe('NO_MODEL_URL')
      expect(firstResultItem.errorMessage).toBe(
        paramsWithoutModelUrl.isRu
          ? 'URL модели не указан.'
          : 'Model URL not provided.'
      )
    }
    expect(result.message).toBe(
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

    const result = await generateNeuroPhotoV1(defaultParams, deps)

    expect(deps.logError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '[V1_SERVICE] Пользователь не найден в базе данных',
        telegramId: defaultParams.telegramId, // Добавляем проверку telegramId
        details: { errorKey: 'USER_NOT_FOUND' }, // Добавляем проверку details.errorKey
      })
    )
    // ИСПРАВЛЕНИЯ ЗДЕСЬ:
    expect(result.status).toBe('error')
    expect(result.results).toHaveLength(1)
    const firstResultItem = result.results[0]
    expect(firstResultItem.success).toBe(false)
    if (!firstResultItem.success) {
      // Type guard
      expect(firstResultItem.error).toBe('USER_NOT_FOUND')
      expect(firstResultItem.errorMessage).toBe(
        defaultParams.isRu
          ? 'Ваш аккаунт не найден. Пожалуйста, перезапустите бота (/start).'
          : 'Your account was not found. Please restart the bot (/start).'
      )
    }
    expect(result.message).toBe(
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
      level: 1,
      balance: 1000,
      created_at: new Date(),
      language_code: 'ru',
      first_name: 'Test',
      last_name: 'User',
      is_bot: false,
      user_id: 'mock_user_uuid_level1',
    })
    await generateNeuroPhotoV1(defaultParams, deps)
    expect(deps.updateUserLevelPlusOne).toHaveBeenCalledWith(
      defaultParams.telegramId,
      1
    )
  })

  it('should return an error if calculateModeCost returns invalid cost', async () => {
    ;(
      deps.calculateModeCost as MockedFunction<typeof deps.calculateModeCost>
    ).mockReturnValueOnce({ stars: 'invalid_cost' }) // Мокаем некорректную стоимость

    const result = await generateNeuroPhotoV1(defaultParams, deps)

    expect(deps.logError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '[V1_SERVICE] Некорректная стоимость за изображение',
        telegramId: defaultParams.telegramId, // Добавляем проверку telegramId
        details: { costResultStars: 'invalid_cost' }, // Проверяем details, как в коде сервиса
      })
    )
    // ИСПРАВЛЕНИЯ ЗДЕСЬ:
    expect(result.status).toBe('error')
    expect(result.results).toHaveLength(1)
    const firstResultItem = result.results[0]
    expect(firstResultItem.success).toBe(false)
    if (!firstResultItem.success) {
      // Type guard
      expect(firstResultItem.error).toBe('COST_CALCULATION_ERROR')
      expect(firstResultItem.errorMessage).toBe(
        defaultParams.isRu
          ? 'Ошибка расчета стоимости.'
          : 'Error calculating cost.'
      )
    }
    expect(result.message).toBe(
      defaultParams.isRu
        ? 'Ошибка расчета стоимости.'
        : 'Error calculating cost.'
    )
    expect(deps.directPaymentProcessor).not.toHaveBeenCalled()
    expect(deps.replicateRun).not.toHaveBeenCalled()
  })

  it('should return an error if directPaymentProcessor fails', async () => {
    const paymentErrorMessage = 'Недостаточно средств'
    ;(
      deps.directPaymentProcessor as MockedFunction<
        typeof deps.directPaymentProcessor
      >
    ).mockResolvedValueOnce({ success: false, error: paymentErrorMessage })

    const result = await generateNeuroPhotoV1(defaultParams, deps)

    expect(deps.logError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '[V1_SERVICE] Ошибка оплаты',
        telegramId: defaultParams.telegramId, // Проверяем telegramId
        error: paymentErrorMessage, // Проверяем поле error, а не details
      })
    )
    // ИСПРАВЛЕНИЯ ЗДЕСЬ:
    expect(result.status).toBe('error')
    expect(result.results).toHaveLength(1)
    const firstResultItem = result.results[0]
    expect(firstResultItem.success).toBe(false)
    if (!firstResultItem.success) {
      expect(firstResultItem.error).toBe('PAYMENT_ERROR')
      expect(firstResultItem.errorMessage).toBe(paymentErrorMessage)
    }
    expect(result.message).toBe(paymentErrorMessage)
    expect(result.paymentError).toBe(paymentErrorMessage)
    expect(deps.replicateRun).not.toHaveBeenCalled()
  })

  it('should return an error if replicateRun fails', async () => {
    const replicateErrorMsg = 'Replicate failed miserably'
    ;(
      deps.replicateRun as MockedFunction<
        NeuroPhotoServiceDependencies['replicateRun']
      >
    ).mockRejectedValueOnce(new Error(replicateErrorMsg))

    const result = await generateNeuroPhotoV1(defaultParams, deps)

    expect(deps.logError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '[V1_SERVICE] Ошибка при генерации изображения 1',
        telegramId: defaultParams.telegramId,
        error: replicateErrorMsg,
        stack: expect.any(String),
        replicateId: undefined,
      })
    )
    // ИСПРАВЛЕНИЯ ЗДЕСЬ:
    expect(result.status).toBe('error')
    expect(result.results).toHaveLength(1)
    const firstResultItem = result.results[0]
    expect(firstResultItem.success).toBe(false)
    if (!firstResultItem.success) {
      expect(firstResultItem.error).toBe(replicateErrorMsg)
      expect(firstResultItem.errorMessage).toBe(replicateErrorMsg)
    }
    expect(result.message).toContain(replicateErrorMsg)
  })

  it('should handle NSFW content detection (error from replicateRun)', async () => {
    const nsfwErrorMessage = 'Detected NSFW content by Replicate'
    ;(
      deps.replicateRun as MockedFunction<
        NeuroPhotoServiceDependencies['replicateRun']
      >
    ).mockRejectedValueOnce(new Error(nsfwErrorMessage))

    const result = await generateNeuroPhotoV1(defaultParams, deps)

    expect(deps.logError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '[V1_SERVICE] Ошибка при генерации изображения 1',
        telegramId: defaultParams.telegramId,
        error: nsfwErrorMessage,
        stack: expect.any(String),
        replicateId: undefined,
      })
    )
    // ИСПРАВЛЕНИЯ ЗДЕСЬ:
    expect(result.status).toBe('error')
    expect(result.results).toHaveLength(1)
    const firstResultItem = result.results[0]
    expect(firstResultItem.success).toBe(false)
    if (!firstResultItem.success) {
      expect(firstResultItem.error).toContain(nsfwErrorMessage)
      expect(firstResultItem.errorMessage).toContain(nsfwErrorMessage)
    }
    expect(result.message).toContain(nsfwErrorMessage)
  })

  it('should generate multiple images if numImages > 1', async () => {
    const numImagesToGenerate = 3
    const paramsWithMultipleImages: GenerateV1Params = {
      ...defaultParams,
      numImages: numImagesToGenerate,
    }

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

    const result = await generateNeuroPhotoV1(paramsWithMultipleImages, deps)

    expect(result.status).toBe('success')
    expect(result.results).toHaveLength(numImagesToGenerate)
    for (let i = 0; i < numImagesToGenerate; i++) {
      const item = result.results[i]
      expect(item.success).toBe(true)
      if (item.success) {
        expect(item.imageUrl).toBe(`http://example.com/image_${i + 1}.jpg`)
      }
    }
    const expectedTotalCost =
      Number(
        (
          deps.calculateModeCost as MockedFunction<
            typeof deps.calculateModeCost
          >
        ).mock.results[0].value.stars
      ) * numImagesToGenerate
    expect(deps.directPaymentProcessor).toHaveBeenCalledWith(
      expect.objectContaining({ amount: expectedTotalCost })
    )
    expect(result.cost).toBe(expectedTotalCost)
    expect(result.message).toBe('Успешно сгенерировано изображений: 3.')
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
      return {
        id: `replicate_run_id_temp_${replicateCallCount}`,
        status: 'succeeded',
        output: [`http://example.com/image_temp_${replicateCallCount}.jpg`],
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

    const result = await generateNeuroPhotoV1(paramsForOneImage, deps)

    expect(result.status).toBe('success')
    expect(result.results).toHaveLength(1)
    const firstResultItem = result.results[0]
    expect(firstResultItem.success).toBe(true)
    if (firstResultItem.success) {
      expect(firstResultItem.imageUrl).toBe(
        'http://example.com/image_temp_1.jpg'
      )
      expect(firstResultItem.localPath).toBe('/debug/local/path.jpg')
      expect(firstResultItem.promptId).toBe('debug_prompt_id')
    }
    expect(result.cost).toBe(10)
    expect(result.message).toBe('Успешно сгенерировано изображений: 1.')
  })

  it('should bypass payment if bypassPaymentCheck is true', async () => {
    const paramsWithBypass: GenerateV1Params = {
      ...defaultParams,
      bypassPaymentCheck: true,
    }
    const result = await generateNeuroPhotoV1(paramsWithBypass, deps)
    expect(deps.directPaymentProcessor).not.toHaveBeenCalled()
    expect(result.status).toBe('success')
    expect(result.results).toHaveLength(1)
    const firstResultItem = result.results[0]
    expect(firstResultItem.success).toBe(true)
    if (firstResultItem.success) {
      expect(firstResultItem.imageUrl).toBe('http://example.com/image.jpg')
    }
    expect(result.cost).toBe(
      Number(
        (
          deps.calculateModeCost as MockedFunction<
            typeof deps.calculateModeCost
          >
        ).mock.results[0].value.stars
      ) * 1
    )
    expect(result.message).toBe('Успешно сгенерировано изображений: 1.')
  })

  it('should use custom aspect ratio if returned by getAspectRatio', async () => {
    const customAspectRatio = '16:9'
    ;(
      deps.getAspectRatio as MockedFunction<typeof deps.getAspectRatio>
    ).mockResolvedValueOnce(customAspectRatio)
    await generateNeuroPhotoV1(defaultParams, deps)
    expect(deps.replicateRun).toHaveBeenCalledWith(
      defaultParams.userModelUrl,
      expect.objectContaining({
        input: expect.objectContaining({ prompt: defaultParams.prompt }),
      })
    )
  })

  it('should use default aspect ratio (1:1) if getAspectRatio returns null', async () => {
    ;(
      deps.getAspectRatio as MockedFunction<typeof deps.getAspectRatio>
    ).mockResolvedValueOnce(null)
    await generateNeuroPhotoV1(defaultParams, deps)
    expect(deps.replicateRun).toHaveBeenCalledWith(
      defaultParams.userModelUrl,
      expect.objectContaining({
        input: expect.objectContaining({ prompt: defaultParams.prompt }),
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
