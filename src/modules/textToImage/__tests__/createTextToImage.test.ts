import { describe, it, expect, vi } from 'vitest'
import { createTextToImage } from '../index'
import { MyContext } from '@/interfaces'

describe('TextToImage Module', () => {
  it('should create image from text', async () => {
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

    // Act
    await createTextToImage(mockCtx, inputData, mockDependencies)

    // Assert
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Generated image:')
    )
  })
})
