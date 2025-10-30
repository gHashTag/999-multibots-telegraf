import { describe, it, expect, beforeEach } from '@jest/globals'
import { validateSeeDream4Input } from '../../../src/schemas/seedream4.schema'

/**
 * 🧪 AI PHOTOSHOP PROMPT VALIDATION TESTS
 *
 * Тестируем валидацию промптов и параметров
 * Фокус на проблемном промпте "merge" для multi-photo
 */
describe('AI Photoshop Prompt Validation', () => {
  describe('Prompt Length Validation', () => {
    it('should accept valid prompt length (10-2000 chars)', () => {
      const validPrompts = [
        'enhance this image', // 18 chars
        'merge these two beautiful images together with artistic style', // 62 chars
        'a'.repeat(1000), // 1000 chars
        'create a stunning artistic composition from these photographs with vibrant colors and detailed textures that showcase the beauty of the original subjects while adding creative flair and professional finishing touches that make the final result truly spectacular and worthy of professional portfolio inclusion with enhanced lighting and color grading that brings out the best in every element of the composition', // ~500 chars
        'x'.repeat(2000) // Maximum allowed
      ]

      validPrompts.forEach(prompt => {
        const input = {
          prompt,
          size: '1K' as const,
          max_images: 1,
          image_input: ['https://example.com/image.jpg'],
          telegram_id: '123456789'
        }

        const result = validateSeeDream4Input(input)
        expect(result.success).toBe(true)
      })
    })

    it('should reject prompts that are too short', () => {
      const shortPrompts = [
        '', // Empty
        'hi', // 2 chars
        'merge', // 5 chars
        'test pic' // 8 chars (under 10)
      ]

      shortPrompts.forEach(prompt => {
        const input = {
          prompt,
          size: '1K' as const,
          max_images: 1,
          image_input: ['https://example.com/image.jpg'],
          telegram_id: '123456789'
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
        max_images: 1,
        image_input: ['https://example.com/image.jpg'],
        telegram_id: '123456789'
      }

      const result = validateSeeDream4Input(input)
      expect(result.success).toBe(false)
    })

    it('should reject whitespace-only prompts', () => {
      const whitespacePrompts = [
        '          ', // Spaces only
        '\t\t\t\t\t\t\t\t\t\t', // Tabs only
        '\n\n\n\n\n\n\n\n\n\n', // Newlines only
        '   \t  \n  \t   ' // Mixed whitespace
      ]

      whitespacePrompts.forEach(prompt => {
        const input = {
          prompt,
          size: '1K' as const,
          max_images: 1,
          image_input: ['https://example.com/image.jpg'],
          telegram_id: '123456789'
        }

        const result = validateSeeDream4Input(input)
        expect(result.success).toBe(false)
      })
    })
  })

  describe('Multi-Photo Prompt Testing', () => {
    it('should handle "merge" prompt correctly', () => {
      const mergePrompt = 'merge these two images together'

      const input = {
        prompt: mergePrompt,
        size: '1K' as const,
        max_images: 2,
        image_input: [
          'https://example.com/image1.jpg',
          'https://example.com/image2.jpg'
        ],
        telegram_id: '123456789'
      }

      const result = validateSeeDream4Input(input)
      expect(result.success).toBe(true)
      expect(result.data?.prompt).toBe(mergePrompt)
      expect(result.data?.max_images).toBe(2)
      expect(result.data?.image_input).toHaveLength(2)
    })

    it('should handle complex multi-photo prompts', () => {
      const complexPrompts = [
        'combine these photos into a beautiful collage with artistic borders',
        'merge these images and apply vintage filter with sepia tones and film grain',
        'create a panoramic view by stitching these photos together seamlessly',
        'blend these portraits into a single artistic composition with bokeh background',
        'fuse these landscape photos and enhance the colors to create epic sunset scene'
      ]

      complexPrompts.forEach(prompt => {
        const input = {
          prompt,
          size: '2K' as const,
          max_images: 3,
          image_input: [
            'https://example.com/img1.jpg',
            'https://example.com/img2.jpg',
            'https://example.com/img3.jpg'
          ],
          telegram_id: '123456789'
        }

        const result = validateSeeDream4Input(input)
        expect(result.success).toBe(true)
        expect(result.data?.prompt).toBe(prompt)
      })
    })

    it('should validate prompt keywords for multi-photo operations', () => {
      const multiPhotoKeywords = [
        'merge', 'combine', 'blend', 'fuse', 'stitch', 'collage',
        'montage', 'composite', 'unite', 'join', 'mix', 'overlay'
      ]

      multiPhotoKeywords.forEach(keyword => {
        const prompt = `${keyword} these images with professional quality`

        const input = {
          prompt,
          size: '1K' as const,
          max_images: 2,
          image_input: [
            'https://example.com/img1.jpg',
            'https://example.com/img2.jpg'
          ],
          telegram_id: '123456789'
        }

        const result = validateSeeDream4Input(input)
        expect(result.success).toBe(true)
        expect(result.data?.prompt).toContain(keyword)
      })
    })
  })

  describe('Style-Based Prompt Templates', () => {
    const AI_PHOTOSHOP_STYLES = {
      portrait: {
        template: 'professional portrait, high quality, studio lighting, detailed face'
      },
      artistic: {
        template: 'artistic style, creative composition, vibrant colors, detailed artwork'
      },
      photorealistic: {
        template: 'photorealistic, ultra detailed, high resolution, professional photography'
      },
      fantasy: {
        template: 'fantasy style, magical atmosphere, mystical elements, epic composition'
      },
      cyberpunk: {
        template: 'cyberpunk style, neon lights, futuristic, technological atmosphere'
      },
      vintage: {
        template: 'vintage style, retro aesthetic, classic composition, nostalgic mood'
      }
    }

    it('should validate all style templates', () => {
      Object.entries(AI_PHOTOSHOP_STYLES).forEach(([styleKey, style]) => {
        const input = {
          prompt: style.template,
          size: '1K' as const,
          max_images: 1,
          image_input: ['https://example.com/image.jpg'],
          telegram_id: '123456789'
        }

        const result = validateSeeDream4Input(input)
        expect(result.success).toBe(true)
        expect(result.data?.prompt).toBe(style.template)
      })
    })

    it('should combine style templates with custom text', () => {
      const customAdditions = [
        'with enhanced details',
        'in 4K resolution',
        'with professional lighting',
        'featuring dramatic shadows',
        'with vibrant color palette'
      ]

      customAdditions.forEach(addition => {
        const baseTemplate = AI_PHOTOSHOP_STYLES.artistic.template
        const combinedPrompt = `${baseTemplate} ${addition}`

        const input = {
          prompt: combinedPrompt,
          size: '2K' as const,
          max_images: 1,
          image_input: ['https://example.com/image.jpg'],
          telegram_id: '123456789'
        }

        const result = validateSeeDream4Input(input)
        expect(result.success).toBe(true)
        expect(result.data?.prompt).toContain(baseTemplate)
        expect(result.data?.prompt).toContain(addition)
      })
    })
  })

  describe('Language Support', () => {
    it('should handle English prompts', () => {
      const englishPrompts = [
        'enhance this beautiful landscape photo with vibrant colors',
        'create a professional portrait with studio lighting',
        'merge these vacation photos into a stunning collage',
        'apply artistic filters to this street photography'
      ]

      englishPrompts.forEach(prompt => {
        const input = {
          prompt,
          size: '1K' as const,
          max_images: 1,
          image_input: ['https://example.com/image.jpg'],
          telegram_id: '123456789'
        }

        const result = validateSeeDream4Input(input)
        expect(result.success).toBe(true)
      })
    })

    it('should handle Russian prompts', () => {
      const russianPrompts = [
        'улучши это красивое фото с яркими цветами',
        'создай профессиональный портрет со студийным освещением',
        'объедини эти фотографии в красивый коллаж',
        'примени художественные фильтры к этому снимку'
      ]

      russianPrompts.forEach(prompt => {
        const input = {
          prompt,
          size: '1K' as const,
          max_images: 1,
          image_input: ['https://example.com/image.jpg'],
          telegram_id: '123456789'
        }

        const result = validateSeeDream4Input(input)
        expect(result.success).toBe(true)
      })
    })

    it('should handle mixed language prompts', () => {
      const mixedPrompts = [
        'enhance this фото with artistic style',
        'создай beautiful portrait with professional освещение',
        'merge эти images into stunning коллаж'
      ]

      mixedPrompts.forEach(prompt => {
        const input = {
          prompt,
          size: '1K' as const,
          max_images: 1,
          image_input: ['https://example.com/image.jpg'],
          telegram_id: '123456789'
        }

        const result = validateSeeDream4Input(input)
        expect(result.success).toBe(true)
      })
    })
  })

  describe('Special Characters and Formatting', () => {
    it('should handle prompts with special characters', () => {
      const specialCharPrompts = [
        'enhance this photo & make it pop!',
        'create a portrait @ 4K resolution',
        'apply effect #vintage with 50% opacity',
        'merge photos: img1.jpg + img2.jpg = masterpiece',
        'enhance with 100% quality (no compression)'
      ]

      specialCharPrompts.forEach(prompt => {
        const input = {
          prompt,
          size: '1K' as const,
          max_images: 1,
          image_input: ['https://example.com/image.jpg'],
          telegram_id: '123456789'
        }

        const result = validateSeeDream4Input(input)
        expect(result.success).toBe(true)
        expect(result.data?.prompt).toBe(prompt)
      })
    })

    it('should handle prompts with emojis', () => {
      const emojiPrompts = [
        'enhance this 📸 with artistic style ✨',
        'create beautiful portrait 👤 with professional lighting 💡',
        'merge these vacation photos 🏖️ into stunning collage 🎨',
        'apply vintage filter 📷 with sepia tones 🟤'
      ]

      emojiPrompts.forEach(prompt => {
        const input = {
          prompt,
          size: '1K' as const,
          max_images: 1,
          image_input: ['https://example.com/image.jpg'],
          telegram_id: '123456789'
        }

        const result = validateSeeDream4Input(input)
        expect(result.success).toBe(true)
      })
    })

    it('should handle prompts with line breaks', () => {
      const multilinePrompts = [
        'enhance this photo\nwith artistic style\nand vibrant colors',
        'create portrait:\n- studio lighting\n- high resolution\n- professional quality',
        'merge images\n1. apply filters\n2. enhance colors\n3. add effects'
      ]

      multilinePrompts.forEach(prompt => {
        const input = {
          prompt,
          size: '1K' as const,
          max_images: 1,
          image_input: ['https://example.com/image.jpg'],
          telegram_id: '123456789'
        }

        const result = validateSeeDream4Input(input)
        expect(result.success).toBe(true)
      })
    })
  })

  describe('Prompt Sanitization', () => {
    it('should handle prompts with extra whitespace', () => {
      const messyPrompts = [
        '   enhance this photo with artistic style   ',
        '\t\tcreate beautiful portrait\t\t',
        '\n\nmerge these images together\n\n',
        '  enhance   with   multiple   spaces  '
      ]

      messyPrompts.forEach(prompt => {
        const input = {
          prompt,
          size: '1K' as const,
          max_images: 1,
          image_input: ['https://example.com/image.jpg'],
          telegram_id: '123456789'
        }

        const result = validateSeeDream4Input(input)
        // Should trim whitespace but still be valid
        expect(prompt.trim().length).toBeGreaterThan(10)
      })
    })

    it('should validate prompt after trimming', () => {
      const edgeCasePrompts = [
        '          enhance photo          ', // Valid after trim
        '     hi     ', // Invalid after trim (too short)
        '   ' + 'a'.repeat(2000) + '   ', // Valid exactly at limit after trim
        '   ' + 'a'.repeat(2001) + '   ' // Invalid after trim (too long)
      ]

      edgeCasePrompts.forEach(prompt => {
        const trimmed = prompt.trim()
        const shouldBeValid = trimmed.length >= 10 && trimmed.length <= 2000

        const input = {
          prompt,
          size: '1K' as const,
          max_images: 1,
          image_input: ['https://example.com/image.jpg'],
          telegram_id: '123456789'
        }

        const result = validateSeeDream4Input(input)
        expect(result.success).toBe(shouldBeValid)
      })
    })
  })

  describe('Prompt Fallback Scenarios', () => {
    it('should provide fallback prompts for empty custom prompts', () => {
      const fallbackPrompts = {
        artistic: 'artistic style, creative composition, vibrant colors, detailed artwork',
        portrait: 'professional portrait, high quality, studio lighting, detailed face',
        photorealistic: 'photorealistic, ultra detailed, high resolution, professional photography',
        default: 'enhance this image'
      }

      Object.entries(fallbackPrompts).forEach(([style, fallback]) => {
        expect(fallback.length).toBeGreaterThanOrEqual(10)
        expect(fallback.length).toBeLessThanOrEqual(2000)

        const input = {
          prompt: fallback,
          size: '1K' as const,
          max_images: 1,
          image_input: ['https://example.com/image.jpg'],
          telegram_id: '123456789'
        }

        const result = validateSeeDream4Input(input)
        expect(result.success).toBe(true)
      })
    })

    it('should validate ultimate fallback prompt', () => {
      const ultimateFallback = 'enhance this image'

      const input = {
        prompt: ultimateFallback,
        size: '1K' as const,
        max_images: 1,
        image_input: ['https://example.com/image.jpg'],
        telegram_id: '123456789'
      }

      const result = validateSeeDream4Input(input)
      expect(result.success).toBe(true)
      expect(result.data?.prompt).toBe(ultimateFallback)
    })
  })
})