// Mock OpenAI and config
const mockList = jest.fn()
jest.mock('openai', () => {
  return {
    default: jest
      .fn()
      .mockImplementation(() => ({ models: { list: mockList } })),
  }
})
jest.mock('@/config', () => ({
  OPENAI_API_KEY: 'test-api-key',
}))

import { getAvailableModels } from '../../src/commands/selectModelCommand/getAvailableModels'

describe('getAvailableModels', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('filters only GPT models and sorts them', async () => {
    const modelsData = [
      { id: 'gpt-3.5' },
      { id: 'gpt-4' },
      { id: 'gpt-4-0613' },
      { id: 'instruct-gpt' },
      { id: 'gpt-3.5-turbo' },
      { id: 'gpt-4-turbo' },
      { id: 'other-model' },
    ]
    mockList.mockResolvedValue({ data: modelsData })
    const result = await getAvailableModels()
    // Expect only ids including 'gpt', excluding 'instruct', '0613'
    expect(result).toEqual(['gpt-3.5', 'gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo'])
  })

  it('returns fallback on error', async () => {
    mockList.mockRejectedValue(new Error('API failure'))
    const result = await getAvailableModels()
    expect(result).toEqual(['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'])
  })
})
