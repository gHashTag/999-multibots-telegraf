import { openai } from '@/core/openai'
import { getSubtitles } from '@/core/openai/getSubtitles'

describe('getSubtitles', () => {
  let mockCreate: jest.SpyInstance

  beforeEach(() => {
    mockCreate = jest.spyOn(openai.chat.completions, 'create')
  })

  afterEach(() => {
    mockCreate.mockRestore()
  })

  it('returns parsed JSON when response has valid JSON content', async () => {
    const data = {
      subtitles: [
        { startTime: '00:00:01,000', endTime: '00:00:02,000', text: 'Hello' },
      ],
    }
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(data) } }],
    })
    const result = await getSubtitles('subtitle prompt', 10)
    expect(result).toEqual(data)
  })

  it('throws error when content is null', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: null } }] })
    await expect(getSubtitles('test', 5)).rejects.toThrow(
      'Received null content from OpenAI'
    )
  })
})
