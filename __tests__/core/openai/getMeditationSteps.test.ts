import { openai } from '@/core/openai'
import { getMeditationSteps } from '@/core/openai/getMeditationSteps'

describe('getMeditationSteps', () => {
  let mockCreate: jest.SpyInstance

  beforeEach(() => {
    mockCreate = jest.spyOn(openai.chat.completions, 'create')
  })

  afterEach(() => {
    mockCreate.mockRestore()
  })

  it('returns parsed JSON when response has valid JSON content', async () => {
    const data = { steps: ['step1', 'step2'] }
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(data) } }],
    })
    const result = await getMeditationSteps({ prompt: 'meditation tutorial' })
    expect(result).toEqual(data)
  })

  it('throws error when content is null', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: null } }] })
    await expect(getMeditationSteps({ prompt: 'test' })).rejects.toThrow(
      'Received null content from OpenAI'
    )
  })
})
