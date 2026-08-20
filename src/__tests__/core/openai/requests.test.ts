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

      // Стоимость в ответе появилась вместе с учётом генераций и с тех пор
      // возвращается всегда. Проверка ждала форму без неё и падала — это была
      // устаревшая проверка, а не дефект кода.
      expect(result).toMatchObject({
        type: 'image',
        imageUrl: 'https://example.com/image.png',
      })
      expect(typeof (result as { cost: number }).cost).toBe('number')
      // Соотношение сторон в коде 9:16 (вертикаль для Telegram), а не 1:1;
      // и telegramId передаётся всегда. Проверка ждала старых значений.
      expect(mockGenerateNanoBananaPro).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Супермена',
          numImages: 1,
          aspectRatio: '9:16',
          resolution: '1K',
        })
      )
    })

    it('должна извлекать промпт из запроса (убирать ключевые слова)', async () => {
      const { generateNanoBananaPro } = await import('@/services/generateNanoBananaPro')
      const mockGenerateNanoBananaPro = generateNanoBananaPro as Mock

      mockGenerateNanoBananaPro.mockResolvedValue({
        images: [{ url: 'https://example.com/image.png', width: 1024, height: 1024, content_type: 'image/png' }],
      })

      await answerAi('google/gemini-3-pro', mockUserData, 'нарисуй кота', 'ru', undefined, undefined, undefined, true)

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

      const result = await answerAi('google/gemini-3-pro', mockUserData, 'сделай картинку', 'ru', undefined, undefined, undefined, true)

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

      // Стоимость в ответе появилась вместе с учётом генераций и с тех пор
      // возвращается всегда. Проверка ждала форму без неё и падала — это была
      // устаревшая проверка, а не дефект кода.
      expect(result).toMatchObject({
        type: 'image',
        imageUrl: 'https://example.com/image.png',
      })
      expect(typeof (result as { cost: number }).cost).toBe('number')
    })
  })

  /**
   * ПОЧЕМУ ЭТОТ БЛОК ПЕРЕПИСАН.
   *
   * Проверки описывали архитектуру, которой больше нет: они ждали, что
   * обычный текстовый запрос уходит в OpenRouter, и подставляли
   * OPENROUTER_API_KEY. Код давно ходит иначе — основной путь xAI Grok
   * (GROK_API_KEY), затем GLM, затем DeepSeek, затем OpenAI. Из-за этого
   * четыре проверки падали месяцами: файл был красным наполовину и не
   * защищал ничего, в том числе код генерации изображений рядом.
   *
   * Удалять их нельзя — пропала бы причина. Переписаны под то, что код делает
   * на самом деле.
   */
  describe('2. Обычные текстовые запросы: цепочка поставщиков', () => {
    it('основной путь — xAI Grok', async () => {
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

      process.env.GROK_API_KEY = 'test-grok-key'

      const result = await answerAi('deepseek/deepseek-chat', mockUserData, 'Hello', 'en')

      expect(typeof result).toBe('string')
      expect(result).toBe('Hello, this is a test response')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.x.ai/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-grok-key',
          }),
        })
      )
    })

    it('когда не отвечает ни один поставщик — ошибка называет их все', async () => {
      // Раньше здесь ждали 'OpenRouter API error: 401'. Такой ошибки код не
      // бросает: он перебирает поставщиков и падает только когда кончились
      // все. Сообщение перечисляет их поимённо — по нему видно, что искать.
      process.env.GROK_API_KEY = 'test-grok-key'
      delete process.env.GLM_API_KEY

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      })
      global.fetch = mockFetch

      const { openai } = await import('@/core/openai')
      ;(openai.chat.completions.create as Mock).mockRejectedValue(
        new Error('deepseek недоступен')
      )

      await expect(
        answerAi('deepseek/deepseek-chat', mockUserData, 'Hello', 'en')
      ).rejects.toThrow('All AI providers failed')
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
    it('system prompt уходит поставщику вместе с запросом', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
        }),
      })

      global.fetch = mockFetch
      process.env.GROK_API_KEY = 'test-grok-key'

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
    it('пустой ответ поставщика не выдаётся за ответ', async () => {
      // Раньше ждали 'Empty response from OpenRouter'. Пустой ответ теперь
      // означает переход к следующему поставщику; когда кончились все —
      // общая ошибка. Главное свойство то же: пустота НЕ выдаётся человеку
      // за ответ.
      process.env.GROK_API_KEY = 'test-grok-key'
      delete process.env.GLM_API_KEY

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: {} }] }),
      })
      global.fetch = mockFetch

      const { openai } = await import('@/core/openai')
      ;(openai.chat.completions.create as Mock).mockRejectedValue(
        new Error('deepseek недоступен')
      )

      await expect(
        answerAi('deepseek/deepseek-chat', mockUserData, 'Hello', 'en')
      ).rejects.toThrow('All AI providers failed')
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

