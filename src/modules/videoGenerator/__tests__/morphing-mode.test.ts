// src/__tests__/services/generateImageToVideo/morphing-mode.test.ts

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  Mock,
  Mocked,
  vi,
  type MockInstance,
} from 'vitest'
// Используем generateImageToVideoIsolated и типы
import {
  generateImageToVideo,
  type VideoModelConfig,
} from '@/modules/videoGenerator'
import type { MyContext, BalanceOperationResult } from '@/interfaces'
// Импортируем реальный конфиг, который будет подменен
// import { VIDEO_MODELS_CONFIG } from '@/price/models/VIDEO_MODELS_CONFIG'
// Импортируем реальную calculateFinalPrice, если она нужна в этом файле
// import { calculateFinalPrice } from '@/price/helpers'
// Импортируем реальные функции для шпионажа
import * as PriceHelpers from '@/price/helpers'
import * as supabaseUserHelper from '@/core/supabase/getUserByTelegramId'
import * as botHelper from '@/core/bot/index'
import * as supabaseSaveHelper from '@/core/supabase/saveVideoUrlToSupabase'
import * as errorHelper from '@/helpers/error/errorMessageAdmin'
import { replicate } from '@/core/replicate'

import {
  createMockContext,
  createMockUser,
  MockedDependencies,
  MockContextResult,
  setupSpies,
  teardownSpies,
  MOCK_VIDEO_MODELS_CONFIG,
} from './helpers'

import { errorMessageAdmin } from '@/helpers/error/errorMessageAdmin'
import * as ConfigModule from '@/modules/videoGenerator/config/models.config'
import { Telegraf } from 'telegraf' // Import Telegraf
import * as generateVideoHelpers from '../helpers' // Import the local helpers module

// Mock the local helpers module
vi.mock('../helpers', async importOriginal => {
  const actual = await importOriginal<typeof generateVideoHelpers>()
  return {
    ...actual,
    getUserHelper: vi.fn(),
    processBalanceVideoOperationHelper: vi.fn(),
    saveVideoUrlHelper: vi.fn(),
    updateUserLevelHelper: vi.fn(),
    downloadFileHelper: vi.fn(),
  }
})

// Cast the mocked module for easier use
const mockedHelpers = generateVideoHelpers as Mocked<
  typeof generateVideoHelpers
>

// Mock the Supabase client
vi.mock('@/core/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: {}, error: null }),
    rpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
  },
}))

// --- Create Mock Telegram Instance ---
const mockSendMessage = vi.fn()
const mockSendVideo = vi.fn()
const mockTelegramInstance = {
  sendMessage: mockSendMessage,
  sendVideo: mockSendVideo,
} as unknown as Telegraf<MyContext>['telegram'] // Type assertion for mock
const MOCK_CHAT_ID = 123456789 // Define a mock chat ID
// ------------------------------------

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}))

describe('generateImageToVideo Service: Режим Морфинга', () => {
  let ctx: MyContext
  let mockSendMessage: Mock
  let mockSendVideo: Mock
  let getUserByTelegramIdSpy: MockInstance
  let getBotByNameSpy: MockInstance
  let replicateRunSpy: MockInstance
  let saveVideoUrlToSupabaseSpy: MockInstance
  let errorMessageAdminSpy: MockInstance

  const telegram_id = '54321' // Другой ID для этого набора тестов
  const username = 'morphuser'
  const is_ru = true
  const bot_name = 'morph_bot'
  const prompt = 'A morphing prompt' // В морфинге промпт не используется
  const imageAUrl = 'https://example.com/imageA.jpg'
  const imageBUrl = 'https://example.com/imageB.jpg'
  const videoModel = 'stable-video-diffusion'

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.spyOn(ConfigModule, 'VIDEO_MODELS_CONFIG', 'get').mockReturnValue(
      MOCK_VIDEO_MODELS_CONFIG
    )

    const {
      ctx: mockCtx,
      mockSendMessage: msgSpy,
      mockSendVideo: vidSpy,
    } = createMockContext(telegram_id)
    ctx = mockCtx
    mockSendMessage = msgSpy
    mockSendVideo = vidSpy

    getUserByTelegramIdSpy = vi.spyOn(supabaseUserHelper, 'getUserByTelegramId')
    getBotByNameSpy = vi.spyOn(botHelper, 'getBotByName')
    replicateRunSpy = vi.spyOn(replicate, 'run')
    saveVideoUrlToSupabaseSpy = vi.spyOn(
      supabaseSaveHelper,
      'saveVideoUrlToSupabase'
    )
    errorMessageAdminSpy = vi.spyOn(errorHelper, 'errorMessageAdmin')

    const defaultUser = createMockUser(telegram_id, 200000)
    mockedHelpers.getUserHelper.mockResolvedValue(defaultUser)

    const fakeBotInstance = { telegram: ctx.telegram }
    getBotByNameSpy.mockResolvedValue({
      bot: fakeBotInstance as any,
      error: null,
    } as any)

    mockedHelpers.processBalanceVideoOperationHelper.mockResolvedValue({
      success: true,
      newBalance: 199999,
      paymentAmount: 10,
      modePrice: 10,
    })

    replicateRunSpy.mockResolvedValue([
      'https://replicate.delivery/pbxt/xyz.../morph.mp4',
    ])
    mockedHelpers.downloadFileHelper.mockResolvedValue(
      Buffer.from('fake morph data')
    )
    mockedHelpers.saveVideoUrlHelper.mockResolvedValue(undefined)
    errorMessageAdminSpy.mockImplementation(() => {})
    mockedHelpers.updateUserLevelHelper.mockResolvedValue(undefined)
  })

  afterEach(() => {
    getUserByTelegramIdSpy.mockRestore()
    getBotByNameSpy.mockRestore()
    replicateRunSpy.mockRestore()
    saveVideoUrlToSupabaseSpy.mockRestore()
    errorMessageAdminSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('✅ [Кейс 2.1] Успешная генерация в режиме морфинга', async () => {
    const morphModel = 'stable-video-diffusion'
    const modelConfig = MOCK_VIDEO_MODELS_CONFIG[morphModel]
    if (!modelConfig) throw new Error('Mock config missing for SVD')

    await generateImageToVideo(
      telegram_id,
      username,
      is_ru,
      bot_name,
      morphModel,
      null,
      prompt,
      true,
      imageAUrl,
      imageBUrl,
      ctx.telegram,
      Number(telegram_id)
    )

    expect(mockedHelpers.getUserHelper).toHaveBeenCalledWith(telegram_id)
    expect(
      mockedHelpers.processBalanceVideoOperationHelper
    ).toHaveBeenCalledTimes(1)
    expect(replicateRunSpy).toHaveBeenCalledTimes(1)
    expect(mockSendVideo).toHaveBeenCalledTimes(1)
    expect(mockedHelpers.saveVideoUrlHelper).toHaveBeenCalledTimes(1)

    const expectedReplicateInput = {
      ...modelConfig.api.input,
      prompt: prompt || '',
      image_a: imageAUrl,
      image_b: imageBUrl,
    }
    Object.keys(expectedReplicateInput).forEach(key => {
      if (expectedReplicateInput[key] === undefined) {
        delete expectedReplicateInput[key]
      }
    })
    expect(replicateRunSpy).toHaveBeenCalledWith(modelConfig.api.model, {
      input: expectedReplicateInput,
    })

    const balanceResult =
      await mockedHelpers.processBalanceVideoOperationHelper.mock.results[0]
        .value
    const expectedCaption = is_ru
      ? `✨ Ваше видео (${modelConfig.title}) готово!\n💰 Списано: ${balanceResult.paymentAmount} ✨\n💎 Остаток: ${balanceResult.newBalance} ✨`
      : `✨ Your video (${modelConfig.title}) is ready!\n💰 Cost: ${balanceResult.paymentAmount} ✨\n💎 Balance: ${balanceResult.newBalance} ✨`

    expect(mockSendVideo).toHaveBeenCalledWith(
      Number(telegram_id),
      { source: expect.stringContaining('.mp4') },
      { caption: expectedCaption }
    )
    expect(errorMessageAdminSpy).not.toHaveBeenCalled()
  })

  it('❌ [Кейс 2.2] Недостаточно средств для режима морфинга', async () => {
    mockedHelpers.processBalanceVideoOperationHelper.mockResolvedValueOnce({
      success: false,
      error: 'Insufficient funds for morphing',
      newBalance: 0,
      paymentAmount: 0,
      modePrice: 0,
    })

    await generateImageToVideo(
      telegram_id,
      username,
      is_ru,
      bot_name,
      videoModel,
      null,
      prompt,
      true,
      imageAUrl,
      imageBUrl,
      ctx.telegram,
      Number(telegram_id)
    )

    expect(mockSendMessage).toHaveBeenCalledWith(
      Number(telegram_id),
      expect.stringContaining('Insufficient funds for morphing')
    )
    expect(mockedHelpers.getUserHelper).toHaveBeenCalledTimes(1)
    expect(
      mockedHelpers.processBalanceVideoOperationHelper
    ).toHaveBeenCalledTimes(1)
    expect(replicateRunSpy).not.toHaveBeenCalled()
    expect(mockSendVideo).not.toHaveBeenCalled()
    expect(errorMessageAdminSpy).not.toHaveBeenCalled()
  })

  it('❌ [Кейс 2.3] Отсутствует imageAUrl для режима морфинга', async () => {
    errorMessageAdminSpy.mockImplementationOnce(() => {})

    await generateImageToVideo(
      telegram_id,
      username,
      is_ru,
      bot_name,
      videoModel,
      null,
      prompt,
      true,
      null,
      imageBUrl,
      ctx.telegram,
      Number(telegram_id)
    )

    expect(mockSendMessage).toHaveBeenCalledWith(
      Number(telegram_id),
      expect.stringContaining('Image A и Image B обязательны для морфинга')
    )
    expect(
      mockedHelpers.processBalanceVideoOperationHelper
    ).not.toHaveBeenCalled()
    expect(replicateRunSpy).not.toHaveBeenCalled()
    expect(errorMessageAdminSpy).not.toHaveBeenCalled()
  })

  it('❌ [Кейс 2.4] Отсутствует imageBUrl для режима морфинга', async () => {
    errorMessageAdminSpy.mockImplementationOnce(() => {})

    await generateImageToVideo(
      telegram_id,
      username,
      is_ru,
      bot_name,
      videoModel,
      null,
      prompt,
      true,
      imageAUrl,
      null,
      ctx.telegram,
      Number(telegram_id)
    )

    expect(mockSendMessage).toHaveBeenCalledWith(
      Number(telegram_id),
      expect.stringContaining('Image A и Image B обязательны для морфинга')
    )
    expect(
      mockedHelpers.processBalanceVideoOperationHelper
    ).not.toHaveBeenCalled()
    expect(replicateRunSpy).not.toHaveBeenCalled()
    expect(errorMessageAdminSpy).not.toHaveBeenCalled()
  })

  it('❌ [Кейс 2.5] Попытка использовать модель, не поддерживающую морфинг', async () => {
    const nonMorphModel = 'minimax'
    if (
      !MOCK_VIDEO_MODELS_CONFIG[nonMorphModel] ||
      MOCK_VIDEO_MODELS_CONFIG[nonMorphModel].canMorph
    ) {
      console.warn(
        `Skipping test 2.5: Model ${nonMorphModel} not suitable or mock config issue.`
      )
      return
    }
    errorMessageAdminSpy.mockImplementationOnce(() => {})

    await generateImageToVideo(
      telegram_id,
      username,
      is_ru,
      bot_name,
      nonMorphModel,
      null,
      prompt,
      true,
      imageAUrl,
      imageBUrl,
      ctx.telegram,
      Number(telegram_id)
    )

    expect(mockSendMessage).toHaveBeenCalledWith(
      Number(telegram_id),
      expect.stringContaining(
        `Модель ${MOCK_VIDEO_MODELS_CONFIG[nonMorphModel].title} не поддерживает морфинг`
      )
    )
    expect(
      mockedHelpers.processBalanceVideoOperationHelper
    ).not.toHaveBeenCalled()
    expect(replicateRunSpy).not.toHaveBeenCalled()
    expect(errorMessageAdminSpy).not.toHaveBeenCalled()
  })
})
