import { openai } from '@/core/openai'
import { getTriggerReel } from '@/core/openai/getTriggerReel'

describe('getTriggerReel', () => {
  let mockCreate: jest.SpyInstance

  beforeEach(() => {
    mockCreate = jest.spyOn(openai.chat.completions, 'create')
  })

  afterEach(() => {
    mockCreate.mockRestore()
  })

  it('returns content when response has valid content', async () => {
    const content = 'hook text'
    mockCreate.mockResolvedValue({ choices: [{ message: { content } }] })
    const result = await getTriggerReel({ prompt: 'trigger prompt' })
    expect(result).toBe(content)
  })

  it('throws error when content is null', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: null } }] })
    await expect(getTriggerReel({ prompt: 'test' })).rejects.toThrow('Received null content from OpenAI')
  })
})