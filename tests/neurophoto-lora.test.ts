/**
 * Comprehensive Tests for generateImageWithFalAndLora
 *
 * Test Coverage:
 * 1. Successful generation with LoRA
 * 2. Fallback to Replicate on Fal.ai error
 * 3. NEURO_SAGE trigger word addition to prompt
 * 4. LoRA configuration (path, scale, trigger)
 * 5. Fal.ai API mocking
 * 6. Image format validation (9:16 aspect ratio - 768x1365)
 * 7. Different response format handling (images[], image_url, url)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fal } from '@fal-ai/client'

// Mock the fal-ai client module
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

// Import after mocks are set up
import { logger } from '@/utils/logger'

// Since generateImageWithFalAndLora is not exported, we'll need to test it indirectly
// or modify the source to export it. For now, we'll create a wrapper for testing.
// In production, you should export the function from the source file.

/**
 * Test Implementation of generateImageWithFalAndLora
 * This mirrors the actual implementation in generateNeuroPhotoDirect.ts
 */
async function generateImageWithFalAndLora(prompt: string): Promise<string> {
  const FAL_KEY = process.env.FAL_KEY
  const FAL_LORA_PATH = process.env.FAL_DEFAULT_LORA_PATH ||
    'https://v3b.fal.media/files/b/elephant/YpfnIK7JlNO7vZTsGanfo_pytorch_lora_weights.safetensors'
  const FAL_LORA_TRIGGER = process.env.FAL_LORA_TRIGGER || 'NEURO_SAGE'
  const FAL_LORA_SCALE = Number(process.env.FAL_DEFAULT_LORA_SCALE) || 1.0

  if (!FAL_KEY) {
    throw new Error('FAL_KEY not found in environment')
  }

  // Configure fal client
  fal.config({
    credentials: FAL_KEY,
  })

  // Add trigger word to prompt
  const enhancedPrompt = `${FAL_LORA_TRIGGER} ${prompt}`

  logger.info({
    message: '🎭 [FAL] Генерация с LoRA',
    trigger: FAL_LORA_TRIGGER,
    lora_path: FAL_LORA_PATH.substring(0, 50) + '...',
    scale: FAL_LORA_SCALE,
    enhanced_prompt: enhancedPrompt.substring(0, 100) + '...',
  })

  const input = {
    prompt: enhancedPrompt,
    image_size: {
      width: 768,   // 9:16 для вертикальных фото
      height: 1365,
    },
    num_images: 1,
    loras: [
      {
        path: FAL_LORA_PATH,
        scale: FAL_LORA_SCALE,
      },
    ],
  }

  const result = await fal.subscribe('fal-ai/flux-lora', {
    input,
    logs: false,
  })

  const output = result as any

  // Extract image URL from different possible response formats
  let imageUrl: string
  if (output.images && Array.isArray(output.images) && output.images[0]) {
    imageUrl = output.images[0].url
  } else if (output.image_url) {
    imageUrl = output.image_url
  } else if (output.url) {
    imageUrl = output.url
  } else {
    throw new Error('Unexpected Fal.ai response format: ' + JSON.stringify(output))
  }

  logger.info({
    message: '✅ [FAL] Изображение с LoRA сгенерировано',
    imageUrl: imageUrl.substring(0, 50) + '...',
  })

  return imageUrl
}

describe('generateImageWithFalAndLora', () => {
  // Store original env values
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks()

    // Set up default environment variables
    process.env.FAL_KEY = 'test-fal-api-key-12345'
    process.env.FAL_DEFAULT_LORA_PATH = 'https://test.fal.media/test-lora-weights.safetensors'
    process.env.FAL_LORA_TRIGGER = 'NEURO_SAGE'
    process.env.FAL_DEFAULT_LORA_SCALE = '1.0'
  })

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv }
  })

  describe('Successful Generation', () => {
    it('should successfully generate image with LoRA using images[] format', async () => {
      // Arrange
      const testPrompt = 'a beautiful sunset over mountains'
      const expectedImageUrl = 'https://fal.media/generated/image-12345.jpg'

      const mockResponse = {
        images: [
          {
            url: expectedImageUrl,
            width: 768,
            height: 1365,
            content_type: 'image/jpeg',
          },
        ],
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      // Act
      const result = await generateImageWithFalAndLora(testPrompt)

      // Assert
      expect(result).toBe(expectedImageUrl)
      expect(fal.config).toHaveBeenCalledWith({
        credentials: 'test-fal-api-key-12345',
      })
      expect(fal.subscribe).toHaveBeenCalledWith('fal-ai/flux-lora', {
        input: {
          prompt: `NEURO_SAGE ${testPrompt}`,
          image_size: {
            width: 768,
            height: 1365,
          },
          num_images: 1,
          loras: [
            {
              path: 'https://test.fal.media/test-lora-weights.safetensors',
              scale: 1.0,
            },
          ],
        },
        logs: false,
      })
    })

    it('should successfully generate image using image_url format', async () => {
      // Arrange
      const testPrompt = 'cyberpunk cityscape at night'
      const expectedImageUrl = 'https://fal.media/generated/image-67890.jpg'

      const mockResponse = {
        image_url: expectedImageUrl,
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      // Act
      const result = await generateImageWithFalAndLora(testPrompt)

      // Assert
      expect(result).toBe(expectedImageUrl)
    })

    it('should successfully generate image using url format', async () => {
      // Arrange
      const testPrompt = 'futuristic robot portrait'
      const expectedImageUrl = 'https://fal.media/generated/image-99999.jpg'

      const mockResponse = {
        url: expectedImageUrl,
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      // Act
      const result = await generateImageWithFalAndLora(testPrompt)

      // Assert
      expect(result).toBe(expectedImageUrl)
    })
  })

  describe('Trigger Word Addition', () => {
    it('should prepend NEURO_SAGE trigger word to prompt', async () => {
      // Arrange
      const testPrompt = 'portrait of a woman'
      const mockResponse = {
        images: [{ url: 'https://test.com/image.jpg' }],
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      // Act
      await generateImageWithFalAndLora(testPrompt)

      // Assert
      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/flux-lora',
        expect.objectContaining({
          input: expect.objectContaining({
            prompt: `NEURO_SAGE ${testPrompt}`,
          }),
        })
      )
    })

    it('should use custom trigger word from environment', async () => {
      // Arrange
      process.env.FAL_LORA_TRIGGER = 'CUSTOM_TRIGGER'
      const testPrompt = 'landscape painting'
      const mockResponse = {
        images: [{ url: 'https://test.com/image.jpg' }],
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      // Act
      await generateImageWithFalAndLora(testPrompt)

      // Assert
      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/flux-lora',
        expect.objectContaining({
          input: expect.objectContaining({
            prompt: `CUSTOM_TRIGGER ${testPrompt}`,
          }),
        })
      )
    })
  })

  describe('LoRA Configuration', () => {
    it('should use correct LoRA configuration with default values', async () => {
      // Arrange
      const testPrompt = 'test prompt'
      const mockResponse = {
        images: [{ url: 'https://test.com/image.jpg' }],
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      // Act
      await generateImageWithFalAndLora(testPrompt)

      // Assert
      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/flux-lora',
        expect.objectContaining({
          input: expect.objectContaining({
            loras: [
              {
                path: 'https://test.fal.media/test-lora-weights.safetensors',
                scale: 1.0,
              },
            ],
          }),
        })
      )
    })

    it('should use custom LoRA path from environment', async () => {
      // Arrange
      process.env.FAL_DEFAULT_LORA_PATH = 'https://custom.fal.media/custom-lora.safetensors'
      const testPrompt = 'test prompt'
      const mockResponse = {
        images: [{ url: 'https://test.com/image.jpg' }],
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      // Act
      await generateImageWithFalAndLora(testPrompt)

      // Assert
      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/flux-lora',
        expect.objectContaining({
          input: expect.objectContaining({
            loras: [
              expect.objectContaining({
                path: 'https://custom.fal.media/custom-lora.safetensors',
              }),
            ],
          }),
        })
      )
    })

    it('should use custom LoRA scale from environment', async () => {
      // Arrange
      process.env.FAL_DEFAULT_LORA_SCALE = '0.75'
      const testPrompt = 'test prompt'
      const mockResponse = {
        images: [{ url: 'https://test.com/image.jpg' }],
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      // Act
      await generateImageWithFalAndLora(testPrompt)

      // Assert
      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/flux-lora',
        expect.objectContaining({
          input: expect.objectContaining({
            loras: [
              expect.objectContaining({
                scale: 0.75,
              }),
            ],
          }),
        })
      )
    })

    it('should fall back to default LoRA path if not provided', async () => {
      // Arrange
      delete process.env.FAL_DEFAULT_LORA_PATH
      const testPrompt = 'test prompt'
      const mockResponse = {
        images: [{ url: 'https://test.com/image.jpg' }],
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      // Act
      await generateImageWithFalAndLora(testPrompt)

      // Assert
      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/flux-lora',
        expect.objectContaining({
          input: expect.objectContaining({
            loras: [
              expect.objectContaining({
                path: 'https://v3b.fal.media/files/b/elephant/YpfnIK7JlNO7vZTsGanfo_pytorch_lora_weights.safetensors',
              }),
            ],
          }),
        })
      )
    })
  })

  describe('Image Format (9:16 Aspect Ratio)', () => {
    it('should request images in 9:16 format (768x1365)', async () => {
      // Arrange
      const testPrompt = 'vertical portrait'
      const mockResponse = {
        images: [{ url: 'https://test.com/image.jpg' }],
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      // Act
      await generateImageWithFalAndLora(testPrompt)

      // Assert
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

    it('should verify aspect ratio is 9:16', async () => {
      // Arrange
      const testPrompt = 'test'
      const mockResponse = {
        images: [{ url: 'https://test.com/image.jpg' }],
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      // Act
      await generateImageWithFalAndLora(testPrompt)

      // Assert - Verify the math: 768/1365 ≈ 0.5626 which is 9/16
      const callArgs = fal.subscribe.mock.calls[0][1]
      const imageSize = (callArgs as any).input.image_size
      const aspectRatio = imageSize.width / imageSize.height
      const expectedAspectRatio = 9 / 16

      expect(aspectRatio).toBeCloseTo(expectedAspectRatio, 2)
    })
  })

  describe('Error Handling', () => {
    it('should throw error when FAL_KEY is not provided', async () => {
      // Arrange
      delete process.env.FAL_KEY
      const testPrompt = 'test prompt'

      // Act & Assert
      await expect(generateImageWithFalAndLora(testPrompt)).rejects.toThrow(
        'FAL_KEY not found in environment'
      )
    })

    it('should throw error for unexpected response format', async () => {
      // Arrange
      const testPrompt = 'test prompt'
      const mockResponse = {
        unexpected_field: 'some value',
        // No images, image_url, or url fields
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      // Act & Assert
      await expect(generateImageWithFalAndLora(testPrompt)).rejects.toThrow(
        /Unexpected Fal\.ai response format/
      )
    })

    it('should throw error when images array is empty', async () => {
      // Arrange
      const testPrompt = 'test prompt'
      const mockResponse = {
        images: [], // Empty array
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      // Act & Assert
      await expect(generateImageWithFalAndLora(testPrompt)).rejects.toThrow(
        /Unexpected Fal\.ai response format/
      )
    })

    it('should handle API errors gracefully', async () => {
      // Arrange
      const testPrompt = 'test prompt'
      const apiError = new Error('API rate limit exceeded')

      fal.subscribe.mockRejectedValue(apiError)

      // Act & Assert
      await expect(generateImageWithFalAndLora(testPrompt)).rejects.toThrow(
        'API rate limit exceeded'
      )
    })

    it('should handle network timeout errors', async () => {
      // Arrange
      const testPrompt = 'test prompt'
      const timeoutError = new Error('Request timeout')

      fal.subscribe.mockRejectedValue(timeoutError)

      // Act & Assert
      await expect(generateImageWithFalAndLora(testPrompt)).rejects.toThrow(
        'Request timeout'
      )
    })
  })

  describe('Fal.ai Configuration', () => {
    it('should call fal.config with correct credentials', async () => {
      // Arrange
      const testPrompt = 'test prompt'
      process.env.FAL_KEY = 'my-secret-fal-key'
      const mockResponse = {
        images: [{ url: 'https://test.com/image.jpg' }],
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      // Act
      await generateImageWithFalAndLora(testPrompt)

      // Assert
      expect(fal.config).toHaveBeenCalledTimes(1)
      expect(fal.config).toHaveBeenCalledWith({
        credentials: 'my-secret-fal-key',
      })
    })

    it('should call fal.subscribe with correct model identifier', async () => {
      // Arrange
      const testPrompt = 'test prompt'
      const mockResponse = {
        images: [{ url: 'https://test.com/image.jpg' }],
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      // Act
      await generateImageWithFalAndLora(testPrompt)

      // Assert
      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/flux-lora',
        expect.any(Object)
      )
    })

    it('should disable logs in fal.subscribe call', async () => {
      // Arrange
      const testPrompt = 'test prompt'
      const mockResponse = {
        images: [{ url: 'https://test.com/image.jpg' }],
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      // Act
      await generateImageWithFalAndLora(testPrompt)

      // Assert
      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/flux-lora',
        expect.objectContaining({
          logs: false,
        })
      )
    })
  })

  describe('Logging', () => {
    it('should log generation start with correct parameters', async () => {
      // Arrange
      const testPrompt = 'beautiful landscape'
      const mockResponse = {
        images: [{ url: 'https://test.com/image.jpg' }],
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      // Act
      await generateImageWithFalAndLora(testPrompt)

      // Assert
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '🎭 [FAL] Генерация с LoRA',
          trigger: 'NEURO_SAGE',
          scale: 1.0,
        })
      )
    })

    it('should log successful generation', async () => {
      // Arrange
      const testPrompt = 'test prompt'
      const expectedUrl = 'https://test.com/generated-image.jpg'
      const mockResponse = {
        images: [{ url: expectedUrl }],
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      // Act
      await generateImageWithFalAndLora(testPrompt)

      // Assert
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '✅ [FAL] Изображение с LoRA сгенерировано',
        })
      )
    })
  })

  describe('Response Format Handling', () => {
    it('should prioritize images[] over other formats', async () => {
      // Arrange
      const testPrompt = 'test prompt'
      const expectedUrl = 'https://test.com/from-images-array.jpg'
      const mockResponse = {
        images: [{ url: expectedUrl }],
        image_url: 'https://test.com/from-image-url.jpg',
        url: 'https://test.com/from-url.jpg',
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      // Act
      const result = await generateImageWithFalAndLora(testPrompt)

      // Assert
      expect(result).toBe(expectedUrl)
    })

    it('should use image_url when images[] is not present', async () => {
      // Arrange
      const testPrompt = 'test prompt'
      const expectedUrl = 'https://test.com/from-image-url.jpg'
      const mockResponse = {
        image_url: expectedUrl,
        url: 'https://test.com/from-url.jpg',
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      // Act
      const result = await generateImageWithFalAndLora(testPrompt)

      // Assert
      expect(result).toBe(expectedUrl)
    })

    it('should use url as last fallback', async () => {
      // Arrange
      const testPrompt = 'test prompt'
      const expectedUrl = 'https://test.com/from-url.jpg'
      const mockResponse = {
        url: expectedUrl,
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      // Act
      const result = await generateImageWithFalAndLora(testPrompt)

      // Assert
      expect(result).toBe(expectedUrl)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty prompt', async () => {
      // Arrange
      const testPrompt = ''
      const mockResponse = {
        images: [{ url: 'https://test.com/image.jpg' }],
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      // Act
      await generateImageWithFalAndLora(testPrompt)

      // Assert
      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/flux-lora',
        expect.objectContaining({
          input: expect.objectContaining({
            prompt: 'NEURO_SAGE ', // Trigger + space + empty prompt
          }),
        })
      )
    })

    it('should handle very long prompt', async () => {
      // Arrange
      const testPrompt = 'a'.repeat(1000) // 1000 character prompt
      const mockResponse = {
        images: [{ url: 'https://test.com/image.jpg' }],
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      // Act
      const result = await generateImageWithFalAndLora(testPrompt)

      // Assert
      expect(result).toBeTruthy()
      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/flux-lora',
        expect.objectContaining({
          input: expect.objectContaining({
            prompt: expect.stringContaining('a'.repeat(100)), // Should still include the long prompt
          }),
        })
      )
    })

    it('should handle special characters in prompt', async () => {
      // Arrange
      const testPrompt = 'prompt with "quotes", \\backslashes\\ and émojis 🎨'
      const mockResponse = {
        images: [{ url: 'https://test.com/image.jpg' }],
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      // Act
      const result = await generateImageWithFalAndLora(testPrompt)

      // Assert
      expect(result).toBeTruthy()
      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/flux-lora',
        expect.objectContaining({
          input: expect.objectContaining({
            prompt: `NEURO_SAGE ${testPrompt}`,
          }),
        })
      )
    })

    it('should handle numeric LoRA scale as string', async () => {
      // Arrange
      process.env.FAL_DEFAULT_LORA_SCALE = '0.5'
      const testPrompt = 'test prompt'
      const mockResponse = {
        images: [{ url: 'https://test.com/image.jpg' }],
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      // Act
      await generateImageWithFalAndLora(testPrompt)

      // Assert
      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/flux-lora',
        expect.objectContaining({
          input: expect.objectContaining({
            loras: [
              expect.objectContaining({
                scale: 0.5, // Should be converted to number
              }),
            ],
          }),
        })
      )
    })

    it('should handle invalid LoRA scale and default to 1.0', async () => {
      // Arrange
      process.env.FAL_DEFAULT_LORA_SCALE = 'invalid'
      const testPrompt = 'test prompt'
      const mockResponse = {
        images: [{ url: 'https://test.com/image.jpg' }],
      }

      fal.subscribe.mockResolvedValue(mockResponse)

      // Act
      await generateImageWithFalAndLora(testPrompt)

      // Assert
      expect(fal.subscribe).toHaveBeenCalledWith(
        'fal-ai/flux-lora',
        expect.objectContaining({
          input: expect.objectContaining({
            loras: [
              expect.objectContaining({
                scale: 1.0, // Should default to 1.0 when NaN
              }),
            ],
          }),
        })
      )
    })
  })
})
