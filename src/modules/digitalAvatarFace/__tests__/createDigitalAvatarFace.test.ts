import { describe, it, expect, vi } from 'vitest'
import { createDigitalAvatarFace } from '../index'
import { MyContext } from '@/interfaces'

describe('DigitalAvatarFace Module', () => {
  it('should create digital avatar face', async () => {
    // Arrange
    const mockCtx = {
      from: { id: 123, username: 'testUser' },
      botInfo: { username: 'testBot' },
      reply: vi.fn(),
    } as unknown as MyContext
    const inputData = {
      features: { eyes: 'blue', hair: 'brown' },
      style: 'realistic',
    }
    const mockDependencies = {}

    // Act
    await createDigitalAvatarFace(mockCtx, inputData, mockDependencies)

    // Assert
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Generated avatar face:')
    )
  })
})
