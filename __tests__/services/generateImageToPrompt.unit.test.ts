import { jest, describe, it, expect, beforeEach } from '@jest/globals'
// Mocks
jest.mock('axios', () => ({ post: jest.fn(), isAxiosError: jest.fn() }))
jest.mock('@/config', () => ({
  isDev: true,
  SECRET_API_KEY: 'sk',
  ELESTIO_URL: undefined,
  LOCAL_SERVER_URL: 'http://localhost'
}))
import axios from 'axios'
import { generateImageToPrompt } from '@/services/generateImageToPrompt'

describe('generateImageToPrompt', () => {
  const imageUrl = 'http://img'
  const telegram_id = '111'
  let ctx: any

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    ctx = { reply: jest.fn(), from: { username: 'usr' }, telegram: { token: 'tk' } }
  })

  it('skips API call when ELESTIO_URL not set and replies unavailable in RU', async () => {
    process.env.ELESTIO_URL = undefined
    const result = await generateImageToPrompt(imageUrl, telegram_id, ctx, true, 'bot')
    expect(ctx.reply).toHaveBeenCalledWith('Функция анализа изображения временно недоступна.')
    expect(result).toBeNull()
  })

  it('calls axios.post when ELESTIO_URL set and returns null', async () => {
    process.env.ELESTIO_URL = 'https://api'
    ;(axios.post as jest.Mock).mockResolvedValue({})
    (axios.isAxiosError as jest.Mock).mockReturnValue(false)
    const result = await generateImageToPrompt(imageUrl, telegram_id, ctx, false, 'bot')
    expect(axios.post).toHaveBeenCalledWith(
      'http://localhost/generate/image-to-prompt',
      {
        image: imageUrl,
        telegram_id,
        username: 'usr',
        is_ru: false,
        bot_name: 'bot',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-secret-key': 'sk',
        },
      }
    )
    expect(result).toBeNull()
  })

  it('replies error message on axios error', async () => {
    process.env.ELESTIO_URL = 'https://api'
    const errResp = { response: { data: 'err' }, message: 'msg' }
    ;(axios.post as jest.Mock).mockRejectedValue(errResp)
    (axios.isAxiosError as jest.Mock).mockReturnValue(true)
    await generateImageToPrompt(imageUrl, telegram_id, ctx, true, 'bot')
    expect(ctx.reply).toHaveBeenCalledWith(
      'Произошла ошибка при анализе изображения. Пожалуйста, попробуйте позже.'
    )
  })

  it('handles non-axios errors and returns null', async () => {
    process.env.ELESTIO_URL = 'https://api'
    const err = new Error('boom')
    (axios.post as jest.Mock).mockRejectedValue(err)
    (axios.isAxiosError as jest.Mock).mockReturnValue(false)
    await expect(
      generateImageToPrompt(imageUrl, telegram_id, ctx, false, 'bot')
    ).resolves.toBeNull()
  })
})