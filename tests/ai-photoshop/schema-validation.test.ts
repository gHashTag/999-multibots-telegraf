import { describe, it, expect, beforeEach } from '@jest/globals'
import {
  SeeDream4InputSchema,
  SeeDream4ResponseSchema,
  SeeDream4ErrorSchema,
  validateSeeDream4Input,
  getSeeDream4Dimensions,
  SEEDREAM4_AVATAR_CONFIG
} from '../../src/schemas/seedream4.schema'
import {
  MOCK_PROMPTS,
  MOCK_SIZES,
  MOCK_USER_DATA,
  MOCK_IMAGES,
  MOCK_API_RESPONSES,
  MOCK_ERROR_SCENARIOS
} from './fixtures/test-data'

/**
 * 🧪 AI PHOTOSHOP SCHEMA VALIDATION COMPREHENSIVE TESTS
 *
 * Tests all Zod schema validation for AI Photoshop:
 * - Input validation with edge cases
 * - Response schema validation
 * - Error schema validation
 * - Multi-image validation scenarios
 * - Dialog mode validation requirements
 * - Performance validation for large inputs
 */
describe('AI Photoshop Schema Validation', () => {
  describe('SeeDream4 Input Schema Validation', () => {
    describe('Prompt Validation', () => {
      it('should validate correct prompt lengths', () => {
        const validPrompts = [
          'abc', // Minimum 3 chars
          'enhance this beautiful image with artistic style',
          'a'.repeat(1000), // Mid-range
          'x'.repeat(2000) // Maximum 2000 chars
        ]

        validPrompts.forEach(prompt => {
          const input = {
            prompt,
            size: '1K' as const,
            telegram_id: MOCK_USER_DATA.telegram_id
          }

          const result = validateSeeDream4Input(input)
          expect(result.success).toBe(true)
          if (result.success) {
            expect(result.data.prompt).toBe(prompt.trim())
          }
        })
      })

      it('should reject prompts that are too short', () => {
        const shortPrompts = ['', 'a', 'ab'] // Less than 3 chars

        shortPrompts.forEach(prompt => {
          const input = {
            prompt,
            size: '1K' as const,
            telegram_id: MOCK_USER_DATA.telegram_id
          }

          const result = validateSeeDream4Input(input)
          expect(result.success).toBe(false)
        })
      })

      it('should reject prompts that are too long', () => {
        const longPrompt = 'a'.repeat(2001) // Over 2000 chars

        const input = {
          prompt: longPrompt,
          size: '1K' as const,
          telegram_id: MOCK_USER_DATA.telegram_id
        }

        const result = validateSeeDream4Input(input)
        expect(result.success).toBe(false)
      })

      it('should handle whitespace in prompts correctly', () => {
        const whitespaceTests = [
          { input: '   enhance photo   ', expected: 'enhance photo' },
          { input: '\t\ttest prompt\t\t', expected: 'test prompt' },
          { input: '\n\nvalid prompt\n\n', expected: 'valid prompt' },
          { input: '  mixed   spaces  ', expected: 'mixed   spaces' }
        ]

        whitespaceTests.forEach(({ input: prompt, expected }) => {
          const input = {
            prompt,
            size: '1K' as const,
            telegram_id: MOCK_USER_DATA.telegram_id
          }

          const result = validateSeeDream4Input(input)
          expect(result.success).toBe(true)
          if (result.success) {
            expect(result.data.prompt).toBe(expected)
          }
        })
      })

      it('should reject whitespace-only prompts', () => {
        const whitespaceOnlyPrompts = [
          '   ', // Spaces only
          '\t\t\t', // Tabs only
          '\n\n\n', // Newlines only
          '  \t  \n  ' // Mixed whitespace
        ]

        whitespaceOnlyPrompts.forEach(prompt => {
          const input = {
            prompt,
            size: '1K' as const,
            telegram_id: MOCK_USER_DATA.telegram_id
          }

          const result = validateSeeDream4Input(input)
          expect(result.success).toBe(false)
        })
      })

      it('should handle special characters and emojis', () => {
        const specialPrompts = [
          'enhance this photo & make it pop! 🎨',
          'create portrait @ 4K resolution ✨',
          'apply #vintage filter with 50% opacity',
          'merge photos: img1.jpg + img2.jpg = masterpiece 📸',
          'Улучши это фото с художественным стилем 🖼️'
        ]

        specialPrompts.forEach(prompt => {
          const input = {
            prompt,
            size: '1K' as const,
            telegram_id: MOCK_USER_DATA.telegram_id
          }

          const result = validateSeeDream4Input(input)
          expect(result.success).toBe(true)
          if (result.success) {
            expect(result.data.prompt).toBe(prompt)
          }
        })
      })
    })

    describe('Size Validation', () => {
      it('should validate all supported sizes', () => {
        const sizes = ['1K', '2K', '4K', 'custom'] as const

        sizes.forEach(size => {
          const input = {
            prompt: 'test prompt',
            size,
            telegram_id: MOCK_USER_DATA.telegram_id,
            ...(size === 'custom' ? { width: 1200, height: 1600 } : {})
          }

          const result = validateSeeDream4Input(input)
          expect(result.success).toBe(true)
          if (result.success) {
            expect(result.data.size).toBe(size)
          }
        })
      })

      it('should require width and height for custom size', () => {
        const invalidCustomInputs = [
          { prompt: 'test', size: 'custom' as const, telegram_id: '123' },
          { prompt: 'test', size: 'custom' as const, width: 1200, telegram_id: '123' },
          { prompt: 'test', size: 'custom' as const, height: 1600, telegram_id: '123' }
        ]

        invalidCustomInputs.forEach(input => {
          const result = validateSeeDream4Input(input)
          expect(result.success).toBe(false)
        })
      })

      it('should validate custom dimensions constraints', () => {
        const dimensionTests = [
          { width: 1024, height: 1536, valid: true }, // Min valid
          { width: 4096, height: 4096, valid: true }, // Max valid
          { width: 1023, height: 1536, valid: false }, // Width too small
          { width: 1024, height: 1023, valid: false }, // Height too small
          { width: 4097, height: 4096, valid: false }, // Width too large
          { width: 4096, height: 4097, valid: false }  // Height too large
        ]

        dimensionTests.forEach(({ width, height, valid }) => {
          const input = {
            prompt: 'test prompt',
            size: 'custom' as const,
            width,
            height,
            telegram_id: MOCK_USER_DATA.telegram_id
          }

          const result = validateSeeDream4Input(input)
          expect(result.success).toBe(valid)
        })
      })

      it('should get correct dimensions for predefined sizes', () => {
        const expectedDimensions = {
          '1K': { width: 1024, height: 1536 },
          '2K': { width: 1365, height: 2048 },
          '4K': { width: 2731, height: 4096 }
        }

        Object.entries(expectedDimensions).forEach(([size, expected]) => {
          const dimensions = getSeeDream4Dimensions(size as any)
          expect(dimensions).toEqual(expected)
        })
      })

      it('should throw error for custom size in getDimensions', () => {
        expect(() => {
          getSeeDream4Dimensions('custom')
        }).toThrow('Custom size requires explicit width and height')
      })
    })

    describe('Multi-Image Validation', () => {
      it('should validate single image input', () => {
        const input = {
          prompt: 'enhance this image',
          size: '1K' as const,
          max_images: 1,
          image_input: ['https://example.com/image.jpg'],
          telegram_id: MOCK_USER_DATA.telegram_id
        }

        const result = validateSeeDream4Input(input)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.image_input).toHaveLength(1)
          expect(result.data.max_images).toBe(1)
        }
      })

      it('should validate multiple image inputs', () => {
        const input = {
          prompt: 'merge these images together',
          size: '1K' as const,
          max_images: 3,
          image_input: [
            'https://example.com/image1.jpg',
            'https://example.com/image2.jpg',
            'https://example.com/image3.jpg'
          ],
          telegram_id: MOCK_USER_DATA.telegram_id
        }

        const result = validateSeeDream4Input(input)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.image_input).toHaveLength(3)
          expect(result.data.max_images).toBe(3)
        }
      })

      it('should enforce max_images constraints', () => {
        const constraintTests = [
          { max_images: 0, valid: false }, // Too few
          { max_images: 1, valid: true },  // Min valid
          { max_images: 10, valid: true }, // Mid range
          { max_images: 15, valid: true }, // Max valid
          { max_images: 16, valid: false } // Too many
        ]

        constraintTests.forEach(({ max_images, valid }) => {
          const input = {
            prompt: 'test prompt',
            size: '1K' as const,
            max_images,
            image_input: Array(Math.min(max_images, 10)).fill(0).map((_, i) =>
              `https://example.com/image${i}.jpg`
            ),
            telegram_id: MOCK_USER_DATA.telegram_id
          }

          const result = validateSeeDream4Input(input)
          expect(result.success).toBe(valid)
        })
      })

      it('should validate image URL formats', () => {
        const urlTests = [
          { url: 'https://example.com/image.jpg', valid: true },
          { url: 'http://example.com/image.png', valid: true },
          { url: 'https://api.telegram.org/file/bot123/photo.jpg', valid: true },
          { url: 'invalid-url', valid: false },
          { url: 'ftp://example.com/image.jpg', valid: false },
          { url: '', valid: false }
        ]

        urlTests.forEach(({ url, valid }) => {
          const input = {
            prompt: 'test prompt',
            size: '1K' as const,
            image_input: [url],
            telegram_id: MOCK_USER_DATA.telegram_id
          }

          const result = validateSeeDream4Input(input)
          expect(result.success).toBe(valid)
        })
      })

      it('should validate image_input array constraints', () => {
        const arrayTests = [
          { images: [], valid: false }, // Empty array
          { images: Array(1).fill('https://example.com/img.jpg'), valid: true }, // Min valid
          { images: Array(5).fill('https://example.com/img.jpg'), valid: true }, // Mid range
          { images: Array(10).fill('https://example.com/img.jpg'), valid: true }, // Max valid
          { images: Array(11).fill('https://example.com/img.jpg'), valid: false } // Too many
        ]

        arrayTests.forEach(({ images, valid }, index) => {
          const input = {
            prompt: 'test prompt',
            size: '1K' as const,
            image_input: images.map((url, i) => `${url}?id=${index}_${i}`),
            max_images: images.length,
            telegram_id: MOCK_USER_DATA.telegram_id
          }

          const result = validateSeeDream4Input(input)
          expect(result.success).toBe(valid)
        })
      })

      it('should validate multi-image and max_images consistency', () => {
        const consistencyTests = [
          { imageCount: 1, max_images: 1, valid: true },
          { imageCount: 3, max_images: 3, valid: true },
          { imageCount: 2, max_images: 1, valid: false }, // Multiple images but max_images is 1
          { imageCount: 1, max_images: 3, valid: true }   // Single image but max_images allows more
        ]

        consistencyTests.forEach(({ imageCount, max_images, valid }) => {
          const input = {
            prompt: 'test prompt',
            size: '1K' as const,
            image_input: Array(imageCount).fill(0).map((_, i) =>
              `https://example.com/image${i}.jpg`
            ),
            max_images,
            telegram_id: MOCK_USER_DATA.telegram_id
          }

          const result = validateSeeDream4Input(input)
          expect(result.success).toBe(valid)
        })
      })
    })

    describe('Telegram User Validation', () => {
      it('should validate telegram_id format', () => {
        const telegramIdTests = [
          { id: '123456789', valid: true },     // Valid numeric string
          { id: '1234567890123', valid: true }, // Long valid ID
          { id: 'abc123', valid: false },       // Contains letters
          { id: '', valid: false },             // Empty string
          { id: '123.456', valid: false },      // Contains dot
          { id: '123-456', valid: false }       // Contains hyphen
        ]

        telegramIdTests.forEach(({ id, valid }) => {
          const input = {
            prompt: 'test prompt',
            size: '1K' as const,
            telegram_id: id
          }

          const result = validateSeeDream4Input(input)
          if (id) { // Only test when ID is provided
            expect(result.success).toBe(valid)
          }
        })
      })

      it('should handle optional user fields', () => {
        const userFieldTests = [
          { username: 'testuser', valid: true },
          { username: 'a'.repeat(100), valid: true }, // Max length
          { username: 'a'.repeat(101), valid: false }, // Too long
          { username: '', valid: true }, // Empty string is valid for optional field
          { is_ru: true, valid: true },
          { is_ru: false, valid: true }
        ]

        userFieldTests.forEach(({ username, is_ru, valid }) => {
          const input = {
            prompt: 'test prompt',
            size: '1K' as const,
            telegram_id: MOCK_USER_DATA.telegram_id,
            ...(username !== undefined ? { username } : {}),
            ...(is_ru !== undefined ? { is_ru } : {})
          }

          const result = validateSeeDream4Input(input)
          expect(result.success).toBe(valid)
        })
      })
    })

    describe('Aspect Ratio Validation', () => {
      it('should validate aspect ratio format', () => {
        const aspectRatioTests = [
          { ratio: '16:9', valid: true },
          { ratio: '4:3', valid: true },
          { ratio: '1:1', valid: true },
          { ratio: '2:3', valid: true },
          { ratio: '9:16', valid: true },
          { ratio: '16:9:1', valid: false }, // Too many parts
          { ratio: '16x9', valid: false },   // Wrong separator
          { ratio: '16-9', valid: false },   // Wrong separator
          { ratio: 'a:b', valid: false },    // Non-numeric
          { ratio: '', valid: false }        // Empty
        ]

        aspectRatioTests.forEach(({ ratio, valid }) => {
          const input = {
            prompt: 'test prompt',
            size: '1K' as const,
            aspect_ratio: ratio,
            telegram_id: MOCK_USER_DATA.telegram_id
          }

          const result = validateSeeDream4Input(input)
          expect(result.success).toBe(valid)
        })
      })
    })

    describe('Input Validation Edge Cases', () => {
      it('should handle completely empty input', () => {
        const result = validateSeeDream4Input({})
        expect(result.success).toBe(false)
      })

      it('should handle null and undefined inputs', () => {
        const inputs = [null, undefined, '', 0, false]

        inputs.forEach(input => {
          const result = validateSeeDream4Input(input)
          expect(result.success).toBe(false)
        })
      })

      it('should handle malformed objects', () => {
        const malformedInputs = [
          { prompt: null },
          { prompt: 123 },
          { prompt: [] },
          { prompt: {} },
          { size: 'invalid' },
          { max_images: 'five' },
          { image_input: 'not-an-array' },
          { width: 'wide' },
          { height: 'tall' }
        ]

        malformedInputs.forEach(input => {
          const result = validateSeeDream4Input(input)
          expect(result.success).toBe(false)
        })
      })

      it('should handle excessive field values', () => {
        const excessiveInput = {
          prompt: 'a'.repeat(5000), // Way too long
          size: '1K' as const,
          max_images: 1000, // Way too many
          image_input: Array(100).fill('https://example.com/img.jpg'), // Too many images
          width: 100000, // Too wide
          height: 100000, // Too tall
          telegram_id: '1'.repeat(50), // Too long ID
          username: 'a'.repeat(500) // Too long username
        }

        const result = validateSeeDream4Input(excessiveInput)
        expect(result.success).toBe(false)
      })
    })

    describe('Validation Performance', () => {
      it('should validate large inputs efficiently', () => {
        const startTime = performance.now()

        // Create a large but valid input
        const largeInput = {
          prompt: 'enhance these images with artistic style and professional quality processing that brings out the best details and colors while maintaining the original composition and subject focus with advanced AI algorithms'.repeat(10), // Large prompt
          size: '1K' as const,
          max_images: 10,
          image_input: Array(10).fill(0).map((_, i) =>
            `https://example.com/very_long_filename_with_many_characters_that_might_slow_down_validation_image_${i}_processed_with_advanced_ai_technology.jpg`
          ),
          telegram_id: MOCK_USER_DATA.telegram_id,
          username: 'user_with_very_long_username_that_includes_many_characters',
          aspect_ratio: '16:9',
          width: 2048,
          height: 1152
        }

        const result = validateSeeDream4Input(largeInput)
        const endTime = performance.now()

        expect(endTime - startTime).toBeLessThan(50) // Should validate in under 50ms
        expect(result.success).toBe(true) // Should still validate correctly
      })

      it('should handle rapid successive validations', () => {
        const startTime = performance.now()

        const inputs = Array(100).fill(0).map((_, i) => ({
          prompt: `test prompt ${i}`,
          size: '1K' as const,
          telegram_id: `12345678${i % 10}`
        }))

        const results = inputs.map(input => validateSeeDream4Input(input))
        const endTime = performance.now()

        expect(endTime - startTime).toBeLessThan(100) // Should validate 100 inputs in under 100ms
        expect(results.every(r => r.success)).toBe(true)
      })
    })
  })

  describe('SeeDream4 Response Schema Validation', () => {
    it('should validate correct response format', () => {
      const validResponse = MOCK_API_RESPONSES.seedream_success

      const result = SeeDream4ResponseSchema.safeParse(validResponse)
      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.images).toHaveLength(2)
        expect(result.data.metadata.prompt).toBe('enhance this image')
        expect(result.data.metadata.dimensions.width).toBe(1024)
      }
    })

    it('should validate response with optional fields', () => {
      const responseWithOptionals = {
        images: ['https://example.com/result.jpg'],
        metadata: {
          prompt: 'test prompt',
          size: '2K',
          dimensions: { width: 1365, height: 2048 },
          generation_time: 45.7,
          model_version: 'seedream-4.1-beta'
        }
      }

      const result = SeeDream4ResponseSchema.safeParse(responseWithOptionals)
      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.metadata.generation_time).toBe(45.7)
        expect(result.data.metadata.model_version).toBe('seedream-4.1-beta')
      }
    })

    it('should reject invalid response formats', () => {
      const invalidResponses = [
        { images: 'not-an-array' },
        { metadata: 'not-an-object' },
        { images: [], metadata: {} }, // Missing required fields
        { images: ['invalid-url'], metadata: { prompt: '', size: '', dimensions: {} } },
        { images: [123], metadata: { prompt: 'test', size: '1K', dimensions: { width: 1024, height: 1536 } } }
      ]

      invalidResponses.forEach(response => {
        const result = SeeDream4ResponseSchema.safeParse(response)
        expect(result.success).toBe(false)
      })
    })
  })

  describe('SeeDream4 Error Schema Validation', () => {
    it('should validate error responses', () => {
      const validError = MOCK_API_RESPONSES.api_error

      const result = SeeDream4ErrorSchema.safeParse(validError)
      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.error).toBe('Processing failed')
        expect(result.data.code).toBe('PROCESSING_ERROR')
      }
    })

    it('should handle minimal error format', () => {
      const minimalError = { error: 'Something went wrong' }

      const result = SeeDream4ErrorSchema.safeParse(minimalError)
      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.error).toBe('Something went wrong')
        expect(result.data.code).toBeUndefined()
        expect(result.data.details).toBeUndefined()
      }
    })

    it('should handle complex error details', () => {
      const complexError = {
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: {
          field: 'prompt',
          reason: 'too_short',
          minLength: 3,
          actualLength: 2,
          suggestions: ['Make prompt longer', 'Add more descriptive words']
        }
      }

      const result = SeeDream4ErrorSchema.safeParse(complexError)
      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.details).toMatchObject(complexError.details)
      }
    })
  })

  describe('SEEDREAM4_AVATAR_CONFIG Validation', () => {
    it('should validate default avatar configuration', () => {
      const avatarConfig = {
        prompt: 'create professional avatar',
        ...SEEDREAM4_AVATAR_CONFIG,
        telegram_id: MOCK_USER_DATA.telegram_id
      }

      const result = validateSeeDream4Input(avatarConfig)
      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.size).toBe('1K')
        expect(result.data.max_images).toBe(1)
        expect(result.data.aspect_ratio).toBe('9:16')
      }
    })

    it('should allow avatar config customization', () => {
      const customAvatarConfig = {
        prompt: 'create artistic portrait',
        ...SEEDREAM4_AVATAR_CONFIG,
        size: '2K' as const,
        telegram_id: MOCK_USER_DATA.telegram_id
      }

      const result = validateSeeDream4Input(customAvatarConfig)
      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.size).toBe('2K')
        expect(result.data.aspect_ratio).toBe('9:16')
      }
    })
  })

  describe('Dialog Mode Specific Validation', () => {
    it('should validate dialog mode improvement prompts', () => {
      const dialogModePrompts = [
        'make it brighter',
        'add more contrast',
        'enhance the colors',
        'improve the lighting',
        'make it more artistic',
        'increase saturation',
        'add vintage effect',
        'make it pop more'
      ]

      dialogModePrompts.forEach(prompt => {
        const input = {
          prompt,
          size: '1K' as const,
          image_input: ['https://example.com/previous_result.jpg'],
          telegram_id: MOCK_USER_DATA.telegram_id
        }

        const result = validateSeeDream4Input(input)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.prompt).toBe(prompt)
        }
      })
    })

    it('should validate dialog mode with preserved settings', () => {
      const dialogInput = {
        prompt: 'enhance this further',
        size: '2K' as const,
        image_input: ['https://example.com/last_result.jpg'],
        telegram_id: MOCK_USER_DATA.telegram_id,
        username: MOCK_USER_DATA.username,
        is_ru: MOCK_USER_DATA.is_ru,
        aspect_ratio: '2:3'
      }

      const result = validateSeeDream4Input(dialogInput)
      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.size).toBe('2K')
        expect(result.data.image_input).toHaveLength(1)
        expect(result.data.aspect_ratio).toBe('2:3')
      }
    })

    it('should validate rapid dialog iterations', () => {
      const iterations = [
        'original photo',
        'make it brighter',
        'add artistic filter',
        'enhance colors',
        'final touches'
      ]

      iterations.forEach((prompt, index) => {
        const input = {
          prompt,
          size: '1K' as const,
          image_input: [`https://example.com/iteration_${index}.jpg`],
          telegram_id: MOCK_USER_DATA.telegram_id
        }

        const result = validateSeeDream4Input(input)
        expect(result.success).toBe(true)
      })
    })
  })
})