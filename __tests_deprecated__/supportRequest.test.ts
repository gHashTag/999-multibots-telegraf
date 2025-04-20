
// Set required environment before importing module
beforeAll(() => {
  process.env.BOT_TOKEN_1 = 'b1'
  process.env.BOT_TOKEN_2 = 'b2'
  process.env.BOT_TOKEN_3 = 'b3'
  process.env.BOT_TOKEN_4 = 'b4'
  process.env.BOT_TOKEN_5 = 'b5'
  process.env.BOT_TOKEN_6 = 'b6'
  process.env.BOT_TOKEN_7 = 'b7'
  process.env.BOT_TOKEN_TEST_1 = 'b8'
  process.env.BOT_TOKEN_TEST_2 = 'b9'
  process.env.NODE_ENV = 'production'
  process.env.SUPPORT_CHAT_ID = 'chat123'
})

afterEach(() => {
  jest.resetModules()
})

describe('supportRequest', () => {
  it('sends a message with formatted title and data', async () => {
    const { supportRequest, pulseBot } = require('@/core/bot')
    const spy = jest
      .spyOn(pulseBot.telegram, 'sendMessage')
      .mockResolvedValue({})
    const title = 'TestTitle'
    const data = { foo: 'bar', count: 2 }
    await supportRequest(title, data)
    expect(spy).toHaveBeenCalledWith(
      'chat123',
      `🚀 ${title}\n\n${JSON.stringify(data)}`
    )
  })

  it('throws an error if sendMessage rejects', async () => {
    const { supportRequest, pulseBot } = require('@/core/bot')
    jest
      .spyOn(pulseBot.telegram, 'sendMessage')
      .mockImplementation(() => {
        throw new Error('fail')
      })
    await expect(supportRequest('T', { x: 1 })).rejects.toThrow(
      /Error supportRequest:/
    )
  })
})