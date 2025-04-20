import makeMockContext from '../utils/mockTelegrafContext'
import { pulse } from '@/helpers/pulse'

describe('pulse', () => {
  let ctx: ReturnType<typeof makeMockContext>
  let logError: jest.SpyInstance
  const prompt = 'test prompt'
  const command = 'CMD'
  const base64Image = 'data:image/png;base64,' + Buffer.from('IMG').toString('base64')

  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    // Provide default telegram methods
    ctx.telegram.sendPhoto = jest.fn(() => Promise.resolve())
    ctx.telegram.sendMessage = jest.fn(() => Promise.resolve())
    logError = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('does nothing in development mode', async () => {
    process.env.NODE_ENV = 'development'
    await pulse(ctx, base64Image, prompt, command)
    expect(ctx.telegram.sendPhoto).not.toHaveBeenCalled()
    expect(ctx.telegram.sendMessage).not.toHaveBeenCalled()
  })

  it('sends photo for valid image in production mode', async () => {
    process.env.NODE_ENV = 'production'
    await pulse(ctx, base64Image, prompt, command)
    const chatId = '-4166575919'
    expect(ctx.telegram.sendPhoto).toHaveBeenCalledTimes(1)
    const [sentChatId, photo, opts] = (ctx.telegram.sendPhoto as jest.Mock).mock.calls[0]
    expect(sentChatId).toBe(chatId)
    expect(photo).toHaveProperty('source')
    expect(opts).toHaveProperty('caption')
    expect(opts.caption).toContain('test prompt')
    expect(opts.caption).toContain('Команда: CMD')
  })

  it('sends message for null image in production mode', async () => {
    process.env.NODE_ENV = 'production'
    await pulse(ctx, null, prompt, command)
    const chatId = '-4166575919'
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('использовал команду: CMD')
    )
  })

  it('retries sending photo on migrate_to_chat_id error', async () => {
    process.env.NODE_ENV = 'production'
    const error: any = { response: { parameters: { migrate_to_chat_id: 'newChat' } } }
    let call = 0
    ctx.telegram.sendPhoto = jest.fn().mockImplementation(async () => {
      if (call++ === 0) throw error
      return undefined
    })
    await pulse(ctx, base64Image, prompt, command)
    expect(ctx.telegram.sendPhoto).toHaveBeenCalledTimes(2)
  })

  it('throws error when send without migrate_to_chat_id fails', async () => {
    process.env.NODE_ENV = 'production'
    const err = new Error('sendfail')
    ctx.telegram.sendMessage = jest.fn().mockRejectedValue(err)
    await expect(pulse(ctx, null, prompt, command)).rejects.toThrow(
      'Ошибка при отправке пульса'
    )
    expect(logError).toHaveBeenCalled()
  })
})