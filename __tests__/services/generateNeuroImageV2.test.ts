// Mocks
jest.mock('@/config', () => ({
  isDev: false,
  SECRET_API_KEY: 'secret',
  ELESTIO_URL: 'http://prod',
  LOCAL_SERVER_URL: 'http://local',
}))
jest.mock('axios', () => ({ post: jest.fn(), isAxiosError: jest.fn() }))
jest.mock('@/helpers/language', () => ({
  isRussian: jest.fn(ctx => ctx.from?.language_code === 'ru'),
}))

describe('generateNeuroImageV2', () => {
  let generateNeuroImageV2: any
  let axios: { post: jest.Mock; isAxiosError: jest.Mock }
  let consoleLog: jest.SpyInstance
  let consoleError: jest.SpyInstance
  let ctx: any
  const prompt = 'prompt'
  const numImages = 2
  const telegram_id = '42'
  const botName = 'bot'

  beforeEach(() => {
    jest.resetModules()
    consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {})
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    ctx = {
      session: { prompt: 'p', userModel: 'model_url' },
      from: { username: 'usr', language_code: 'en' },
      reply: jest.fn(),
    }
    axios = require('axios')
    // import under test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    generateNeuroImageV2 =
      require('@/services/generateNeuroImageV2').generateNeuroImageV2
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('throws if ctx.session.prompt missing', async () => {
    await expect(
      generateNeuroImageV2(
        prompt,
        numImages,
        telegram_id,
        { session: {}, from: {} },
        botName
      )
    ).rejects.toThrow('Prompt not found')
  })

  it('throws if ctx.session.userModel missing', async () => {
    await expect(
      generateNeuroImageV2(
        prompt,
        numImages,
        telegram_id,
        { session: { prompt }, from: {} },
        botName
      )
    ).rejects.toThrow('User model not found')
  })

  it('throws if numImages is zero', async () => {
    await expect(
      generateNeuroImageV2(prompt, 0, telegram_id, ctx, botName)
    ).rejects.toThrow('Num images not found')
  })

  it('calls API and returns data on success', async () => {
    axios.post.mockResolvedValueOnce({ data: { data: 'resData' } })
    const result = await generateNeuroImageV2(
      prompt,
      numImages,
      telegram_id,
      ctx,
      botName
    )
    expect(axios.post).toHaveBeenCalledWith(
      'http://prod/generate/neuro-photo-v2',
      {
        prompt,
        num_images: numImages,
        telegram_id,
        is_ru: false,
        bot_name: botName,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-secret-key': 'secret',
        },
      }
    )
    expect(consoleLog).toHaveBeenCalledWith(
      { data: 'resData' },
      'response.data'
    )
    expect(result).toEqual({ data: 'resData' })
  })

  it('replies specific message on NSFW axios error', async () => {
    const errorData = {
      response: { data: { error: 'NSFW content' } },
      message: 'fail',
    }
    axios.isAxiosError.mockReturnValue(true)
    axios.post.mockRejectedValueOnce(errorData)
    const res = await generateNeuroImageV2(
      prompt,
      numImages,
      telegram_id,
      { ...ctx, from: { language_code: 'ru', username: 'usr' } },
      botName
    )
    expect(consoleError).toHaveBeenCalledWith(
      'API Error:',
      errorData.response.data
    )
    expect(ctx.reply).toHaveBeenCalledWith(
      'Извините, генерация изображения не удалась из-за обнаружения неподходящего контента.'
    )
    expect(res).toBeNull()
  })

  it('replies generic message on other axios error', async () => {
    const errorData = {
      response: { data: { error: 'other' } },
      message: 'fail',
    }
    axios.isAxiosError.mockReturnValue(true)
    axios.post.mockRejectedValueOnce(errorData)
    const res = await generateNeuroImageV2(
      prompt,
      numImages,
      telegram_id,
      { ...ctx, from: { language_code: 'ru', username: 'usr' } },
      botName
    )
    expect(ctx.reply).toHaveBeenCalledWith(
      'Произошла ошибка при генерации изображения. Пожалуйста, попробуйте позже.'
    )
    expect(res).toBeNull()
  })

  it('throws original error on non-axios error', async () => {
    const err = new Error('oops')
    axios.isAxiosError.mockReturnValue(false)
    axios.post.mockRejectedValueOnce(err)
    const res = await generateNeuroImageV2(
      prompt,
      numImages,
      telegram_id,
      ctx,
      botName
    )
    expect(res).toBeNull()
  })
})
