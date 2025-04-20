import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'

// Mocks
jest.mock('@/config', () => ({
  isDev: true,
  SECRET_API_KEY: 'secret',
  ELESTIO_URL: 'http://prod',
  LOCAL_SERVER_URL: 'http://local'
}))
jest.mock('axios', () => ({ post: jest.fn() }))
jest.mock('@/helpers/language', () => ({ isRussian: jest.fn((ctx) => ctx.from?.language_code === 'ru') }))

describe('generateNeuroImage', () => {
  let generateNeuroImage: any
  let axios: { post: jest.Mock }
  let consoleLog: jest.SpyInstance
  let consoleError: jest.SpyInstance
  let ctx: any
  const prompt = 'a prompt'
  const model_url = 'http://model'
  const numImages = 2
  const telegram_id = '42'
  const botName = 'botX'

  beforeEach(() => {
    jest.resetModules()
    // Suppress logs
    consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {})
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    // Default context with session and from
    ctx = { session: { prompt: 'sess prompt', userModel: 'murl' }, from: { username: 'usr', language_code: 'en' }, reply: jest.fn() }
    axios = require('axios')
    // Import function under test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    generateNeuroImage = require('@/services/generateNeuroImage').generateNeuroImage
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('throws error when ctx.session.prompt missing', async () => {
    await expect(generateNeuroImage(prompt, model_url, numImages, telegram_id, { session: {}, from: {} }, botName))
      .rejects.toThrow('Prompt not found')
  })

  it('throws error when ctx.session.userModel missing', async () => {
    await expect(generateNeuroImage(prompt, model_url, numImages, telegram_id, { session: { prompt: 'p' }, from: {} }, botName))
      .rejects.toThrow('User model not found')
  })

  it('throws error when numImages is zero', async () => {
    await expect(generateNeuroImage(prompt, model_url, 0, telegram_id, ctx, botName))
      .rejects.toThrow('Num images not found')
  })

  it('calls axios.post and returns data on success', async () => {
    const data = { data: 'resultData' }
    axios.post.mockResolvedValueOnce({ data })
    const res = await generateNeuroImage(prompt, model_url, numImages, telegram_id, ctx, botName)
    expect(axios.post).toHaveBeenCalledWith(
      'http://local/generate/neuro-photo',
      {
        prompt,
        model_url,
        num_images: numImages,
        telegram_id,
        username: 'usr',
        is_ru: false,
        bot_name: botName,
      },
      { headers: { 'Content-Type': 'application/json', 'x-secret-key': 'secret' } }
    )
    expect(res).toBe(data)
  })

  it('handles axios error, logs and replies', async () => {
    const err = new Error('api fail')
    axios.post.mockRejectedValueOnce(err)
    const res = await generateNeuroImage(prompt, model_url, numImages, telegram_id, ctx, botName)
    expect(consoleError).toHaveBeenCalledWith('Ошибка при генерации нейроизображения:', err)
    expect(ctx.reply).toHaveBeenCalledWith(
      'An error occurred during image generation. Please try again later.'
    )
    expect(res).toBeNull()
  })
})