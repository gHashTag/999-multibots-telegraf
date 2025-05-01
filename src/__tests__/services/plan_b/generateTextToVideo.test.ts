import { describe, it, expect, beforeEach, mock, afterEach } from 'bun:test'
import { generateTextToVideo } from '@/services/plan_b/generateTextToVideo'
import { VIDEO_MODELS_CONFIG } from '@/price/models/VIDEO_MODELS_CONFIG'
import { MyContext } from '@/interfaces'
import { Telegraf } from 'telegraf'

// --- Мокирование зависимостей --- //

// Мок для replicate.run и generateVideo
mock.module('@/core/replicate', () => ({
  replicate: {
    run: mock(() => Promise.resolve(['mock-video-url.mp4'])),
  },
}))
mock.module('@/core/replicate/generateVideo', () => ({
  generateVideo: mock(() =>
    Promise.resolve('https://mock-replicate-output.com/video.mp4')
  ),
}))

// Мок для helpers/pulse
mock.module('@/helpers', () => ({
  pulse: mock(() => Promise.resolve()),
}))

// Мок для price/helpers
mock.module('@/price/helpers', () => ({
  processBalanceVideoOperation: mock(() =>
    Promise.resolve({ success: true, newBalance: 95, paymentAmount: 5 })
  ),
}))

// Мок для fs/promises
mock.module('fs/promises', () => ({
  mkdir: mock(() => Promise.resolve()),
  writeFile: mock(() => Promise.resolve()),
}))

// Мок для core/supabase
mock.module('@/core/supabase', () => ({
  getUserByTelegramIdString: mock(() =>
    Promise.resolve({
      id: 1,
      telegram_id: '123',
      level: 1,
      aspect_ratio: '1:1' /* ... other user fields */,
    })
  ),
  saveVideoUrlToSupabase: mock(() => Promise.resolve()),
  updateUserLevelPlusOne: mock(() => Promise.resolve()),
  supabaseUpdateUserLevelPlusOne: mock(() => Promise.resolve()), // Alias used in the source file
}))

// Мок для core/bot
const mockSendMessage = mock(() => Promise.resolve())
const mockSendVideo = mock(() => Promise.resolve())
const mockTelegramInstance = {
  sendMessage: mockSendMessage,
  sendVideo: mockSendVideo,
}
const mockBotInstance = {
  telegram: mockTelegramInstance,
  context: { botName: 'test_bot' },
} as unknown as Telegraf<MyContext>

mock.module('@/core/bot', () => ({
  getBotByName: mock(() => ({ bot: mockBotInstance })),
}))

// Мок для helpers/error
mock.module('@/helpers/error', () => ({
  sendServiceErrorToUser: mock(() => Promise.resolve()),
  sendServiceErrorToAdmin: mock(() => Promise.resolve()),
}))

// Мок для utils/logger
const mockLoggerInfo = mock(() => {})
const mockLoggerError = mock(() => {})
mock.module('@/utils/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    error: mockLoggerError,
  },
}))

// Мок для helpers/botName.helper
mock.module('@/helpers/botName.helper', () => ({
  toBotName: mock((name: string) => name), // Simple passthrough mock
}))

// --- Тесты --- //

describe('Plan B: generateTextToVideo Service', () => {
  beforeEach(() => {
    // Сброс всех моков перед каждым тестом
    mock.restore()
    // Можно добавить специфичные сбросы или установки для моков, если нужно
    mockSendMessage.mockClear()
    mockSendVideo.mockClear()
    mockLoggerInfo.mockClear()
    mockLoggerError.mockClear()
  })

  afterEach(() => {
    mock.restore()
  })

  it('should successfully generate a video with valid inputs', async () => {
    // Arrange
    const params = {
      prompt: 'a running dog',
      videoModel: 'wan-text-to-video' as keyof typeof VIDEO_MODELS_CONFIG,
      telegram_id: '12345',
      username: 'testuser',
      is_ru: false,
      bot_name: 'test_bot',
    }

    // Act
    const result = await generateTextToVideo(
      params.prompt,
      params.videoModel,
      params.telegram_id,
      params.username,
      params.is_ru,
      params.bot_name
    )

    // Assert
    expect(result).toHaveProperty('videoLocalPath')
    expect(result.videoLocalPath).toContain('.mp4')
    // TODO: Добавить больше проверок на вызовы моков
    // expect(mockSendMessage).toHaveBeenCalled()
    // expect(mockSendVideo).toHaveBeenCalled()
    // ... другие проверки ...
  })

  // TODO: Добавить тесты для случаев с ошибками
  // - Недостаточно баланса
  // - Ошибка API replicate
  // - Ошибка Supabase
  // - Невалидные входные данные
})
