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
import {
  generateImageToVideo,
  type VideoModelConfig,
} from '@/modules/videoGenerator'
import type { MyContext, BalanceOperationResult } from '@/interfaces'
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
import { Telegraf } from 'telegraf'
import * as generateVideoHelpers from '../helpers'

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

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}))

describe('Minimax Video Generator - Standard mode tests', () => {
  let ctx: MyContext
  let mockSendMessage: Mock
  let mockSendVideo: Mock
  let getUserByTelegramIdSpy: MockInstance
  let getBotByNameSpy: MockInstance
  let replicateRunSpy: MockInstance
  let saveVideoUrlToSupabaseSpy: MockInstance
  let errorMessageAdminSpy: MockInstance

  const telegram_id = '12345'
  const username = 'testuser'
  const is_ru = true
  const bot_name = 'test_bot'
  const prompt = 'A test prompt for video generation'
  const imageUrl = 'https://example.com/test-image.jpg'
  const videoModel = 'minimax' // Тестируем именно minimax

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.spyOn(ConfigModule, 'VIDEO_MODELS_CONFIG', 'get').mockReturnValue({
      ...MOCK_VIDEO_MODELS_CONFIG,
      minimax: {
        id: 'minimax',
        title: 'Minimax',
        inputType: ['text', 'image'],
        description: 'Базовая модель для начального уровня',
        basePrice: 0.5,
        api: {
          model: 'minimax/video-01',
          input: {
            prompt_optimizer: true,
          },
        },
        imageKey: 'first_frame_image',
        canMorph: false, // Явно указываем, что морфинг не поддерживается
      },
    })

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
      'https://replicate.delivery/pbxt/xyz.../video.mp4',
    ])
    mockedHelpers.downloadFileHelper.mockResolvedValue(
      Buffer.from('fake video data')
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

  it('✅ Успешная генерация видео с моделью Minimax в стандартном режиме', async () => {
    await generateImageToVideo(
      telegram_id,
      username,
      is_ru,
      bot_name,
      videoModel,
      imageUrl,
      prompt,
      false, // isMorphing = false
      null, // imageAUrl
      null, // imageBUrl
      ctx.telegram,
      Number(telegram_id)
    )

    expect(mockedHelpers.getUserHelper).toHaveBeenCalledWith(telegram_id)
    expect(
      mockedHelpers.processBalanceVideoOperationHelper
    ).toHaveBeenCalledTimes(1)
    expect(replicateRunSpy).toHaveBeenCalledTimes(1)

    // Проверяем, что вызов Replicate содержит правильные параметры для minimax
    expect(replicateRunSpy).toHaveBeenCalledWith('minimax/video-01', {
      input: expect.objectContaining({
        prompt: prompt,
        first_frame_image: imageUrl,
        prompt_optimizer: true,
      }),
    })

    expect(mockSendVideo).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).not.toHaveBeenCalledWith(
      Number(telegram_id),
      expect.stringContaining('❌')
    )
    expect(errorMessageAdminSpy).not.toHaveBeenCalled()
  })

  it('❌ Не должна позволять использовать Minimax в режиме морфинга', async () => {
    await generateImageToVideo(
      telegram_id,
      username,
      is_ru,
      bot_name,
      videoModel,
      null, // imageUrl
      prompt,
      true, // isMorphing = true
      'https://example.com/imageA.jpg', // imageAUrl
      'https://example.com/imageB.jpg', // imageBUrl
      ctx.telegram,
      Number(telegram_id)
    )

    // Проверяем, что была отправлена ошибка о неподдерживаемом режиме
    expect(mockSendMessage).toHaveBeenCalledWith(
      Number(telegram_id),
      expect.stringContaining('❌ Модель Minimax не поддерживает морфинг.')
    )

    // Проверяем, что API Replicate не вызывался
    expect(replicateRunSpy).not.toHaveBeenCalled()
    expect(mockedHelpers.downloadFileHelper).not.toHaveBeenCalled()
    expect(mockSendVideo).not.toHaveBeenCalled()
  })
})
