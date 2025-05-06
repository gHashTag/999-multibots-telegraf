/// <reference types="vitest/globals" />
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { MockedFunction } from 'vitest'
import {
  generateNeuroPhotoV2, // Тестируемая функция
  GenerateV2Params, // Тип параметров для V2
  // GenerationResultItem - уже импортирован в V1 тестах, но можно и здесь для ясности
} from '../services/neuroPhotoService'
import {
  NeuroPhotoServiceDependencies,
  GetUserByTelegramIdStringFn,
  UpdateUserLevelPlusOneFn,
  SavePromptDirectFn,
  GetLatestUserModelFn, // Важно для V2
  GetUserDataFn, // Важно для V2
  DirectPaymentProcessorFn,
  CalculateModeCostFn,
  SaveFileLocallyFn,
  SendMediaToPulseFn,
  ProcessApiResponseFn,
  LoggerFn,
  GetAspectRatioFn, // Не используется в V2, но есть в зависимостях
} from '../interfaces/neuroPhotoDependencies.interface'
import { ModeEnum } from '@/interfaces/modes'
import { PaymentType } from '@/interfaces/payments.interface'

// Аналогично V1, мокаем зависимости
const mockDependenciesV2 = (): NeuroPhotoServiceDependencies => ({
  replicateRun: vi.fn() as unknown as MockedFunction<
    NeuroPhotoServiceDependencies['replicateRun']
  >,
  getUserByTelegramIdString:
    vi.fn() as MockedFunction<GetUserByTelegramIdStringFn>,
  updateUserLevelPlusOne: vi.fn() as MockedFunction<UpdateUserLevelPlusOneFn>,
  savePromptDirect: vi.fn() as MockedFunction<SavePromptDirectFn>,
  getLatestUserModel: vi.fn() as MockedFunction<GetLatestUserModelFn>,
  getUserData: vi.fn() as MockedFunction<GetUserDataFn>,
  directPaymentProcessor: vi.fn() as MockedFunction<DirectPaymentProcessorFn>,
  calculateModeCost: vi.fn() as MockedFunction<CalculateModeCostFn>,
  saveFileLocally: vi.fn() as MockedFunction<SaveFileLocallyFn>,
  sendMediaToPulse: vi.fn() as MockedFunction<SendMediaToPulseFn>,
  processApiResponse: vi.fn() as MockedFunction<ProcessApiResponseFn>,
  generateUUID: vi.fn() as MockedFunction<() => string>,
  getAspectRatio: vi.fn() as MockedFunction<GetAspectRatioFn>, // Мокаем, даже если не используется в V2
  logInfo: vi.fn() as MockedFunction<LoggerFn>,
  logError: vi.fn() as MockedFunction<LoggerFn>,
  logWarn: vi.fn() as MockedFunction<LoggerFn>,
})

let deps: NeuroPhotoServiceDependencies

describe('generateNeuroPhotoV2', () => {
  const defaultV2Params: GenerateV2Params = {
    prompt: 'A beautiful portrait',
    numImages: 1,
    telegramId: '12345002',
    username: 'testuser_v2',
    isRu: true,
    botName: 'neuro_blogger_bot',
    bypassPaymentCheck: false,
  }

  beforeEach(() => {
    deps = mockDependenciesV2()

    // Отладочный лог перед использованием
    console.log(
      '[TEST_DEBUG_FUNC] typeof deps.getUserByTelegramIdString is: ',
      typeof deps.getUserByTelegramIdString
    )

    // Настройка дефолтных успешных моков, аналогично V1, но с учетом специфики V2
    ;(
      deps.getUserByTelegramIdString as MockedFunction<GetUserByTelegramIdStringFn>
    ).mockResolvedValue({
      id: BigInt(123456789),
      telegram_id: BigInt(defaultV2Params.telegramId),
      username: 'testuser_v2',
      level: 2,
      balance: 1000,
      created_at: new Date(),
      language_code: 'ru',
      first_name: 'TestV2',
      last_name: 'UserV2',
      is_bot: false,
      user_id: 'mock_user_uuid_v2',
    }) // Закрытие для mockResolvedValue от getUserByTelegramIdString
    ;(
      deps.getLatestUserModel as MockedFunction<GetLatestUserModelFn>
    ).mockResolvedValue({
      model_url: 'replicate/bfl-model:version_hash',
      trigger_word: 'my_bfl_trigger',
      finetune_id: 'bfl_finetune_id',
    })
    ;(deps.getUserData as MockedFunction<GetUserDataFn>).mockResolvedValue({
      gender: 'female', // Дефолтный гендер для успешного сценария
    })
    ;(
      deps.calculateModeCost as MockedFunction<CalculateModeCostFn>
    ).mockReturnValue({ stars: 15 }) // Пример стоимости для V2
    ;(
      deps.directPaymentProcessor as MockedFunction<DirectPaymentProcessorFn>
    ).mockResolvedValue({ success: true, payment_id: 'mock_payment_id_v2' })
    ;(
      deps.replicateRun as MockedFunction<
        NeuroPhotoServiceDependencies['replicateRun']
      >
    ).mockResolvedValue({
      id: 'replicate_run_id_v2',
      status: 'succeeded',
      output: ['http://example.com/image_v2.jpg'],
    })
    ;(
      deps.processApiResponse as MockedFunction<ProcessApiResponseFn>
    ).mockImplementation(async (apiOutput, prompt, logError) =>
      apiOutput ? (Array.isArray(apiOutput) ? apiOutput : [apiOutput]) : []
    )
    ;(
      deps.saveFileLocally as MockedFunction<SaveFileLocallyFn>
    ).mockResolvedValue('/path/to/local/image_v2.jpg')
    ;(
      deps.savePromptDirect as MockedFunction<SavePromptDirectFn>
    ).mockResolvedValue('mock_prompt_id_v2')
    ;(
      deps.sendMediaToPulse as MockedFunction<SendMediaToPulseFn>
    ).mockResolvedValue(undefined)
    ;(deps.generateUUID as MockedFunction<() => string>).mockReturnValue(
      'mock-uuid-v2-12345'
    )
    ;(
      deps.updateUserLevelPlusOne as MockedFunction<UpdateUserLevelPlusOneFn>
    ).mockResolvedValue(undefined)
    // getAspectRatio мок не нужен для специфичного значения в V2, если он не используется
  })

  it('should successfully generate an image with V2 logic', async () => {
    const results = await generateNeuroPhotoV2(defaultV2Params, deps)

    // Ключевые проверки для V2
    expect(deps.getLatestUserModel).toHaveBeenCalledWith(
      Number(defaultV2Params.telegramId),
      'bfl'
    )
    expect(deps.getUserData).toHaveBeenCalledWith(defaultV2Params.telegramId)

    // Проверка формирования промпта (частично, через вызов replicateRun)
    const expectedFullPromptPart = `Fashionable my_bfl_trigger female, ${defaultV2Params.prompt}` // Без detailPrompt для простоты expect
    expect(deps.replicateRun).toHaveBeenCalledWith(
      'replicate/bfl-model:version_hash',
      expect.objectContaining({
        input: expect.objectContaining({
          prompt: expect.stringContaining(expectedFullPromptPart),
        }),
      })
    )

    // Остальные проверки аналогичны V1 (оплата, сохранение и т.д.)
    expect(deps.directPaymentProcessor).toHaveBeenCalled()
    expect(deps.saveFileLocally).toHaveBeenCalled()
    expect(deps.savePromptDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        model_name: 'replicate/bfl-model:version_hash',
        additional_data: expect.objectContaining({
          service_version: 'v2',
          original_user_prompt: defaultV2Params.prompt,
          gender_part: 'female',
          trigger_word: 'my_bfl_trigger',
        }),
      })
    )
    expect(deps.sendMediaToPulse).toHaveBeenCalled()

    expect(results).toHaveLength(1)
    expect(results[0].error).toBeUndefined()
    expect(results[0].imageUrl).toBe('http://example.com/image_v2.jpg')
    expect(results[0].localPath).toBe('/path/to/local/image_v2.jpg')
    expect(results[0].promptId).toBe('mock_prompt_id_v2')
  })

  it('should return an error if bfl model is not found', async () => {
    ;(
      deps.getLatestUserModel as MockedFunction<GetLatestUserModelFn>
    ).mockResolvedValueOnce(null) // Модель не найдена

    const results = await generateNeuroPhotoV2(defaultV2Params, deps)

    expect(deps.getLatestUserModel).toHaveBeenCalledWith(
      Number(defaultV2Params.telegramId),
      'bfl'
    )
    expect(results).toHaveLength(1)
    expect(results[0].error).toBe(
      defaultV2Params.isRu
        ? 'Ваша персональная AI-модель (bfl) не найдена. Обучите ее сначала.'
        : 'Your personal AI model (bfl) was not found. Please train it first.'
    )
    // Убедимся, что ключевые последующие шаги не были вызваны
    expect(deps.getUserData).not.toHaveBeenCalled()
    expect(deps.directPaymentProcessor).not.toHaveBeenCalled()
    expect(deps.replicateRun).not.toHaveBeenCalled()
  })

  it('should use default gender_part if getUserData returns no gender', async () => {
    ;(deps.getUserData as MockedFunction<GetUserDataFn>).mockResolvedValueOnce(
      {}
    ) // Нет поля gender
    // или mockResolvedValueOnce(null), если getUserData может вернуть null

    await generateNeuroPhotoV2(defaultV2Params, deps)

    expect(deps.getUserData).toHaveBeenCalledWith(defaultV2Params.telegramId)

    const expectedFullPromptPartWithDefaultGender = `Fashionable my_bfl_trigger person, ${defaultV2Params.prompt}` // Ожидаем 'person'
    expect(deps.replicateRun).toHaveBeenCalledWith(
      'replicate/bfl-model:version_hash',
      expect.objectContaining({
        input: expect.objectContaining({
          prompt: expect.stringContaining(
            expectedFullPromptPartWithDefaultGender
          ),
        }),
      })
    )
    // Также проверим, что в savePromptDirect сохранился правильный gender_part
    expect(deps.savePromptDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        additional_data: expect.objectContaining({ gender_part: 'person' }),
      })
    )
  })

  it('should generate multiple V2 images if numImages > 1', async () => {
    const numImagesToGenerate = 2
    const paramsV2Multiple: GenerateV2Params = {
      ...defaultV2Params,
      numImages: numImagesToGenerate,
    }

    // Мокаем replicateRun для V2, чтобы он каждый раз возвращал новый уникальный URL
    let replicateCallCountV2 = 0
    ;(
      deps.replicateRun as MockedFunction<
        NeuroPhotoServiceDependencies['replicateRun']
      >
    ).mockImplementation(async () => {
      replicateCallCountV2++
      return {
        id: `replicate_run_id_v2_${replicateCallCountV2}`,
        status: 'succeeded',
        output: [`http://example.com/image_v2_${replicateCallCountV2}.jpg`],
      }
    })
    // processApiResponse уже настроен в beforeEach корректно

    let uuidCountV2 = 0
    ;(deps.generateUUID as MockedFunction<() => string>).mockImplementation(
      () => `mock-uuid-v2-${++uuidCountV2}`
    )
    ;(
      deps.saveFileLocally as MockedFunction<SaveFileLocallyFn>
    ).mockImplementation(
      async (tgId, url, sub, ext) => `/test_v2/path/${sub}/file${ext}`
    )
    ;(
      deps.savePromptDirect as MockedFunction<SavePromptDirectFn>
    ).mockImplementation(async params => `prompt_v2_${params.replicate_id}`)

    const results = await generateNeuroPhotoV2(paramsV2Multiple, deps)

    expect(deps.replicateRun).toHaveBeenCalledTimes(numImagesToGenerate)
    expect(deps.saveFileLocally).toHaveBeenCalledTimes(numImagesToGenerate)
    expect(deps.savePromptDirect).toHaveBeenCalledTimes(numImagesToGenerate)
    expect(deps.sendMediaToPulse).toHaveBeenCalledTimes(numImagesToGenerate)

    expect(results).toHaveLength(numImagesToGenerate)
    for (let i = 0; i < numImagesToGenerate; i++) {
      expect(results[i].error).toBeUndefined()
      expect(results[i].imageUrl).toBe(
        `http://example.com/image_v2_${i + 1}.jpg`
      )
    }

    const expectedTotalCostV2 =
      Number(
        (deps.calculateModeCost as MockedFunction<CalculateModeCostFn>).mock
          .results[0].value.stars
      ) * numImagesToGenerate
    expect(deps.directPaymentProcessor).toHaveBeenCalledTimes(1)
    expect(deps.directPaymentProcessor).toHaveBeenCalledWith(
      expect.objectContaining({ amount: expectedTotalCostV2 })
    )
  })

  it('should bypass payment for V2 if bypassPaymentCheck is true', async () => {
    const paramsV2Bypass: GenerateV2Params = {
      ...defaultV2Params,
      bypassPaymentCheck: true,
    }

    const results = await generateNeuroPhotoV2(paramsV2Bypass, deps)

    expect(deps.directPaymentProcessor).not.toHaveBeenCalled()

    // Убедимся, что остальные ключевые шаги V2 прошли
    expect(deps.getLatestUserModel).toHaveBeenCalled()
    expect(deps.getUserData).toHaveBeenCalled()
    expect(deps.replicateRun).toHaveBeenCalled()
    expect(deps.saveFileLocally).toHaveBeenCalled()
    expect(deps.savePromptDirect).toHaveBeenCalled()
    expect(deps.sendMediaToPulse).toHaveBeenCalled()

    expect(results).toHaveLength(1) // Ожидаем 1 изображение по defaultV2Params
    expect(results[0].error).toBeUndefined()
    expect(results[0].imageUrl).toBe('http://example.com/image_v2.jpg')
  })

  it('should return an error if V2 directPaymentProcessor fails', async () => {
    ;(
      deps.directPaymentProcessor as MockedFunction<DirectPaymentProcessorFn>
    ).mockResolvedValueOnce({ success: false, error: 'V2 Payment Failed' })

    const results = await generateNeuroPhotoV2(defaultV2Params, deps)

    expect(deps.directPaymentProcessor).toHaveBeenCalled()
    expect(results).toHaveLength(1)
    expect(results[0].error).toBe('V2 Payment Failed')
    // Последующие шаги не должны вызываться
    expect(deps.replicateRun).not.toHaveBeenCalled()
  })

  it('should return an error if V2 replicateRun fails', async () => {
    ;(
      deps.replicateRun as MockedFunction<
        NeuroPhotoServiceDependencies['replicateRun']
      >
    ).mockRejectedValueOnce(new Error('V2 Replicate Failed'))

    const results = await generateNeuroPhotoV2(defaultV2Params, deps)

    expect(deps.replicateRun).toHaveBeenCalled()
    expect(results).toHaveLength(1)
    expect(results[0].error).toBe(
      defaultV2Params.isRu
        ? 'Ошибка генерации изображения (V2).'
        : 'Image generation error (V2).'
    )
    expect(results[0].isNsfw).toBe(false)
  })

  it('should handle V2 NSFW content detection', async () => {
    ;(
      deps.replicateRun as MockedFunction<
        NeuroPhotoServiceDependencies['replicateRun']
      >
    ).mockRejectedValueOnce(
      new Error('NSFW content detected in V2 by Replicate')
    )

    const results = await generateNeuroPhotoV2(defaultV2Params, deps)

    expect(deps.replicateRun).toHaveBeenCalled()
    expect(results).toHaveLength(1)
    expect(results[0].error).toBe(
      defaultV2Params.isRu
        ? 'Обнаружен NSFW контент. Попробуйте другой запрос (V2).'
        : 'NSFW content detected. Please try another prompt (V2).'
    )
    expect(results[0].isNsfw).toBe(true)
  })

  // TODO: Добавить тесты для V2:
  // - bypassPaymentCheck: true для V2
  // - Ошибки (платеж, Replicate, NSFW)
})
