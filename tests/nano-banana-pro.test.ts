/**
 * Тесты для Nano Banana Pro интеграции
 *
 * Покрытие тестами:
 * 1. Успешная генерация изображения
 * 2. Обработка различных соотношений сторон
 * 3. Обработка различных разрешений
 * 4. Обработка ошибок API
 * 5. Валидация параметров
 * 6. Конвертация размеров в соотношения сторон
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fal } from '@fal-ai/client'

// Mock fal-ai client
vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    subscribe: vi.fn(),
  },
}))

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock config
vi.mock('@/config', () => ({
  FAL_KEY: 'test-fal-key',
}))

import { logger } from '@/utils/logger'
import { generateNanoBananaPro } from '@/services/generateNanoBananaPro'

describe('Nano Banana Pro Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Успешная генерация', () => {
    it('должна успешно сгенерировать изображение с базовыми параметрами', async () => {
      const mockResponse = {
        data: {
          images: [
            {
              url: 'https://example.com/image.png',
              width: 1024,
              height: 1024,
              content_type: 'image/png',
            },
          ],
          description: 'Test image',
        },
        requestId: 'test-request-id',
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      const result = await generateNanoBananaPro({
        prompt: 'A beautiful sunset',
        numImages: 1,
        aspectRatio: '1:1',
        telegramId: '123456789',
      })

      expect(result.images).toHaveLength(1)
      expect(result.images[0].url).toBe('https://example.com/image.png')
      expect(fal.config).toHaveBeenCalledWith({
        credentials: 'test-fal-key',
      })
      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/nano-banana-pro',
        expect.objectContaining({
          input: expect.objectContaining({
            prompt: 'A beautiful sunset',
            num_images: 1,
            aspect_ratio: '1:1',
          }),
        })
      )
    })

    it('должна поддерживать различные соотношения сторон', async () => {
      const aspectRatios = ['21:9', '16:9', '3:2', '4:3', '1:1', '9:16']

      for (const ratio of aspectRatios) {
        fal.subscribe.mockResolvedValue({
          data: {
            images: [
              {
                url: 'https://example.com/image.png',
                width: 1024,
                height: 1024,
                content_type: 'image/png',
              },
            ],
          },
          requestId: 'test-id',
        })

        await generateNanoBananaPro({
          prompt: 'Test',
          aspectRatio: ratio,
          telegramId: '123',
        })

        expect(fal.subscribe).toHaveBeenCalledWith(
          'fal-ai/nano-banana-pro',
          expect.objectContaining({
            input: expect.objectContaining({
              aspect_ratio: ratio,
            }),
          })
        )
      }
    })

    it('должна поддерживать различные разрешения', async () => {
      const resolutions: Array<'1K' | '2K' | '4K'> = ['1K', '2K', '4K']

      for (const resolution of resolutions) {
        fal.subscribe.mockResolvedValue({
          data: {
            images: [
              {
                url: 'https://example.com/image.png',
                width: 1024,
                height: 1024,
                content_type: 'image/png',
              },
            ],
          },
          requestId: 'test-id',
        })

        await generateNanoBananaPro({
          prompt: 'Test',
          resolution,
          telegramId: '123',
        })

        expect(fal.subscribe).toHaveBeenCalledWith(
          'fal-ai/nano-banana-pro',
          expect.objectContaining({
            input: expect.objectContaining({
              resolution,
            }),
          })
        )
      }
    })
  })

  describe('Конвертация размеров в соотношения сторон', () => {
    it('должна правильно определять соотношение 16:9 из размеров', async () => {
      fal.subscribe.mockResolvedValue({
        data: {
          images: [
            {
              url: 'https://example.com/image.png',
              width: 1920,
              height: 1080,
              content_type: 'image/png',
            },
          ],
        },
        requestId: 'test-id',
      })

      await generateNanoBananaPro({
        prompt: 'Test',
        width: 1920,
        height: 1080,
        telegramId: '123',
      })

      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/nano-banana-pro',
        expect.objectContaining({
          input: expect.objectContaining({
            aspect_ratio: '16:9',
          }),
        })
      )
    })

    it('должна правильно определять соотношение 2:3 из размеров (вертикальное)', async () => {
      fal.subscribe.mockResolvedValue({
        data: {
          images: [
            {
              url: 'https://example.com/image.png',
              width: 1080,
              height: 1920,
              content_type: 'image/png',
            },
          ],
        },
        requestId: 'test-id',
      })

      await generateNanoBananaPro({
        prompt: 'Test',
        width: 1080,
        height: 1920,
        telegramId: '123',
      })

      // 1080/1920 = 0.5625, что попадает в диапазон для 2:3
      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/nano-banana-pro',
        expect.objectContaining({
          input: expect.objectContaining({
            aspect_ratio: '2:3',
          }),
        })
      )
    })

    it('должна автоматически выбирать 4K для больших размеров', async () => {
      fal.subscribe.mockResolvedValue({
        data: {
          images: [
            {
              url: 'https://example.com/image.png',
              width: 3840,
              height: 2160,
              content_type: 'image/png',
            },
          ],
        },
        requestId: 'test-id',
      })

      await generateNanoBananaPro({
        prompt: 'Test',
        width: 3840,
        height: 2160,
        telegramId: '123',
      })

      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/nano-banana-pro',
        expect.objectContaining({
          input: expect.objectContaining({
            resolution: '4K',
          }),
        })
      )
    })
  })

  describe('Обработка ошибок', () => {
    it('должна выбрасывать ошибку при сбое API', async () => {
      fal.subscribe.mockRejectedValue(new Error('API Error'))

      await expect(
        generateNanoBananaPro({
          prompt: 'Test',
          telegramId: '123',
        })
      ).rejects.toThrow('Nano Banana Pro generation failed: API Error')

      expect(logger.error).toHaveBeenCalled()
    })

    it('должна выбрасывать ошибку при пустом ответе', async () => {
      fal.subscribe.mockResolvedValue({
        data: {
          images: [],
        },
        requestId: 'test-id',
      })

      await expect(
        generateNanoBananaPro({
          prompt: 'Test',
          telegramId: '123',
        })
      ).rejects.toThrow()
    })

    it('должна логировать все операции', async () => {
      fal.subscribe.mockResolvedValue({
        data: {
          images: [
            {
              url: 'https://example.com/image.png',
              width: 1024,
              height: 1024,
              content_type: 'image/png',
            },
          ],
        },
        requestId: 'test-id',
      })

      await generateNanoBananaPro({
        prompt: 'Test',
        telegramId: '123',
      })

      expect(logger.info).toHaveBeenCalledWith(
        '[NANO BANANA PRO] Starting image generation',
        expect.any(Object)
      )
      expect(logger.info).toHaveBeenCalledWith(
        '[NANO BANANA PRO] Generation completed',
        expect.any(Object)
      )
    })
  })

  describe('Форматы вывода', () => {
    it('должна поддерживать PNG формат по умолчанию', async () => {
      fal.subscribe.mockResolvedValue({
        data: {
          images: [
            {
              url: 'https://example.com/image.png',
              width: 1024,
              height: 1024,
              content_type: 'image/png',
            },
          ],
        },
        requestId: 'test-id',
      })

      await generateNanoBananaPro({
        prompt: 'Test',
        telegramId: '123',
      })

      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/nano-banana-pro',
        expect.objectContaining({
          input: expect.objectContaining({
            output_format: 'png',
          }),
        })
      )
    })

    it('должна поддерживать JPEG формат', async () => {
      fal.subscribe.mockResolvedValue({
        data: {
          images: [
            {
              url: 'https://example.com/image.jpg',
              width: 1024,
              height: 1024,
              content_type: 'image/jpeg',
            },
          ],
        },
        requestId: 'test-id',
      })

      await generateNanoBananaPro({
        prompt: 'Test',
        outputFormat: 'jpeg',
        telegramId: '123',
      })

      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/nano-banana-pro',
        expect.objectContaining({
          input: expect.objectContaining({
            output_format: 'jpeg',
          }),
        })
      )
    })
  })

  describe('Множественные изображения', () => {
    it('должна генерировать несколько изображений', async () => {
      fal.subscribe.mockResolvedValue({
        data: {
          images: [
            {
              url: 'https://example.com/image1.png',
              width: 1024,
              height: 1024,
              content_type: 'image/png',
            },
            {
              url: 'https://example.com/image2.png',
              width: 1024,
              height: 1024,
              content_type: 'image/png',
            },
            {
              url: 'https://example.com/image3.png',
              width: 1024,
              height: 1024,
              content_type: 'image/png',
            },
          ],
        },
        requestId: 'test-id',
      })

      const result = await generateNanoBananaPro({
        prompt: 'Test',
        numImages: 3,
        telegramId: '123',
      })

      expect(result.images).toHaveLength(3)
      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/nano-banana-pro',
        expect.objectContaining({
          input: expect.objectContaining({
            num_images: 3,
          }),
        })
      )
    })
  })
})
