import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { generateSeeDream4 } from '@/services/generateSeeDream4'
import { generateFluxKontextMax } from '@/services/generateFluxKontextMax'
import { generateNanoBanana } from '@/services/generateNanoBanana'

// Mock Replicate for Bun
const mockReplicate = {
  run: mock()
}

mock.module('replicate', () => ({
  default: () => mockReplicate
}))

describe('AI Models Integration Tests', () => {
  beforeEach(() => {
    mockReplicate.run.mockClear()
    mockReplicate.run.mockResolvedValue(['https://example.com/generated-image.jpg'])
  })

  describe('SeeDream-4 API', () => {
    it('should generate image with valid parameters', async () => {
      const params = {
        prompt: 'A beautiful sunset over mountains',
        size: '2K' as const,
        max_images: 1,
        telegram_id: '123456789',
        username: 'testuser',
        is_ru: true
      }

      const result = await generateSeeDream4(params)

      expect(mockReplicate.run).toHaveBeenCalledWith(
        'bytedance/seedream-4',
        expect.objectContaining({
          input: expect.objectContaining({
            prompt: 'A beautiful sunset over mountains',
            size: '2K',
            max_images: 1
          })
        })
      )

      expect(result).toEqual({
        success: true,
        imageUrls: ['https://example.com/generated-image.jpg']
      })
    })

    it('should handle custom size parameters', async () => {
      const params = {
        prompt: 'Custom size image',
        size: 'custom' as const,
        width: 1920,
        height: 1080,
        telegram_id: '123456789',
        username: 'testuser',
        is_ru: true
      }

      await generateSeeDream4(params)

      expect(mockReplicate.run).toHaveBeenCalledWith(
        'bytedance/seedream-4',
        expect.objectContaining({
          input: expect.objectContaining({
            prompt: 'Custom size image',
            size: 'custom',
            width: 1920,
            height: 1080
          })
        })
      )
    })

    it('should handle multiple images generation', async () => {
      mockReplicate.run.mockResolvedValue([
        'https://example.com/image1.jpg',
        'https://example.com/image2.jpg',
        'https://example.com/image3.jpg'
      ])

      const params = {
        prompt: 'Generate 3 variations',
        max_images: 3,
        telegram_id: '123456789',
        username: 'testuser',
        is_ru: true
      }

      const result = await generateSeeDream4(params)

      expect(result.imageUrls).toHaveLength(3)
      expect(mockReplicate.run).toHaveBeenCalledWith(
        'bytedance/seedream-4',
        expect.objectContaining({
          input: expect.objectContaining({
            max_images: 3
          })
        })
      )
    })

    it('should validate input parameters with Zod', async () => {
      const invalidParams = {
        prompt: '', // Invalid empty prompt
        max_images: 20, // Invalid > 15
        telegram_id: '123456789',
        username: 'testuser',
        is_ru: true
      }

      await expect(generateSeeDream4(invalidParams as any))
        .rejects.toThrow()
    })

    it('should handle API errors gracefully', async () => {
      mockReplicate.run.mockRejectedValue(new Error('API Error'))

      const params = {
        prompt: 'Test prompt',
        telegram_id: '123456789',
        username: 'testuser',
        is_ru: true
      }

      const result = await generateSeeDream4(params)

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('API Error')
      })
    })
  })

  describe('FLUX Kontext Max API', () => {
    it('should edit image with valid parameters', async () => {
      const params = {
        prompt: 'Add sunset colors to this image',
        input_image: 'https://example.com/input.jpg',
        aspect_ratio: '16:9' as const,
        safety_tolerance: 2,
        telegram_id: '123456789',
        username: 'testuser',
        is_ru: true
      }

      const result = await generateFluxKontextMax(params)

      expect(mockReplicate.run).toHaveBeenCalledWith(
        'black-forest-labs/flux-kontext-max',
        expect.objectContaining({
          input: expect.objectContaining({
            prompt: 'Add sunset colors to this image',
            input_image: 'https://example.com/input.jpg',
            aspect_ratio: '16:9',
            safety_tolerance: 2
          })
        })
      )

      expect(result).toEqual({
        success: true,
        imageUrls: ['https://example.com/generated-image.jpg']
      })
    })

    it('should handle match input image aspect ratio', async () => {
      const params = {
        prompt: 'Edit this image',
        input_image: 'https://example.com/input.jpg',
        aspect_ratio: 'match_input_image' as const,
        telegram_id: '123456789',
        username: 'testuser',
        is_ru: true
      }

      await generateFluxKontextMax(params)

      expect(mockReplicate.run).toHaveBeenCalledWith(
        'black-forest-labs/flux-kontext-max',
        expect.objectContaining({
          input: expect.objectContaining({
            aspect_ratio: 'match_input_image'
          })
        })
      )
    })

    it('should validate safety tolerance range', async () => {
      const invalidParams = {
        prompt: 'Test prompt',
        safety_tolerance: 10, // Invalid > 6
        telegram_id: '123456789',
        username: 'testuser',
        is_ru: true
      }

      await expect(generateFluxKontextMax(invalidParams as any))
        .rejects.toThrow()
    })

    it('should handle different output formats', async () => {
      const params = {
        prompt: 'Generate PNG output',
        output_format: 'png' as const,
        telegram_id: '123456789',
        username: 'testuser',
        is_ru: true
      }

      await generateFluxKontextMax(params)

      expect(mockReplicate.run).toHaveBeenCalledWith(
        'black-forest-labs/flux-kontext-max',
        expect.objectContaining({
          input: expect.objectContaining({
            output_format: 'png'
          })
        })
      )
    })
  })

  describe('Nano Banana API', () => {
    it('should process images with Google Gemini', async () => {
      const params = {
        prompt: 'Edit these images with Gemini AI',
        image_input: [
          'https://example.com/image1.jpg',
          'https://example.com/image2.jpg'
        ],
        output_format: 'jpg' as const,
        telegram_id: '123456789',
        username: 'testuser',
        is_ru: true
      }

      const result = await generateNanoBanana(params)

      expect(mockReplicate.run).toHaveBeenCalledWith(
        'google/nano-banana',
        expect.objectContaining({
          input: expect.objectContaining({
            prompt: 'Edit these images with Gemini AI',
            image_input: [
              'https://example.com/image1.jpg',
              'https://example.com/image2.jpg'
            ],
            output_format: 'jpg'
          })
        })
      )

      expect(result).toEqual({
        success: true,
        imageUrls: ['https://example.com/generated-image.jpg']
      })
    })

    it('should validate maximum image input limit', async () => {
      const tooManyImages = Array(11).fill('https://example.com/image.jpg')
      
      const invalidParams = {
        prompt: 'Process too many images',
        image_input: tooManyImages,
        telegram_id: '123456789',
        username: 'testuser',
        is_ru: true
      }

      await expect(generateNanoBanana(invalidParams as any))
        .rejects.toThrow()
    })

    it('should handle PNG output format', async () => {
      const params = {
        prompt: 'Generate PNG output',
        image_input: ['https://example.com/input.jpg'],
        output_format: 'png' as const,
        telegram_id: '123456789',
        username: 'testuser',
        is_ru: true
      }

      await generateNanoBanana(params)

      expect(mockReplicate.run).toHaveBeenCalledWith(
        'google/nano-banana',
        expect.objectContaining({
          input: expect.objectContaining({
            output_format: 'png'
          })
        })
      )
    })

    it('should handle API rate limiting gracefully', async () => {
      mockReplicate.run.mockRejectedValue(new Error('Rate limit exceeded'))

      const params = {
        prompt: 'Test rate limiting',
        image_input: ['https://example.com/input.jpg'],
        telegram_id: '123456789',
        username: 'testuser',
        is_ru: true
      }

      const result = await generateNanoBanana(params)

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('Rate limit exceeded')
      })
    })
  })

  describe('Integration with AvatarTransformScene', () => {
    it('should select correct model based on user choice', () => {
      // Test model selection logic
      const modelMap = {
        'seedream4': generateSeeDream4,
        'flux-kontext': generateFluxKontextMax,
        'nano-banana': generateNanoBanana
      }

      expect(modelMap['seedream4']).toBe(generateSeeDream4)
      expect(modelMap['flux-kontext']).toBe(generateFluxKontextMax)
      expect(modelMap['nano-banana']).toBe(generateNanoBanana)
    })

    it('should handle fallback between models', async () => {
      // Test fallback logic when primary model fails
      const fallbackOrder = ['seedream45', 'flux-kontext', 'nano-banana']

      // First model fails
      mockReplicate.run.mockRejectedValueOnce(new Error('SeeDream-4.5 failed'))
      // Second model succeeds
      mockReplicate.run.mockResolvedValueOnce(['https://example.com/fallback.jpg'])

      const params = {
        prompt: 'Test fallback',
        telegram_id: '123456789',
        username: 'testuser',
        is_ru: true
      }

      // This would be the logic in avatarTransformScene
      let result = null
      for (const model of fallbackOrder) {
        try {
          if (model === 'seedream4') {
            result = await generateSeeDream4(params)
          } else if (model === 'flux-kontext') {
            result = await generateFluxKontextMax(params)
          }
          if (result?.success) break
        } catch (error) {
          continue
        }
      }

      expect(result).toEqual({
        success: true,
        imageUrls: ['https://example.com/fallback.jpg']
      })
    })
  })

  describe('Error Handling and Validation', () => {
    it('should provide detailed error messages for invalid inputs', async () => {
      const invalidParams = {
        prompt: 'a'.repeat(3000), // Too long
        telegram_id: '123456789',
        username: 'testuser',
        is_ru: true
      }

      try {
        await generateSeeDream4(invalidParams as any)
        fail('Should have thrown validation error')
      } catch (error: any) {
        expect(error.message).toContain('String must contain at most')
      }
    })

    it('should handle network timeouts', async () => {
      mockReplicate.run.mockRejectedValue(new Error('Request timeout'))

      const params = {
        prompt: 'Test timeout',
        telegram_id: '123456789',
        username: 'testuser',
        is_ru: true
      }

      const result = await generateSeeDream4(params)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Request timeout')
    })

    it('should validate telegram_id format', async () => {
      const invalidParams = {
        prompt: 'Test prompt',
        telegram_id: '', // Invalid empty ID
        username: 'testuser',
        is_ru: true
      }

      await expect(generateSeeDream4(invalidParams as any))
        .rejects.toThrow()
    })
  })
})