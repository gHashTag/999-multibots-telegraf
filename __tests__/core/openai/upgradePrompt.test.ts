import { openai } from '@/core/openai'
import { upgradePrompt } from '@/core/openai/upgradePrompt'

describe('upgradePrompt', () => {
  let mockCreate: jest.SpyInstance

  beforeEach(() => {
    mockCreate = jest.spyOn(openai.chat.completions, 'create')
  })

  afterEach(() => {
    mockCreate.mockRestore()
  })

  it('returns upgraded prompt from OpenAI', async () => {
    const upgraded = 'enhanced prompt'
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: upgraded } }],
    })
    const result = await upgradePrompt('original prompt')
    expect(result).toBe(upgraded)
  })

  it('throws error when OpenAI request fails', async () => {
    const error = new Error('upgrade failed')
    mockCreate.mockRejectedValue(error)
    await expect(upgradePrompt('original')).rejects.toThrow(error)
  })
})
