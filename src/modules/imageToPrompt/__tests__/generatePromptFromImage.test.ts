import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { generatePromptFromImage } from '../index'
import type { MyContext } from '@/interfaces'
import { ImageToPromptDependencies } from '../interfaces'

// Mock dependencies
describe('generatePromptFromImage Service', () => {
  let ctx: MyContext
  let mockSendMessage: any
  let dependencies: ImageToPromptDependencies
  const telegramId = '12345'
  const imageUrl = 'https://example.com/image.jpg'
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
          newBalance: 95,
        }),
      },
      imageAnalysisApi: {
        run: vi.fn().mockResolvedValue({ prompt: 'Description of the image' }),
      },
      saveHelper: {
        savePrompt: vi.fn().mockResolvedValue({
          success: true,
          promptId: 'prompt123',
        }),
      },
      downloadFile: vi.fn().mockResolvedValue(Buffer.from('fake image data')),
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      },
      telegramSceneAdapter: {
        onAnalysisStart: vi.fn().mockResolvedValue(undefined),
        onAnalysisComplete: vi.fn().mockResolvedValue(undefined),
        onError: vi.fn().mockResolvedValue(undefined),
      },
    }
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('✅ Успешная генерация промпта из изображения', async () => {
    const result = await generatePromptFromImage(
      imageUrl,
      telegramId,
      ctx,
      botName,
      dependencies
    )

    expect(result).toBeDefined()
    expect(result?.success).toBe(true)
    expect(result?.prompt).toBeDefined()
    expect(result?.prompt).toBe('Description of the image')
    expect(
      dependencies.telegramSceneAdapter.onAnalysisStart
    ).toHaveBeenCalledWith(ctx, telegramId)
    expect(
      dependencies.telegramSceneAdapter.onAnalysisComplete
    ).toHaveBeenCalledWith(ctx, telegramId, 'Description of the image')
  })

  it('❌ Ошибка: отсутствует URL изображения', async () => {
    const result = await generatePromptFromImage(
      '',
      telegramId,
      ctx,
      botName,
      dependencies
    )

    expect(result).toBeNull()
    expect(dependencies.telegramSceneAdapter.onError).toHaveBeenCalledWith(
      ctx,
      telegramId,
      'Image URL not provided'
    )
  })

  it('❌ Ошибка: пользователь не найден', async () => {
    dependencies.userHelper.getUser = vi.fn().mockResolvedValue(null)

    const result = await generatePromptFromImage(
      imageUrl,
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

    const result = await generatePromptFromImage(
      imageUrl,
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

  it('❌ Ошибка: сбой при анализе изображения', async () => {
    dependencies.imageAnalysisApi.run = vi
      .fn()
      .mockRejectedValue(new Error('API error'))

    const result = await generatePromptFromImage(
      imageUrl,
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
      'Analysis error'
    )
  })
})
