import { MyContext } from '@/interfaces'
import makeMockContext from '../utils/mockTelegrafContext'

// Mocks
jest.mock('axios', () => ({ post: jest.fn(), isAxiosError: jest.fn() }))
jest.mock('@/config', () => ({
  MODE: 'development',
  TELEGRAM_BOT_TOKEN: 'test-token',
  TELEGRAM_BOT_TOKEN_ASSISTANT: 'test-token-assistant',
  BOT_USERNAME: 'test_bot',
  BOT_WEBHOOK_URL: 'https://example.com',
  BOT_ADMIN_ID: 123456,
  ASSISTANT_ADMIN_ID: 789012,
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SERVICE_KEY: 'test-supabase-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-supabase-service-role-key',
  NODE_ENV: 'test',
  REPLICATE_API_TOKEN: 'test-replicate-key',
  OPENROUTER_API_KEY: 'test-openrouter-key',
  OPENAI_API_KEY: 'test-openai-key',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  HOST: '0.0.0.0',
  PORT: 3000,
  LOG_LEVEL: 'debug',
  REDIS_HOST: 'localhost',
  REDIS_PORT: 6379,
  REDIS_PASSWORD: '',
  DEFAULT_MODEL_NAME: 'test-model',
  DEFAULT_PROVIDER: 'test-provider',
}))
import axios from 'axios'
import { generateImageToPrompt } from '@/services/generateImageToPrompt'

// Типизируем моки
const mockedAxiosPost = jest.mocked(axios.post)
const mockedIsAxiosError = jest.mocked(axios.isAxiosError)

describe('generateImageToPrompt', () => {
  const imageUrl = 'http://img'
  const telegram_id = '111'
  let ctx: MyContext

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    ctx = makeMockContext(
      {
        update_id: 1,
        message: {
          message_id: 1,
          from: { id: 111, username: 'usr', is_bot: false, first_name: 'Test' },
          chat: { id: 111, type: 'private', first_name: 'Test' },
          date: Date.now(),
        },
      },
      {
        userModel: {
          model_name: '',
          trigger_word: '',
          model_url: 'placeholder/placeholder:placeholder',
        },
        targetUserId: telegram_id,
      }
    )
    ctx.reply = jest.fn()
  })

  it('skips API call when ELESTIO_URL not set and replies unavailable in RU', async () => {
    process.env.ELESTIO_URL = undefined
    const result = await generateImageToPrompt(
      imageUrl,
      telegram_id,
      ctx,
      'bot',
      true
    )
    expect(ctx.reply).toHaveBeenCalledWith(
      'Функция анализа изображения временно недоступна.'
    )
    expect(result).toBeNull()
  })

  it('calls axios.post when ELESTIO_URL set and returns null', async () => {
    process.env.ELESTIO_URL = 'https://api'
    mockedAxiosPost.mockResolvedValue({})
    mockedIsAxiosError.mockReturnValue(false)

    const result = await generateImageToPrompt(
      imageUrl,
      telegram_id,
      ctx,
      'bot',
      false
    )
    expect(mockedAxiosPost).toHaveBeenCalledWith(
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
    mockedAxiosPost.mockRejectedValue(errResp)
    mockedIsAxiosError.mockReturnValue(true)

    await generateImageToPrompt(imageUrl, telegram_id, ctx, 'bot', true)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Произошла ошибка при анализе изображения. Пожалуйста, попробуйте позже.'
    )
  })

  it('handles non-axios errors and returns null', async () => {
    process.env.ELESTIO_URL = 'https://api'
    const err = new Error('boom')
    mockedAxiosPost.mockRejectedValue(err)
    mockedIsAxiosError.mockReturnValue(false)

    await expect(
      generateImageToPrompt(imageUrl, telegram_id, ctx, 'bot', false)
    ).resolves.toBeNull()
  })
})
