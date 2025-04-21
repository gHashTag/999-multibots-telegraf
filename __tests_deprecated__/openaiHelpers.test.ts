// Mock OpenAI constructor and chat.completions.create
const mockCreate = jest.fn()
jest.mock('openai', () => jest.fn().mockImplementation(() => ({ chat: { completions: { create: mockCreate } } })))
describe('core/openai index and helpers', () => {
  beforeEach(() => { jest.resetModules(); mockCreate.mockReset(); })
  it('throws if OPENAI_API_KEY not set', () => {
    delete process.env.OPENAI_API_KEY
    expect(() => require('../../src/core/openai')).toThrow('OPENAI_API_KEY is not set')
  })
  it('constructs OpenAI with apiKey', () => {
    process.env.OPENAI_API_KEY = 'key'
    const OpenAIMod = require('../../src/core/openai')
    const OpenAI = require('openai')
    expect(OpenAI).toHaveBeenCalledWith({ apiKey: 'key' })
    expect(OpenAIMod.openai).toBeDefined()
  })
  describe('getAinews', () => {
    let getAinews: any
    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'key'
      jest.resetModules()
      require('../../src/core/openai')
      getAinews = require('../../src/core/openai/getAinews').getAinews
    })
    it('returns content when provided', async () => {
      mockCreate.mockResolvedValue({ choices: [{ message: { content: 'text' } }] })
      const res = await getAinews({ prompt: 'p' })
      expect(res).toBe('text')
    })
    it('throws if content is null', async () => {
      mockCreate.mockResolvedValue({ choices: [{ message: { content: null } }] })
      await expect(getAinews({ prompt: '' })).rejects.toThrow('Received null content from OpenAI')
    })
  })
  describe('getMeditationSteps', () => {
    let getMeditationSteps: any
    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'key'
      jest.resetModules()
      require('../../src/core/openai')
      getMeditationSteps = require('../../src/core/openai/getMeditationSteps').getMeditationSteps
    })
    it('parses JSON content', async () => {
      const obj = { steps: [1,2,3] }
      mockCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(obj) } }] })
      const res = await getMeditationSteps({ prompt: 'p' })
      expect(res).toEqual(obj)
    })
    it('throws if content is null', async () => {
      mockCreate.mockResolvedValue({ choices: [{ message: { content: null } }] })
      await expect(getMeditationSteps({ prompt: '' })).rejects.toThrow('Received null content from OpenAI')
    })
  })
})