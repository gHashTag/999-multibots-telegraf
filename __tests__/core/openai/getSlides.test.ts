import { openai } from '@/core/openai'
import { getSlides } from '@/core/openai/getSlides'

describe('getSlides', () => {
  let mockCreate: jest.SpyInstance

  beforeEach(() => {
    mockCreate = jest.spyOn(openai.chat.completions, 'create')
  })

  afterEach(() => {
    mockCreate.mockRestore()
  })

  it('returns parsed JSON when response has valid JSON content', async () => {
    const data = { scenes: [{ number: 1, text: 'test', onscreenText: 'test' }] }
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(data) } }],
    })
    const result = await getSlides({
      prompt: 'slide prompt',
      scenesCount: 1,
      isDescription: false,
    })
    expect(result).toEqual(data)
  })

  it('throws error when content is null', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: null } }] })
    await expect(
      getSlides({ prompt: 'test', scenesCount: 2, isDescription: true })
    ).rejects.toThrow('Received null content from OpenAI')
  })
})
