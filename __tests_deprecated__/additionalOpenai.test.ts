import * as openaiModule from '../../../src/core/openai'

describe('Additional OpenAI modules', () => {
  let createSpy: jest.SpyInstance
  beforeEach(() => {
    jest.resetModules()
    // Spy on openai.chat.completions.create
    const { openai } = require('@/core/openai')
    createSpy = jest.spyOn(openai.chat.completions, 'create')
  })

  it('getAinews returns content string', async () => {
    createSpy.mockResolvedValue({ choices: [{ message: { content: 'news' } }] })
    const { getAinews } = require('@/core/openai/getAinews')
    const result = await getAinews({ prompt: 'p' })
    expect(createSpy).toHaveBeenCalled()
    expect(result).toBe('news')
  })

  it('getMeditationSteps parses JSON content', async () => {
    const json = '[{"step":1}]'
    createSpy.mockResolvedValue({ choices: [{ message: { content: json } }] })
    const { getMeditationSteps } = require('@/core/openai/getMeditationSteps')
    const result = await getMeditationSteps({ prompt: 'p' })
    expect(result).toEqual([{ step: 1 }])
  })

  it('getSubtitles parses JSON content', async () => {
    const arr = ['a', 'b']
    createSpy.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(arr) } }],
    })
    const { getSubtitles } = require('@/core/openai/getSubtitles')
    const result = await getSubtitles({ url: 'u' })
    expect(result).toEqual(arr)
  })

  it('getTriggerReel returns string content', async () => {
    createSpy.mockResolvedValue({
      choices: [{ message: { content: 'reel text' } }],
    })
    const { getTriggerReel } = require('@/core/openai/getTriggerReel')
    const result = await getTriggerReel({ prompt: 'p' })
    expect(result).toBe('reel text')
  })

  it('getSlides parses JSON content', async () => {
    const slides = [{ title: 't1' }, { title: 't2' }]
    createSpy.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(slides) } }],
    })
    const { getSlides } = require('@/core/openai/getSlides')
    const result = await getSlides({ prompt: 'p' })
    expect(result).toEqual(slides)
  })

  it('upgradePrompt returns content string', async () => {
    createSpy.mockResolvedValue({
      choices: [{ message: { content: 'upgraded' } }],
    })
    const { upgradePrompt } = require('@/core/openai/upgradePrompt')
    const result = await upgradePrompt({ prompt: 'p' })
    expect(result).toBe('upgraded')
  })
})
