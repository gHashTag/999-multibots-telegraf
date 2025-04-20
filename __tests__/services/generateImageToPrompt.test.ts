import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// Preserve original env
const originalEnv = process.env

describe('generateImageToPrompt', () => {
  let generateImageToPrompt: any
  let ctx: any
  let axiosMock: any

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
    // Default config: not dev
    jest.doMock('@/config', () => ({ isDev: false, SECRET_API_KEY: 'key', ELESTIO_URL: process.env.ELESTIO_URL, LOCAL_SERVER_URL: 'http://localhost' }))
    // Prepare context mock
    ctx = { from: { username: 'user' }, reply: jest.fn() }
    // Suppress logs
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('skips API call and replies when ELESTIO_URL not set', async () => {
    delete process.env.ELESTIO_URL
    axiosMock = { post: jest.fn(), isAxiosError: jest.fn() }
    jest.doMock('axios', () => axiosMock)
    const mod = require('@/services/generateImageToPrompt')
    generateImageToPrompt = mod.generateImageToPrompt
    const result = await generateImageToPrompt('http://img', '42', ctx, true, 'bot')
    expect(result).toBeNull()
    expect(console.log).toHaveBeenCalledWith('⚠️ ELESTIO_URL not set, skipping API call')
    expect(ctx.reply).toHaveBeenCalledWith('Функция анализа изображения временно недоступна.')
  })

  it('makes API call when ELESTIO_URL is set', async () => {
    process.env.ELESTIO_URL = 'https://api.test'
    jest.doMock('@/config', () => ({ isDev: false, SECRET_API_KEY: 'key', ELESTIO_URL: process.env.ELESTIO_URL, LOCAL_SERVER_URL: 'http://localhost' }))
    axiosMock = { post: jest.fn().mockResolvedValue({ data: {} }), isAxiosError: jest.fn().mockReturnValue(false) }
    jest.doMock('axios', () => axiosMock)
    const mod = require('@/services/generateImageToPrompt')
    generateImageToPrompt = mod.generateImageToPrompt
    const result = await generateImageToPrompt('http://img', '42', ctx, false, 'bot')
    expect(result).toBeNull()
    expect(axiosMock.post).toHaveBeenCalledWith(
      'https://api.test/generate/image-to-prompt',
      { image: 'http://img', telegram_id: '42', username: 'user', is_ru: false, bot_name: 'bot' },
      { headers: { 'Content-Type': 'application/json', 'x-secret-key': 'key' } }
    )
    expect(ctx.reply).not.toHaveBeenCalled()
  })

  it('replies with error message on axios error', async () => {
    process.env.ELESTIO_URL = 'https://api.test'
    jest.doMock('@/config', () => ({ isDev: false, SECRET_API_KEY: 'key', ELESTIO_URL: process.env.ELESTIO_URL, LOCAL_SERVER_URL: 'http://localhost' }))
    const error = new Error('api fail')
    axiosMock = { post: jest.fn().mockRejectedValue(error), isAxiosError: jest.fn().mockReturnValue(true) }
    jest.doMock('axios', () => axiosMock)
    const mod = require('@/services/generateImageToPrompt')
    generateImageToPrompt = mod.generateImageToPrompt
    const result = await generateImageToPrompt('img', '42', ctx, false, 'bot')
    expect(result).toBeNull()
    expect(console.error).toHaveBeenCalledWith('API Error:', expect.any(Object))
    expect(ctx.reply).toHaveBeenCalledWith('An error occurred while analyzing the image. Please try again later.')
  })
})