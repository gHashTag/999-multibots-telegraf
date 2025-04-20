
// Mock Telegraf to control validateBotToken behavior
jest.mock('telegraf', () => ({
  Telegraf: jest.fn().mockImplementation(() => ({
    telegram: {
      getMe: jest.fn().mockResolvedValue({ id: 1, username: 'testbot' }),
    },
  })),
}))

// Import after mocking
import { validateBotToken, isPortInUse } from '@/bot'
import * as realNet from 'net'

describe('bot utility functions', () => {
  it('validateBotToken returns true when getMe succeeds', async () => {
    const result = await validateBotToken('valid-token')
    expect(result).toBe(true)
  })

  it('validateBotToken returns false when getMe throws', async () => {
    // Override Telegraf.getMe to throw
    const { Telegraf } = require('telegraf')
    (Telegraf as jest.Mock).mockImplementationOnce(() => ({
      telegram: { getMe: jest.fn().mockRejectedValue(new Error('fail')) }
    }))
    const result = await validateBotToken('invalid-token')
    expect(result).toBe(false)
  })

  it('isPortInUse returns false for a free port', async () => {
    // Port 0 instructs server to pick an unused port
    const free = await isPortInUse(0)
    expect(free).toBe(false)
  })

  it('isPortInUse returns true for a port already in use', async () => {
    // Create a server listening on an ephemeral port
    const server = realNet.createServer()
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, resolve)
    })
    const address = server.address()
    let port: number
    if (address && typeof address !== 'string') {
      port = address.port
    } else {
      server.close()
      throw new Error('Failed to obtain server port')
    }
    // Now the port is in use
    const inUse = await isPortInUse(port)
    expect(inUse).toBe(true)
    server.close()
  })
})