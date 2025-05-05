import { describe, it, expect, vi } from 'vitest'
import { createTextToImage } from '../index'
import { MyContext } from '@/interfaces'
import * as textToImageAdapter from '../adapters/textToImageAdapter'

describe('TextToImage Module', () => {
  it('should create image from text successfully', async () => {
    // Arrange
    const mockCtx = {
      from: { id: 123, username: 'testUser' },
      botInfo: { username: 'testBot' },
      reply: vi.fn(),
    } as unknown as MyContext
    const inputData = {
      text: 'A beautiful sunset over the mountains',
    }
    const mockDependencies = {}
    vi.spyOn(textToImageAdapter, 'generateImageFromText').mockResolvedValue(
      'mocked-image-url'
    )

    // Act
    await createTextToImage(mockCtx, inputData, mockDependencies)

    // Assert
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Generated image: mocked-image-url')
    )
  })

  it('should handle error when no text is provided', async () => {
    // Arrange
    const mockCtx = {
      from: { id: 123, username: 'testUser' },
      botInfo: { username: 'testBot' },
      reply: vi.fn(),
    } as unknown as MyContext
    const inputData = {
      text: '',
    }
    const mockDependencies = {}

    // Act
    await createTextToImage(mockCtx, inputData, mockDependencies)

    // Assert
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining(
        '❌ Error generating image: Error: No text provided for image generation'
      )
    )
  })

  it('should handle error when API call fails', async () => {
    // Arrange
    const mockCtx = {
      from: { id: 123, username: 'testUser' },
      botInfo: { username: 'testBot' },
      reply: vi.fn(),
    } as unknown as MyContext
    const inputData = {
      text: 'A beautiful sunset over the mountains',
    }
    const mockDependencies = {}
    vi.spyOn(textToImageAdapter, 'generateImageFromText').mockRejectedValue(
      new Error('API failure')
    )

    // Act
    await createTextToImage(mockCtx, inputData, mockDependencies)

    // Assert
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('❌ Error generating image: Error: API failure')
    )
  })
})
