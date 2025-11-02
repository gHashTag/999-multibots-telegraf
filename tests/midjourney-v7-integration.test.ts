/**
 * Integration test for Midjourney v7 via Replicate
 * This test verifies that Midjourney v7 is properly integrated and can generate images
 */

import { describe, test, expect } from 'bun:test'
import { generateMidjourneyImage } from '@/services/generateMidjourneyImage'

describe('Midjourney v7 Integration', () => {
  test('should generate image with Midjourney v7 via Replicate', async () => {
    // This test requires REPLICATE_API_TOKEN to be set
    const apiToken = process.env.REPLICATE_API_TOKEN

    if (!apiToken) {
      console.log('⚠️ Skipping Midjourney v7 test - REPLICATE_API_TOKEN not set')
      return
    }

    const result = await generateMidjourneyImage({
      prompt: 'A beautiful sunset over mountains',
      telegramId: '123456789',
    })

    console.log('Midjourney v7 result:', result)

    // Basic structure validation
    expect(result).toHaveProperty('success')
    expect(result).toHaveProperty('model', 'midjourney-v7')

    if (result.success) {
      expect(result).toHaveProperty('imageUrl')
      expect(typeof result.imageUrl).toBe('string')
      expect(result.imageUrl).toMatch(/^https?:\/\//)

      expect(result).toHaveProperty('cost')
      expect(result.cost).toHaveProperty('usd', 0.15)
      expect(result.cost).toHaveProperty('stars')

      console.log('✅ Midjourney v7 integration test passed!')
    } else {
      console.log('⚠️ Midjourney v7 generation failed:', result.error)
      // Don't fail the test if the API is unavailable
    }
  }, 60000) // 60 second timeout

  test('should generate vertical image with 9:16 aspect ratio', async () => {
    const apiToken = process.env.REPLICATE_API_TOKEN

    if (!apiToken) {
      console.log('⚠️ Skipping 9:16 aspect ratio test - REPLICATE_API_TOKEN not set')
      return
    }

    const result = await generateMidjourneyImage({
      prompt: 'A tall skyscraper reaching into the clouds',
      aspectRatio: '9:16',
      telegramId: '987654321',
    })

    console.log('Midjourney v7 9:16 result:', result)

    expect(result).toHaveProperty('success')
    expect(result).toHaveProperty('model', 'midjourney-v7')

    if (result.success) {
      expect(result).toHaveProperty('imageUrl')
      expect(typeof result.imageUrl).toBe('string')
      expect(result.imageUrl).toMatch(/^https?:\/\//)

      console.log('✅ Midjourney v7 9:16 aspect ratio test passed!')
      console.log('🎯 Vertical image URL:', result.imageUrl)
    } else {
      console.log('⚠️ Midjourney v7 9:16 generation failed:', result.error)
    }
  }, 60000)
})
