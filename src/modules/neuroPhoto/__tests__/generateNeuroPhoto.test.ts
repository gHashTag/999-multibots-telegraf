import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { generateNeuroPhoto } from '../index'
import type { MyContext } from '@/interfaces'
import { NeuroPhotoDependencies } from '../interfaces'

// Mock dependencies
describe('generateNeuroPhoto Service', () => {
  let ctx: MyContext
  let mockSendMessage: any
  let dependencies: NeuroPhotoDependencies
  const telegramId = '12345'
  const prompt = 'A beautiful landscape'
  const modelUrl = 'stability-ai/stable-diffusion'
  const numImages = 1
  const botName = 'test_bot'

  beforeEach(() => {
    vi.resetAllMocks()

    // Mock Telegram context
    mockSendMessage = vi.fn()
    ctx = {
      telegram: {
        sendMessage: mockSendMessage,
      } as any,
    } as MyContext

    // Mock dependencies
    dependencies = {
      userHelper: {
        getUser: vi.fn().mockResolvedValue({
          id: telegramId,
          balance: 100,
          level: 1,
        }),
      },
      balanceHelper: {
        processBalance: vi.fn().mockResolvedValue({
          success: true,
          newBalance: 90,
        }),
      },
      imageGenerationApi: {
        run: vi
          .fn()
          .mockResolvedValue(['https://example.com/generated-image.jpg']),
      },
      saveHelper: {
        saveImageUrl: vi.fn().mockResolvedValue({
          success: true,
          imageId: 'img123',
        }),
      },
      downloadFile: vi.fn().mockResolvedValue(Buffer.from('fake image data')),
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      },
      telegramSceneAdapter: {
        onGenerationStart: vi.fn().mockResolvedValue(undefined),
        onGenerationComplete: vi.fn().mockResolvedValue(undefined),
        onError: vi.fn().mockResolvedValue(undefined),
      },
    }
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('✅ Успешная генерация нейрофото', async () => {
    const result = await generateNeuroPhoto(
      prompt,
      modelUrl,
      numImages,
      telegramId,
      ctx,
      botName,
      dependencies
    )

    expect(result).toBeDefined()
    expect(result?.success).toBe(true)
    expect(result?.urls).toBeDefined()
    expect(result?.urls?.length).toBe(numImages)
    expect(
      dependencies.telegramSceneAdapter.onGenerationStart
    ).toHaveBeenCalledWith(ctx, telegramId)
    expect(
      dependencies.telegramSceneAdapter.onGenerationComplete
    ).toHaveBeenCalledWith(
      ctx,
      telegramId,
      expect.arrayContaining(['https://example.com/generated-image.jpg'])
    )
  })

  it('❌ Ошибка: отсутствует промпт', async () => {
    const result = await generateNeuroPhoto(
      '',
      modelUrl,
      numImages,
      telegramId,
      ctx,
      botName,
      dependencies
    )

    expect(result).toBeNull()
    expect(dependencies.telegramSceneAdapter.onError).toHaveBeenCalledWith(
      ctx,
      telegramId,
      'Prompt not provided'
    )
  })

  it('❌ Ошибка: отсутствует URL модели', async () => {
    const result = await generateNeuroPhoto(
      prompt,
      '',
      numImages,
      telegramId,
      ctx,
      botName,
      dependencies
    )

    expect(result).toBeNull()
    expect(dependencies.telegramSceneAdapter.onError).toHaveBeenCalledWith(
      ctx,
      telegramId,
      'Model URL not provided'
    )
  })

  it('❌ Ошибка: пользователь не найден', async () => {
    dependencies.userHelper.getUser = vi.fn().mockResolvedValue(null)

    const result = await generateNeuroPhoto(
      prompt,
      modelUrl,
      numImages,
      telegramId,
      ctx,
      botName,
      dependencies
    )

    expect(result).toBeNull()
    expect(dependencies.telegramSceneAdapter.onError).toHaveBeenCalledWith(
      ctx,
      telegramId,
      'User not found'
    )
  })

  it('❌ Ошибка: недостаточно средств', async () => {
    dependencies.balanceHelper.processBalance = vi.fn().mockResolvedValue({
      success: false,
    })

    const result = await generateNeuroPhoto(
      prompt,
      modelUrl,
      numImages,
      telegramId,
      ctx,
      botName,
      dependencies
    )

    expect(result).toBeDefined()
    expect(result?.success).toBe(false)
    expect(dependencies.telegramSceneAdapter.onError).toHaveBeenCalledWith(
      ctx,
      telegramId,
      'Insufficient funds'
    )
  })

  it('❌ Ошибка: сбой при генерации изображения', async () => {
    dependencies.imageGenerationApi.run = vi
      .fn()
      .mockRejectedValue(new Error('API error'))

    const result = await generateNeuroPhoto(
      prompt,
      modelUrl,
      numImages,
      telegramId,
      ctx,
      botName,
      dependencies
    )

    expect(result).toBeDefined()
    expect(result?.success).toBe(false)
    expect(dependencies.telegramSceneAdapter.onError).toHaveBeenCalledWith(
      ctx,
      telegramId,
      'Generation error'
    )
  })
})
