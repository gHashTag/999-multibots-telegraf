import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'

// Mock config and axios
jest.mock('@/config', () => ({
  isDev: true,
  SECRET_API_KEY: 'secret',
  ELESTIO_URL: 'http://prod',
  LOCAL_SERVER_URL: 'http://local'
}))
jest.mock('axios', () => ({
  post: jest.fn(),
  isAxiosError: jest.fn()
}))

describe('generateImageToVideo', () => {
  let generateImageToVideo: any
  let axios: { post: jest.Mock; isAxiosError: jest.Mock }
  let consoleLog: jest.SpyInstance
  let consoleError: jest.SpyInstance
  let ctx: any
  const imageUrl = 'http://img'
  const prompt = 'test prompt'
  const videoModel = 'modelA'
  const telegram_id = '42'
  const username = 'user42'
  const botName = 'botX'

  beforeEach(() => {
    jest.resetModules()
    // Suppress logs
    consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {})
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    ctx = {}
    axios = require('axios')
    // Import function under test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    generateImageToVideo = require('@/services/generateImageToVideo').generateImageToVideo
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('throws if required parameters missing', async () => {
    await expect(generateImageToVideo('', prompt, videoModel, telegram_id, username, true, botName))
      .rejects.toThrow('Image URL is required')
    await expect(generateImageToVideo(imageUrl, '', videoModel, telegram_id, username, true, botName))
      .rejects.toThrow('Prompt is required')
    await expect(generateImageToVideo(imageUrl, prompt, '' as any, telegram_id, username, true, botName))
      .rejects.toThrow('Video model is required')
    await expect(generateImageToVideo(imageUrl, prompt, videoModel, '', username, true, botName))
      .rejects.toThrow('Telegram ID is required')
    await expect(generateImageToVideo(imageUrl, prompt, videoModel, telegram_id, '', true as any, botName))
      .rejects.toThrow('Username is required')
    await expect(generateImageToVideo(imageUrl, prompt, videoModel, telegram_id, username, false, botName))
      .rejects.toThrow('Language is required')
  })

  it('calls axios.post and returns data on success', async () => {
    const responseData = { videoUrl: 'http://video', status: 'ok' }
    axios.post.mockResolvedValueOnce({ data: responseData })
    const result = await generateImageToVideo(imageUrl, prompt, videoModel, telegram_id, username, true, botName)
    expect(axios.post).toHaveBeenCalledWith(
      'http://local/generate/image-to-video',
      { imageUrl, prompt, videoModel, telegram_id, username, is_ru: true, bot_name: botName },
      { headers: { 'Content-Type': 'application/json', 'x-secret-key': 'secret' } }
    )
    expect(consoleLog).toHaveBeenCalledWith('Image to video generation response:', responseData)
    expect(result).toEqual(responseData)
  })

  it('throws localized error on axios error', async () => {
    const errObj = { response: { data: 'err' }, message: 'msg' }
    axios.isAxiosError.mockReturnValueOnce(true)
    axios.post.mockRejectedValueOnce(errObj)
    await expect(generateImageToVideo(imageUrl, prompt, videoModel, telegram_id, username, true, botName))
      .rejects.toThrow('Произошла ошибка при преобразовании изображения в видео')
    expect(consoleError).toHaveBeenCalledWith('API Error:', 'err')
  })

  it('throws original error on non-axios error', async () => {
    const err = new Error('fail')
    axios.isAxiosError.mockReturnValueOnce(false)
    axios.post.mockRejectedValueOnce(err)
    await expect(generateImageToVideo(imageUrl, prompt, videoModel, telegram_id, username, true, botName))
      .rejects.toThrow(err)
    expect(consoleError).toHaveBeenCalledWith('Unexpected error:', err)
  })
})