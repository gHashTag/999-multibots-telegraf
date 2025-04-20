import { openai } from '@/core/openai'
import { getAinews } from '@/core/openai/getAinews'

describe('getAinews', () => {
  let mockCreate: jest.SpyInstance

  beforeEach(() => {
    mockCreate = jest.spyOn(openai.chat.completions, 'create')
  })

  afterEach(() => {
    mockCreate.mockRestore()
  })

  it('returns content when response has valid content', async () => {
    const content = 'ai generated news'
    mockCreate.mockResolvedValue({ choices: [{ message: { content } }] })
    const result = await getAinews({ prompt: 'test prompt' })
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: expect.any(String), messages: expect.any(Array), temperature: expect.any(Number) })
    )
    expect(result).toBe(content)
  })

  it('throws error when content is null', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: null } }] })
    await expect(getAinews({ prompt: 'test' })).rejects.toThrow('Received null content from OpenAI')
  })

  it('throws when OpenAI request fails', async () => {
    const error = new Error('api failure')
    mockCreate.mockRejectedValue(error)
    await expect(getAinews({ prompt: 'test' })).rejects.toThrow(error)
  })
})