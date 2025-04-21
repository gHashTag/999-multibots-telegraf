import { answerAi } from '../../../src/core/openai/requests'
import { openai } from '../../../src/core/openai'

jest.mock('../../../src/core/openai', () => ({
  openai: {
    chat: {
      completions: { create: jest.fn() },
    },
  },
}))

describe('answerAi', () => {
  const model = 'test-model'
  const userData = {
    username: 'u',
    first_name: 'f',
    last_name: 'l',
    company: 'c',
    position: 'p',
    designation: 'd',
  }
  const prompt = 'hello'
  const languageCode = 'en'
  const systemPrompt = 'system'

  it('returns content when GPT provides a message', async () => {
    ;(openai.chat.completions.create as jest.Mock).mockResolvedValue({
      choices: [{ message: { content: 'response text' } }],
    })
    const result = await answerAi(
      model,
      userData,
      prompt,
      languageCode,
      systemPrompt
    )
    expect(result).toBe('response text')
    expect(openai.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({ model, messages: expect.any(Array) })
    )
  })

  it('throws error when content is empty', async () => {
    ;(openai.chat.completions.create as jest.Mock).mockResolvedValue({
      choices: [{ message: { content: '' } }],
    })
    await expect(
      answerAi(model, userData, prompt, languageCode)
    ).rejects.toThrow('Empty response from GPT')
  })
})
