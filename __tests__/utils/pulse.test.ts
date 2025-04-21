import { pulse } from '@/helpers/pulse'

describe('pulse helper', () => {
  let ctx: any
  const image = 'data:image/png;base64,AAAA'
  const prompt = 'test prompt'
  const command = '/test'

  beforeEach(() => {
    jest.clearAllMocks()
    // Default to production environment
    process.env.NODE_ENV = 'production'
    ctx = {
      from: { username: 'alice', id: 111 },
      telegram: {
        sendPhoto: jest.fn().mockResolvedValue(undefined),
        sendMessage: jest.fn().mockResolvedValue(undefined),
      },
    }
  })

  it('does nothing in development environment', async () => {
    process.env.NODE_ENV = 'development'
    await expect(pulse(ctx, image, prompt, command)).resolves.toBeUndefined()
    expect(ctx.telegram.sendPhoto).not.toHaveBeenCalled()
    expect(ctx.telegram.sendMessage).not.toHaveBeenCalled()
  })

  it('sends photo when image is provided', async () => {
    await pulse(ctx, image, prompt, command)
    expect(ctx.telegram.sendPhoto).toHaveBeenCalledWith(
      '-4166575919',
      { source: expect.any(Buffer) },
      { caption: expect.stringContaining(prompt) }
    )
  })

  it('sends message when image is null', async () => {
    await pulse(ctx, null, prompt, command)
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      '-4166575919',
      expect.stringContaining('использовал команду')
    )
  })

  it('retries sendPhoto on migrate_to_chat_id error', async () => {
    const migrateError: any = new Error('migrate')
    migrateError.response = { parameters: { migrate_to_chat_id: 'new_chat' } }
    ctx.telegram.sendPhoto = jest.fn()
      .mockRejectedValueOnce(migrateError)
      .mockResolvedValue(undefined)
    await pulse(ctx, image, prompt, command)
    expect(ctx.telegram.sendPhoto).toHaveBeenCalledTimes(2)
    expect(ctx.telegram.sendPhoto).toHaveBeenLastCalledWith(
      'new_chat',
      { source: expect.any(Buffer) },
      { caption: expect.stringContaining(prompt) }
    )
  })

  it('retries sendMessage on migrate_to_chat_id error', async () => {
    const migrateError: any = new Error('migrate')
    migrateError.response = { parameters: { migrate_to_chat_id: 'new_chat' } }
    ctx.telegram.sendMessage = jest.fn()
      .mockRejectedValueOnce(migrateError)
      .mockResolvedValue(undefined)
    await pulse(ctx, null, prompt, command)
    expect(ctx.telegram.sendMessage).toHaveBeenCalledTimes(2)
    expect(ctx.telegram.sendMessage).toHaveBeenLastCalledWith(
      'new_chat',
      expect.stringContaining('использовал команду')
    )
  })

  it('throws on non-migration error', async () => {
    const randomError: any = new Error('random')
    randomError.response = { parameters: {} }
    ctx.telegram.sendMessage = jest.fn().mockRejectedValue(randomError)
    await expect(pulse(ctx, null, prompt, command))
      .rejects.toThrow('Ошибка при отправке пульса')
  })
})