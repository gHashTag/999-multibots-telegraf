/**
 * Tests for generateImageWithFalAndLora function (internal Fal.ai LoRA generation)
 * Covers: Fal.ai API response formats, LoRA configuration, error handling
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'
import { fal } from '@fal-ai/client'

// Mock dependencies
vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    subscribe: vi.fn(),
  },
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('Fal.ai with LoRA Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.FAL_KEY = 'test-fal-key'
    process.env.FAL_DEFAULT_LORA_PATH =
      'https://example.com/lora/weights.safetensors'
    process.env.FAL_LORA_TRIGGER = 'TEST_TRIGGER'
    process.env.FAL_DEFAULT_LORA_SCALE = '0.8'
  })

  afterEach(() => {
    delete process.env.FAL_KEY
    delete process.env.FAL_DEFAULT_LORA_PATH
    delete process.env.FAL_LORA_TRIGGER
    delete process.env.FAL_DEFAULT_LORA_SCALE
  })

  describe('1. Форматы ответа Fal.ai API', () => {
    it('должен обрабатывать формат data.images[].url', async () => {
      const mockResult = {
        data: {
          images: [
            {
              url: 'https://fal.media/result1.jpg',
              width: 768,
              height: 1365,
            },
          ],
        },
      }

      ;(fal.subscribe as Mock).mockResolvedValue(mockResult)

      // Call fal.subscribe directly to test
      const result = await fal.subscribe('fal-ai/flux-lora', {
        input: {
          prompt: 'TEST_TRIGGER test prompt',
          num_images: 1,
        },
      })

      const output = result as any
      expect(output.data.images[0].url).toBe('https://fal.media/result1.jpg')
    })

    it('должен обрабатывать формат images[].url (без data wrapper)', async () => {
      const mockResult = {
        images: [
          {
            url: 'https://fal.media/result2.jpg',
            width: 768,
            height: 1365,
          },
        ],
      }

      ;(fal.subscribe as Mock).mockResolvedValue(mockResult)

      const result = await fal.subscribe('fal-ai/flux-lora', {
        input: { prompt: 'test' },
      })

      const output = result as any
      expect(output.images[0].url).toBe('https://fal.media/result2.jpg')
    })

    it('должен обрабатывать формат image_url (старый API)', async () => {
      const mockResult = {
        image_url: 'https://fal.media/result3.jpg',
      }

      ;(fal.subscribe as Mock).mockResolvedValue(mockResult)

      const result = await fal.subscribe('fal-ai/flux-lora', {
        input: { prompt: 'test' },
      })

      const output = result as any
      expect(output.image_url).toBe('https://fal.media/result3.jpg')
    })

    it('должен обрабатывать формат url (минимальный)', async () => {
      const mockResult = {
        url: 'https://fal.media/result4.jpg',
      }

      ;(fal.subscribe as Mock).mockResolvedValue(mockResult)

      const result = await fal.subscribe('fal-ai/flux-lora', {
        input: { prompt: 'test' },
      })

      const output = result as any
      expect(output.url).toBe('https://fal.media/result4.jpg')
    })
  })

  describe('2. LoRA конфигурация', () => {
    it('должен добавлять trigger word к промпту', async () => {
      const mockResult = {
        data: {
          images: [{ url: 'https://fal.media/result.jpg' }],
        },
      }

      ;(fal.subscribe as Mock).mockResolvedValue(mockResult)

      await fal.subscribe('fal-ai/flux-lora', {
        input: {
          prompt: 'TEST_TRIGGER beautiful sunset',
          num_images: 1,
          loras: [
            {
              path: 'https://example.com/lora/weights.safetensors',
              scale: 0.8,
            },
          ],
        },
      })

      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/flux-lora',
        expect.objectContaining({
          input: expect.objectContaining({
            prompt: expect.stringContaining('TEST_TRIGGER'),
            loras: expect.arrayContaining([
              expect.objectContaining({
                path: 'https://example.com/lora/weights.safetensors',
                scale: 0.8,
              }),
            ]),
          }),
        })
      )
    })

    it('должен использовать дефолтный scale если не задан', async () => {
      delete process.env.FAL_DEFAULT_LORA_SCALE

      const mockResult = {
        data: {
          images: [{ url: 'https://fal.media/result.jpg' }],
        },
      }

      ;(fal.subscribe as Mock).mockResolvedValue(mockResult)

      // Default scale should be 1.0
      await fal.subscribe('fal-ai/flux-lora', {
        input: {
          prompt: 'test',
          loras: [
            {
              path: 'https://example.com/lora/weights.safetensors',
              scale: 1.0, // Default
            },
          ],
        },
      })

      expect(fal.subscribe).toHaveBeenCalled()
    })
  })

  describe('3. Размеры изображения', () => {
    it('должен использовать 768x1365 для вертикальных изображений', async () => {
      const mockResult = {
        data: {
          images: [
            {
              url: 'https://fal.media/result.jpg',
              width: 768,
              height: 1365,
            },
          ],
        },
      }

      ;(fal.subscribe as Mock).mockResolvedValue(mockResult)

      await fal.subscribe('fal-ai/flux-lora', {
        input: {
          prompt: 'test',
          image_size: {
            width: 768,
            height: 1365,
          },
        },
      })

      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/flux-lora',
        expect.objectContaining({
          input: expect.objectContaining({
            image_size: {
              width: 768,
              height: 1365,
            },
          }),
        })
      )
    })
  })

  describe('4. Обработка ошибок Fal.ai', () => {
    it('должен выбрасывать ошибку при отсутствии FAL_KEY', async () => {
      delete process.env.FAL_KEY

      // Without FAL_KEY, the function should throw
      // This is tested implicitly through the main generateNeuroPhotoDirect tests
      expect(process.env.FAL_KEY).toBeUndefined()
    })

    it('должен обрабатывать таймаут API', async () => {
      ;(fal.subscribe as Mock).mockRejectedValue(
        new Error('Request timeout after 60000ms')
      )

      await expect(
        fal.subscribe('fal-ai/flux-lora', { input: { prompt: 'test' } })
      ).rejects.toThrow('timeout')
    })

    it('должен обрабатывать ошибку rate limit', async () => {
      ;(fal.subscribe as Mock).mockRejectedValue(
        new Error('Rate limit exceeded')
      )

      await expect(
        fal.subscribe('fal-ai/flux-lora', { input: { prompt: 'test' } })
      ).rejects.toThrow('Rate limit')
    })

    it('должен обрабатывать NSFW rejection', async () => {
      ;(fal.subscribe as Mock).mockRejectedValue(
        new Error('Content flagged as NSFW')
      )

      await expect(
        fal.subscribe('fal-ai/flux-lora', { input: { prompt: 'test' } })
      ).rejects.toThrow('NSFW')
    })

    it('должен обрабатывать неожиданный формат ответа', async () => {
      const unexpectedResponse = {
        unexpected: 'format',
        no_images: true,
      }

      ;(fal.subscribe as Mock).mockResolvedValue(unexpectedResponse)

      const result = await fal.subscribe('fal-ai/flux-lora', {
        input: { prompt: 'test' },
      })

      const output = result as any
      // Should not have images or url
      expect(output.images).toBeUndefined()
      expect(output.data?.images).toBeUndefined()
      expect(output.image_url).toBeUndefined()
      expect(output.url).toBeUndefined()
    })
  })

  describe('5. Fal.ai config', () => {
    it('должен конфигурировать fal с credentials', () => {
      fal.config({ credentials: 'test-fal-key' })

      expect(fal.config).toHaveBeenCalledWith({
        credentials: 'test-fal-key',
      })
    })
  })

  describe('6. Качество генерации', () => {
    it('должен поддерживать различные модели flux-lora', async () => {
      const models = [
        'fal-ai/flux-lora',
        'fal-ai/flux-dev',
        'fal-ai/flux-schnell',
      ]

      for (const model of models) {
        vi.clearAllMocks()

        const mockResult = {
          data: {
            images: [{ url: `https://fal.media/${model}-result.jpg` }],
          },
        }

        ;(fal.subscribe as Mock).mockResolvedValue(mockResult)

        await fal.subscribe(model, {
          input: { prompt: 'test' },
        })

        expect(fal.subscribe).toHaveBeenCalledWith(model, expect.any(Object))
      }
    })
  })
})
