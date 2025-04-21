import request from 'supertest'
import express, { Express } from 'express'
import { Telegraf } from 'telegraf'
import { setupWebhookHandlers } from '@/webhookHandler'

describe('setupWebhookHandlers', () => {
  let app: Express
  let bot: any
  beforeEach(async () => {
    // Stub Telegraf bot with minimal methods
    bot = {
      telegram: { getMe: jest.fn().mockResolvedValue({ username: 'botuser' }) },
      secretPathComponent: jest.fn().mockReturnValue('token123'),
      handleUpdate: jest.fn((update: any, res: any) => res.end()),
    }
    // Prepare app without starting server
    app = setupWebhookHandlers([bot as Telegraf<any>], false)
  })

  it('responds to health check GET /', async () => {
    const res = await request(app).get('/')
    expect(res.status).toBe(200)
    expect(res.text).toBe('Telegram Bot API вебхук сервер работает!')
  })

  it('calls handleUpdate on valid POST /telegraf/:token', async () => {
    const payload = { update_id: 1 }
    const res = await request(app).post('/telegraf/token123').send(payload)
    expect(bot.handleUpdate).toHaveBeenCalledWith(payload, expect.any(Object))
    // Response from handler is 200
    expect(res.status).toBe(200)
  })

  it('returns 404 for unknown token', async () => {
    const res = await request(app).post('/telegraf/badtoken').send({})
    expect(res.status).toBe(404)
    expect(res.text).toBe('Bot not found')
  })
})
