import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'
import { answerAi } from '@/core/openai/requests'

// Mock dependencies
vi.mock('@/core/openai', () => ({
  openai: {
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  },
}))

vi.mock('@/services/generateNanoBananaPro', () => ({
  generateNanoBananaPro: vi.fn(),
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('answerAi', () => {
  const mockUserData = {
    username: 'testuser',
    first_name: 'Test',
    last_name: 'User',
    company: 'Test Company',
    position: 'Developer',
    designation: 'Senior',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key'
  })

  describe('1. Gemini модель + запрос на изображение', () => {
    it('должна использовать Nano Banana Pro для Gemini модели с запросом на изображение', async () => {
      const { generateNanoBananaPro } = await import('@/services/generateNanoBananaPro')
      const mockGenerateNanoBananaPro = generateNanoBananaPro as Mock

      mockGenerateNanoBananaPro.mockResolvedValue({
        images: [
          {
            url: 'https://example.com/image.png',
            width: 1024,
            height: 1024,
            content_type: 'image/png',
          },
        ],
      })

      const result = await answerAi(
        'google/gemini-3-pro-preview',
        mockUserData,
        'Сделай картинку Супермена',
        'ru'
      )

      expect(result).toEqual({
        type: 'image',
        imageUrl: 'https://example.com/image.png',
      })
      expect(mockGenerateNanoBananaPro).toHaveBeenCalledWith({
        prompt: 'Супермена',
        numImages: 1,
        aspectRatio: '1:1',
        resolution: '1K',
      })
    })

    it('должна извлекать промпт из запроса (убирать ключевые слова)', async () => {
      const { generateNanoBananaPro } = await import('@/services/generateNanoBananaPro')
      const mockGenerateNanoBananaPro = generateNanoBananaPro as Mock

      mockGenerateNanoBananaPro.mockResolvedValue({
        images: [{ url: 'https://example.com/image.png', width: 1024, height: 1024, content_type: 'image/png' }],
      })

      await answerAi('google/gemini-3-pro', mockUserData, 'нарисуй кота', 'ru')

      expect(mockGenerateNanoBananaPro).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'кота',
        })
      )
    })

    it('должна возвращать текстовую ошибку если Nano Banana Pro не удалось', async () => {
      const { generateNanoBananaPro } = await import('@/services/generateNanoBananaPro')
      const mockGenerateNanoBananaPro = generateNanoBananaPro as Mock

      mockGenerateNanoBananaPro.mockRejectedValue(new Error('Unauthorized'))

      const result = await answerAi('google/gemini-3-pro', mockUserData, 'сделай картинку', 'ru')

      expect(typeof result).toBe('string')
      expect(result).toContain('не удалось сгенерировать изображение')
      expect(result).toContain('Unauthorized')
    })

    it('должна определять запросы на изображение на английском', async () => {
      const { generateNanoBananaPro } = await import('@/services/generateNanoBananaPro')
      const mockGenerateNanoBananaPro = generateNanoBananaPro as Mock

      mockGenerateNanoBananaPro.mockResolvedValue({
        images: [{ url: 'https://example.com/image.png', width: 1024, height: 1024, content_type: 'image/png' }],
      })

      const result = await answerAi('google/gemini-3-pro', mockUserData, 'make image of superman', 'en')

      expect(result).toEqual({
        type: 'image',
        imageUrl: 'https://example.com/image.png',
      })
    })
  })

  describe('2. Обычные текстовые запросы через OpenRouter', () => {
    it('должна использовать OpenRouter API для обычных запросов', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'Hello, this is a test response',
              },
            },
          ],
        }),
      })

      global.fetch = mockFetch

      const result = await answerAi('deepseek/deepseek-chat', mockUserData, 'Hello', 'en')

      expect(typeof result).toBe('string')
      expect(result).toBe('Hello, this is a test response')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-openrouter-key',
          }),
        })
      )
    })

    it('должна обрабатывать ошибки OpenRouter API', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      })

      global.fetch = mockFetch

      await expect(
        answerAi('deepseek/deepseek-chat', mockUserData, 'Hello', 'en')
      ).rejects.toThrow('OpenRouter API error: 401 - Unauthorized')
    })

    it('должна использовать fallback на DeepSeek если OpenRouter недоступен', async () => {
      delete process.env.OPENROUTER_API_KEY

      const { openai } = await import('@/core/openai')
      const mockCreate = openai.chat.completions.create as Mock

      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: 'DeepSeek fallback response',
            },
          },
        ],
      })

      const result = await answerAi('deepseek/deepseek-chat', mockUserData, 'Hello', 'en')

      expect(typeof result).toBe('string')
      expect(result).toBe('DeepSeek fallback response')
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'deepseek-chat',
        })
      )
    })
  })

  describe('3. Определение запросов на изображение', () => {
    it('НЕ должна использовать Nano Banana Pro для не-Gemini моделей', async () => {
      const { generateNanoBananaPro } = await import('@/services/generateNanoBananaPro')
      const mockGenerateNanoBananaPro = generateNanoBananaPro as Mock

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Text response' } }],
        }),
      })

      global.fetch = mockFetch

      const result = await answerAi('deepseek/deepseek-chat', mockUserData, 'сделай картинку', 'ru')

      expect(mockGenerateNanoBananaPro).not.toHaveBeenCalled()
      expect(typeof result).toBe('string')
    })

    it('НЕ должна использовать Nano Banana Pro для Gemini без запроса на изображение', async () => {
      const { generateNanoBananaPro } = await import('@/services/generateNanoBananaPro')
      const mockGenerateNanoBananaPro = generateNanoBananaPro as Mock

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Text response' } }],
        }),
      })

      global.fetch = mockFetch

      const result = await answerAi('google/gemini-3-pro', mockUserData, 'Привет, как дела?', 'ru')

      expect(mockGenerateNanoBananaPro).not.toHaveBeenCalled()
      expect(typeof result).toBe('string')
    })
  })

  describe('4. System prompt', () => {
    it('должна включать system prompt в запрос к OpenRouter', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
        }),
      })

      global.fetch = mockFetch

      await answerAi('deepseek/deepseek-chat', mockUserData, 'Hello', 'en', 'You are a helpful assistant')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('You are a helpful assistant'),
        })
      )
    })
  })

  describe('5. Edge cases', () => {
    it('должна обрабатывать пустой ответ от OpenRouter', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: {} }],
        }),
      })

      global.fetch = mockFetch

      await expect(
        answerAi('deepseek/deepseek-chat', mockUserData, 'Hello', 'en')
      ).rejects.toThrow('Empty response from OpenRouter')
    })

    it('должна обрабатывать ошибки сети', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))

      global.fetch = mockFetch

      const { openai } = await import('@/core/openai')
      const mockCreate = openai.chat.completions.create as Mock

      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Fallback' } }],
      })

      const result = await answerAi('deepseek/deepseek-chat', mockUserData, 'Hello', 'en')

      expect(result).toBe('Fallback')
    })
  })
})

