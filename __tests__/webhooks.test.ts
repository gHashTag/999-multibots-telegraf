import { expect, jest } from '@jest/globals';
import { setupWebhookHandlers } from '../src/webhookHandler';
import { Telegraf } from 'telegraf';
import express from 'express';
import { MyContext } from '../src/interfaces';

describe('setupWebhookHandlers', () => {
  let mockBot: jest.Mocked<Telegraf<MyContext>>;
  let app: express.Express;

  beforeEach(() => {
    mockBot = {
      telegram: {
        getMe: jest.fn().mockResolvedValue({ username: 'test_bot' })
      },
      secretPathComponent: jest.fn().mockReturnValue('test_token'),
      handleUpdate: jest.fn()
    } as unknown as jest.Mocked<Telegraf<MyContext>>;

    app = setupWebhookHandlers([mockBot]);
  });

  test('should register bot webhook', async () => {
    expect(mockBot.telegram.getMe).toHaveBeenCalled();
    expect(mockBot.secretPathComponent).toHaveBeenCalled();
  });

  test('should handle health check', async () => {
    const req = { method: 'GET', path: '/' } as any;
    const res = {
      send: jest.fn(),
      status: jest.fn().mockReturnThis()
    } as any;

    app(req, res);
    expect(res.send).toHaveBeenCalledWith('Telegram Bot API вебхук сервер работает!');
  });

  test('should handle telegram webhook', async () => {
    const req = {
      method: 'POST',
      path: '/telegraf/test_token',
      params: { token: 'test_token' },
      body: { update_id: 1 }
    } as any;
    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn()
    } as any;

    app(req, res);
    expect(mockBot.handleUpdate).toHaveBeenCalledWith({ update_id: 1 }, res);
  });

  test('should reject unknown bot token', async () => {
    const req = {
      method: 'POST',
      path: '/telegraf/invalid_token',
      params: { token: 'invalid_token' },
      body: { update_id: 1 }
    } as any;
    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn()
    } as any;

    app(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith('Bot not found');
  });
});