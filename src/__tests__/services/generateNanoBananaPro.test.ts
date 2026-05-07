import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'
import {
  generateNanoBananaPro,
  getSupportedAspectRatios,
  getSupportedResolutions,
  getSupportedOutputFormats,
} from '@/services/generateNanoBananaPro'
import { fal } from '@fal-ai/client'

// Mock dependencies
vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    subscribe: vi.fn(),
  },
}))

vi.mock('@/config', () => ({
  FAL_KEY: 'test-fal-key',
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('generateNanoBananaPro', () => {
  let mockSubscribe: Mock

  beforeEach(() => {
    vi.clearAllMocks()
    mockSubscribe = vi.fn()
    ;(fal.subscribe as Mock) = mockSubscribe
  })

  describe('1. Успешная генерация изображения', () => {
    it('должна генерировать изображение с базовыми параметрами', async () => {
      const mockResult = {
        data: {
          images: [
            {
              url: 'https://example.com/image.png',
              width: 1024,
              height: 1024,
              content_type: 'image/png',
            },
          ],
          description: 'Generated image',
        },
        requestId: 'test-request-id',
      }

      mockSubscribe.mockResolvedValue(mockResult)

      const result = await generateNanoBananaPro({
        prompt: 'Superman flying',
        numImages: 1,
        aspectRatio: '1:1',
        resolution: '1K',
      })

      expect(result).toBeDefined()
      expect(result.images).toHaveLength(1)
      expect(result.images[0].url).toBe('https://example.com/image.png')
      expect(fal.config).toHaveBeenCalledWith({ credentials: 'test-fal-key' })
      expect(fal.subscribe).toHaveBeenCalledWith('fal-ai/nano-banana-pro', {
        input: {
          prompt: 'Superman flying',
          num_images: 1,
          aspect_ratio: '1:1',
          resolution: '1K',
          output_format: 'png',
        },
        logs: true,
        onQueueUpdate: expect.any(Function),
      })
    })

    it('должна генерировать несколько изображений', async () => {
      const mockResult = {
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
          ],
        },
        requestId: 'test-request-id',
      }

      mockSubscribe.mockResolvedValue(mockResult)

      const result = await generateNanoBananaPro({
        prompt: 'Superman',
        numImages: 2,
      })

      expect(result.images).toHaveLength(2)
      expect(result.images[0].url).toBe('https://example.com/image1.png')
      expect(result.images[1].url).toBe('https://example.com/image2.png')
    })

    it('должна использовать дефолтные значения для опциональных параметров', async () => {
      const mockResult = {
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
        requestId: 'test-request-id',
      }

      mockSubscribe.mockResolvedValue(mockResult)

      await generateNanoBananaPro({
        prompt: 'Test prompt',
      })

      expect(fal.subscribe).toHaveBeenCalledWith('fal-ai/nano-banana-pro', {
        input: {
          prompt: 'Test prompt',
          num_images: 1,
          aspect_ratio: '1:1',
          resolution: '1K',
          output_format: 'png',
        },
        logs: true,
        onQueueUpdate: expect.any(Function),
      })
    })
  })

  describe('2. Определение aspect ratio из width/height', () => {
    it('должна определять 16:9 для широкого изображения', async () => {
      const mockResult = {
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
        requestId: 'test-request-id',
      }

      mockSubscribe.mockResolvedValue(mockResult)

      await generateNanoBananaPro({
        prompt: 'Test',
        width: 1920,
        height: 1080,
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

    it('должна определять 9:16 для вертикального изображения', async () => {
      const mockResult = {
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
        requestId: 'test-request-id',
      }

      mockSubscribe.mockResolvedValue(mockResult)

      await generateNanoBananaPro({
        prompt: 'Test',
        width: 1080,
        height: 1920,
      })

      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/nano-banana-pro',
        expect.objectContaining({
          input: expect.objectContaining({
            aspect_ratio: '9:16',
          }),
        })
      )
    })

    it('должна определять 1:1 для квадратного изображения', async () => {
      const mockResult = {
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
        requestId: 'test-request-id',
      }

      mockSubscribe.mockResolvedValue(mockResult)

      await generateNanoBananaPro({
        prompt: 'Test',
        width: 1024,
        height: 1024,
      })

      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/nano-banana-pro',
        expect.objectContaining({
          input: expect.objectContaining({
            aspect_ratio: '1:1',
          }),
        })
      )
    })
  })

  describe('3. Определение resolution', () => {
    it('должна определять 4K для больших изображений', async () => {
      const mockResult = {
        data: {
          images: [
            {
              url: 'https://example.com/image.png',
              width: 4096,
              height: 4096,
              content_type: 'image/png',
            },
          ],
        },
        requestId: 'test-request-id',
      }

      mockSubscribe.mockResolvedValue(mockResult)

      await generateNanoBananaPro({
        prompt: 'Test',
        width: 4096,
        height: 4096,
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

    it('должна определять 2K для средних изображений', async () => {
      const mockResult = {
        data: {
          images: [
            {
              url: 'https://example.com/image.png',
              width: 2048,
              height: 2048,
              content_type: 'image/png',
            },
          ],
        },
        requestId: 'test-request-id',
      }

      mockSubscribe.mockResolvedValue(mockResult)

      await generateNanoBananaPro({
        prompt: 'Test',
        width: 2048,
        height: 2048,
      })

      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/nano-banana-pro',
        expect.objectContaining({
          input: expect.objectContaining({
            resolution: '2K',
          }),
        })
      )
    })
  })

  describe('4. Обработка ошибок', () => {
    it('должна выбрасывать ошибку если нет изображений в ответе', async () => {
      const mockResult = {
        data: {
          images: [],
        },
        requestId: 'test-request-id',
      }

      mockSubscribe.mockResolvedValue(mockResult)

      await expect(
        generateNanoBananaPro({
          prompt: 'Test',
        })
      ).rejects.toThrow(
        'Nano Banana Pro generation failed: No images generated'
      )
    })

    it('должна выбрасывать ошибку если Fal.ai API недоступен', async () => {
      mockSubscribe.mockRejectedValue(new Error('API Error'))

      await expect(
        generateNanoBananaPro({
          prompt: 'Test',
        })
      ).rejects.toThrow('Nano Banana Pro generation failed: API Error')
    })

    it('должна обрабатывать ошибки с правильным сообщением', async () => {
      mockSubscribe.mockRejectedValue(new Error('Unauthorized'))

      await expect(
        generateNanoBananaPro({
          prompt: 'Test',
        })
      ).rejects.toThrow('Nano Banana Pro generation failed: Unauthorized')
    })
  })

  describe('5. Helper функции', () => {
    it('getSupportedAspectRatios должна возвращать список поддерживаемых соотношений', () => {
      const ratios = getSupportedAspectRatios()
      expect(ratios).toContain('1:1')
      expect(ratios).toContain('16:9')
      expect(ratios).toContain('9:16')
      expect(ratios.length).toBeGreaterThan(0)
    })

    it('getSupportedResolutions должна возвращать список разрешений', () => {
      const resolutions = getSupportedResolutions()
      expect(resolutions).toContain('1K')
      expect(resolutions).toContain('2K')
      expect(resolutions).toContain('4K')
      expect(resolutions.length).toBe(3)
    })

    it('getSupportedOutputFormats должна возвращать список форматов', () => {
      const formats = getSupportedOutputFormats()
      expect(formats).toContain('png')
      expect(formats).toContain('jpeg')
      expect(formats).toContain('webp')
      expect(formats.length).toBe(3)
    })
  })

  describe('6. Различные форматы вывода', () => {
    it('должна поддерживать JPEG формат', async () => {
      const mockResult = {
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
        requestId: 'test-request-id',
      }

      mockSubscribe.mockResolvedValue(mockResult)

      await generateNanoBananaPro({
        prompt: 'Test',
        outputFormat: 'jpeg',
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

    it('должна поддерживать WebP формат', async () => {
      const mockResult = {
        data: {
          images: [
            {
              url: 'https://example.com/image.webp',
              width: 1024,
              height: 1024,
              content_type: 'image/webp',
            },
          ],
        },
        requestId: 'test-request-id',
      }

      mockSubscribe.mockResolvedValue(mockResult)

      await generateNanoBananaPro({
        prompt: 'Test',
        outputFormat: 'webp',
      })

      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/nano-banana-pro',
        expect.objectContaining({
          input: expect.objectContaining({
            output_format: 'webp',
          }),
        })
      )
    })
  })
})
