import { expect } from '@jest/globals'
import { setupWebhookHandlers } from '../src/webhookHandler'
import { Telegraf } from 'telegraf'
import express from 'express'
import { MyContext } from '../src/interfaces'
import http from 'http'

describe('Webhook Handlers', () => {
  let mockBot: jest.Mocked<Telegraf<MyContext>>
  let app: express.Express
  let consoleSpy: jest.SpyInstance
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    mockBot = {
      telegram: {
        getMe: jest.fn().mockResolvedValue({ username: 'test_bot' }),
      },
      secretPathComponent: jest.fn().mockReturnValue('test_token'),
      handleUpdate: jest.fn(),
    } as unknown as jest.Mocked<Telegraf<MyContext>>

    app = setupWebhookHandlers([mockBot], false)
  })

  afterEach(async () => {
    consoleSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  describe('Successful scenarios', () => {
    it('should register bot webhook', async () => {
      expect(mockBot.telegram.getMe).toHaveBeenCalled()
      expect(mockBot.secretPathComponent).toHaveBeenCalled()
    })

    it('should handle health check', async () => {
      const req = { method: 'GET', path: '/' } as any
      const res = { send: jest.fn() } as any

      app(req, res)
      expect(res.send).toHaveBeenCalledWith(
        'Telegram Bot API вебхук сервер работает!'
      )
    })

    it('should handle valid webhook', async () => {
      const req = {
        method: 'POST',
        path: '/telegraf/test_token',
        params: { token: 'test_token' },
        body: { update_id: 1 },
      } as any
      const res = {} as any

      app(req, res)
      expect(mockBot.handleUpdate).toHaveBeenCalledWith({ update_id: 1 }, res)
    })
  })

  describe('Error handling', () => {
    it('should handle registration error', async () => {
      const errorBot = {
        telegram: {
          getMe: jest.fn().mockRejectedValue(new Error('API error')),
        },
        secretPathComponent: jest.fn().mockReturnValue('error_token'),
        handleUpdate: jest.fn(),
      } as unknown as jest.Mocked<Telegraf<MyContext>>

      setupWebhookHandlers([errorBot], false)
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('should reject unknown token', async () => {
      const req = {
        method: 'POST',
        path: '/telegraf/invalid_token',
        params: { token: 'invalid_token' },
      } as any
      const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as any

      app(req, res)
      expect(res.status).toHaveBeenCalledWith(404)
    })
  })
})
