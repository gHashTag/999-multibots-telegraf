// Mock config to force API_URL fallback and then production path
jest.mock('@/config', () => ({
  isDev: true,
  SECRET_API_KEY: 'secret',
  LOCAL_SERVER_URL: 'http://localhost:3000',
  // No ELESTIO_URL in env => API_URL defaults to 'https://example.com'
}))

// Mock sendGenericErrorMessage from menu
jest.mock('@/menu', () => ({ sendGenericErrorMessage: jest.fn() }))
import { sendGenericErrorMessage } from '@/menu'

// Mock axios
import axios from 'axios'
jest.mock('axios')

// Create the function under test
import { generateVoiceAvatar } from '@/services/generateVoiceAvatar'

const makeCtx = () =>
  ({
    reply: jest.fn(),
    from: { username: 'user' },
  } as any)

describe('generateVoiceAvatar', () => {
  let ctx: any

  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeCtx()
  })

  test('fallback branch when ELESTIO_URL not set', async () => {
    const response = await generateVoiceAvatar(
      'img',
      'prompt',
      '42',
      ctx,
      true,
      'bot'
    )
    expect(ctx.reply).toHaveBeenCalledWith(
      'Функция создания голосового аватара временно недоступна.'
    )
    expect(response).toEqual({
      success: false,
      message: 'Функция временно недоступна',
    })
  })

  test('production branch calls axios.post and returns data', async () => {
    // Re-mock config to set ELESTIO_URL
    jest.doMock('@/config', () => ({
      isDev: false,
      SECRET_API_KEY: 'secret',
      LOCAL_SERVER_URL: 'http://localhost',
      ELESTIO_URL: 'https://api.prod',
    }))
    // Reload module after config change
    const { generateVoiceAvatar } = require('@/services/generateVoiceAvatar')
    ;(axios.post as jest.Mock).mockResolvedValue({
      data: { success: true, message: 'ok' },
    })
    const ctx2 = makeCtx()
    const result = await generateVoiceAvatar(
      'imgUrl',
      'desc',
      '99',
      ctx2,
      false,
      'botName'
    )
    expect(result).toEqual({ success: true, message: 'ok' })
    expect(axios.post).toHaveBeenCalledWith(
      'https://api.prod/generate/voice-avatar',
      {
        imageUrl: 'imgUrl',
        prompt: 'desc',
        telegram_id: '99',
        username: 'user',
        is_ru: false,
        bot_name: 'botName',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-secret-key': 'secret',
        },
      }
    )
  })

  test('error branch calls sendGenericErrorMessage and returns null', async () => {
    jest.doMock('@/config', () => ({
      isDev: true,
      SECRET_API_KEY: 'secret',
      LOCAL_SERVER_URL: 'http://localhost',
      ELESTIO_URL: 'https://prod',
    }))
    const { generateVoiceAvatar } = require('@/services/generateVoiceAvatar')
    const err = new Error('fail')
    ;(axios.post as jest.Mock).mockRejectedValue(err)
    const ctx3 = makeCtx()
    const res = await generateVoiceAvatar('i', 'p', '1', ctx3, false, 'bot')
    expect(sendGenericErrorMessage).toHaveBeenCalledWith(ctx3, false, err)
    expect(res).toBeNull()
  })
})
