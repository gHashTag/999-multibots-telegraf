import { describe, it, expect, beforeEach, jest } from '@jest/globals'

// Mock the OpenAI client
const mockCreate = jest.fn()
jest.mock('@/core/openai', () => ({
  openai: {
    chat: {
      completions: { create: mockCreate }
    }
  }
}))

import { getCaptionForNews } from '@/core/openai/getCaptionForNews'

describe('getCaptionForNews', () => {
  const samplePrompt = 'Sample news prompt'
  const fakeContent = 'Generated caption'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should call OpenAI chat completion with correct parameters and return content', async () => {
    // Arrange: mock successful completion
    mockCreate.mockResolvedValue({
      choices: [ { message: { content: fakeContent } } ]
    })
    // Act
    const result = await getCaptionForNews({ prompt: samplePrompt })
    // Assert
    expect(mockCreate).toHaveBeenCalledWith({
      model: 'gpt-4o-mini',
      messages: [
        expect.objectContaining({ role: 'system', content: expect.any(String) }),
        { role: 'user', content: samplePrompt }
      ],
      temperature: 0.7
    })
    expect(result).toBe(fakeContent)
  })

  it('should throw if OpenAI returns null content', async () => {
    // Arrange: mock completion with null content
    mockCreate.mockResolvedValue({
      choices: [ { message: { content: null } } ]
    })
    // Act & Assert
    await expect(getCaptionForNews({ prompt: samplePrompt }))
      .rejects.toThrow('Received null content from OpenAI')
  })

  it('should propagate errors from the OpenAI client', async () => {
    const clientError = new Error('network error')
    mockCreate.mockRejectedValue(clientError)
    await expect(getCaptionForNews({ prompt: samplePrompt }))
      .rejects.toBe(clientError)
  })
})