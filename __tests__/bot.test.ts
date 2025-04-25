import { Telegraf } from 'telegraf'
import { validateBotToken, isPortInUse } from '../src/bot'
import { initializeMocks } from './mocks/setup'

describe('Bot functionality', () => {
  let testBot: Telegraf

  beforeEach(() => {
    initializeMocks()
    testBot = new Telegraf('test-token')
  })

  test('bot instance should be defined', () => {
    expect(testBot).toBeDefined()
  })

  describe('validateBotToken', () => {
    test('should return false for invalid token', async () => {
      const result = await validateBotToken('invalid-token')
      expect(result).toBe(false)
    })
  })

  describe('isPortInUse', () => {
    test('should return false for unused port', async () => {
      const result = await isPortInUse(9999)
      expect(result).toBe(false)
    })

    test('should return true for used port', async () => {
      // First create a server on the port
      const net = require('net')
      const server = net.createServer()
      await new Promise(resolve => server.listen(8888, resolve))

      const result = await isPortInUse(8888)
      expect(result).toBe(true)

      // Cleanup
      await new Promise(resolve => server.close(resolve))
    })
  })
})
