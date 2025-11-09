import { describe, test, expect } from 'vitest'
import {
  generateModelButton,
  parseModelButton,
  generateModelKeyboard,
  ParsedModelButtonSchema
} from '@/config/unified-video-models.config'
import { z } from 'zod'

describe('🎨 UI Generation Functions with Zod Validation', () => {
  describe('generateModelButton()', () => {
    test('✅ Valid parameters - generates correct button', () => {
      const button = generateModelButton('veo3_fast', '16:9', true)

      expect(button).toContain('Veo 3 Fast')
      expect(button).toContain('🖥️')
      expect(button).toContain('37⭐')
    })

    test('✅ Valid parameters - Russian language', () => {
      const button = generateModelButton('veo3', '9:16', true)

      expect(button).toContain('Veo 3')
      expect(button).toContain('📱')
      expect(button).toContain('187⭐')
    })

    test('✅ Valid parameters - English language', () => {
      const button = generateModelButton('sora-2', '16:9', false)

      expect(button).toContain('Sora 2')
      expect(button).toContain('🖥️')
      expect(button).toContain('9⭐')
    })

    test('❌ Invalid aspectRatio - throws Zod error', () => {
      expect(() => {
        // @ts-expect-error Testing invalid input
        generateModelButton('veo3_fast', 'invalid', true)
      }).toThrow(z.ZodError)
    })

    test('❌ Empty modelId - throws Zod error', () => {
      expect(() => {
        generateModelButton('', '16:9', true)
      }).toThrow(z.ZodError)
    })

    test('❌ Non-existent model - throws Error', () => {
      expect(() => {
        generateModelButton('non-existent-model', '16:9', true)
      }).toThrow('Model not found')
    })
  })

  describe('parseModelButton()', () => {
    test('✅ Valid button text - parses correctly', () => {
      const buttonText = 'Veo 3 Fast | 8s | 🖥️ (37⭐)'
      const result = parseModelButton(buttonText)

      expect(result.modelId).toBe('veo3_fast')
      expect(result.aspectRatio).toBe('16:9')
      expect(result.cost).toBe(37)
      expect(result.duration).toBe(8)
    })

    test('✅ Valid button text - mobile aspect ratio', () => {
      const buttonText = 'Veo 3 | 8s | 📱 (187⭐)'
      const result = parseModelButton(buttonText)

      expect(result.modelId).toBe('veo3')
      expect(result.aspectRatio).toBe('9:16')
      expect(result.cost).toBe(187)
    })

    test('✅ Invalid button text - returns fallback', () => {
      const buttonText = 'Unknown Model | 🖥️'
      const result = parseModelButton(buttonText)

      // Should fallback to veo3_fast
      expect(result.modelId).toBe('veo3_fast')
      expect(result.aspectRatio).toBe('16:9')
      expect(result.cost).toBe(37)
    })

    test('✅ Result matches Zod schema', () => {
      const buttonText = 'Sora 2 | 📱 (9⭐)'
      const result = parseModelButton(buttonText)

      // Should not throw
      expect(() => ParsedModelButtonSchema.parse(result)).not.toThrow()
    })

    test('✅ Always returns non-null result', () => {
      const buttonText = 'Gibberish text'
      const result = parseModelButton(buttonText)

      expect(result).not.toBeNull()
      expect(result.modelId).toBeDefined()
      expect(result.aspectRatio).toBeDefined()
      expect(result.cost).toBeGreaterThan(0)
    })
  })

  describe('generateModelKeyboard()', () => {
    test('✅ Text input type - generates keyboard', () => {
      const keyboard = generateModelKeyboard('text', true)

      expect(keyboard.length).toBeGreaterThan(0)
      expect(keyboard[0].length).toBe(2) // Horizontal + Vertical
    })

    test('✅ Image input type - generates keyboard', () => {
      const keyboard = generateModelKeyboard('image', false)

      expect(keyboard.length).toBeGreaterThan(0)
      expect(keyboard[0][0]).toContain('🖥️') // Horizontal
      expect(keyboard[0][1]).toContain('📱') // Vertical
    })

    test('✅ With supported models filter', () => {
      const keyboard = generateModelKeyboard('text', true, ['veo3_fast', 'veo3'])

      expect(keyboard.length).toBe(2) // Only 2 models
      expect(keyboard[0][0]).toContain('Veo 3 Fast')
      expect(keyboard[1][0]).toContain('Veo 3')
    })

    test('❌ Invalid input type - throws Zod error', () => {
      expect(() => {
        // @ts-expect-error Testing invalid input
        generateModelKeyboard('invalid', true)
      }).toThrow(z.ZodError)
    })

    test('❌ Empty supported models - throws Error', () => {
      expect(() => {
        generateModelKeyboard('text', true, ['non-existent-model'])
      }).toThrow('No models found')
    })
  })

  describe('🔄 Integration Test - Full Flow', () => {
    test('✅ Generate → Parse → Validate cycle', () => {
      // Step 1: Generate button
      const buttonText = generateModelButton('veo3_fast', '16:9', true)

      // Step 2: Parse button
      const parsed = parseModelButton(buttonText)

      // Step 3: Validate with Zod
      expect(() => ParsedModelButtonSchema.parse(parsed)).not.toThrow()

      // Step 4: Check values
      expect(parsed.modelId).toBe('veo3_fast')
      expect(parsed.cost).toBe(37)
    })

    test('✅ Keyboard generation includes all button formats', () => {
      const keyboard = generateModelKeyboard('text', true, ['veo3_fast', 'sora-2'])

      // Should have 2 rows (2 models)
      expect(keyboard.length).toBe(2)

      // Each row should have horizontal + vertical
      keyboard.forEach(row => {
        expect(row.length).toBe(2)
        expect(row[0]).toContain('🖥️')
        expect(row[1]).toContain('📱')
      })
    })
  })
})
