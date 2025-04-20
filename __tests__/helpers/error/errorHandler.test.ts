import { setupErrorHandler } from '@/helpers/error/errorHandler';
import { logger } from '@/utils/logger';

describe('setupErrorHandler', () => {
  let bot: any;
  let catchCb: (err: any, ctx: any) => Promise<void>;

  beforeEach(() => {
    bot = { catch: jest.fn((fn) => { catchCb = fn; }) };
    jest.spyOn(logger, 'error').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    setupErrorHandler(bot);
  });

  afterEach(() => { jest.restoreAllMocks(); });

  test('registers catch handler', () => {
    expect(bot.catch).toHaveBeenCalled();
    expect(typeof catchCb).toBe('function');
  });

  test('handles authorization error', async () => {
    const err = { message: '401: Unauthorized', on: { method: 'sendMessage' } };
    const ctx = { botInfo: { username: 'bot' }, telegram: { token: 'tok' }, update: { update_id: 1 } };
    await catchCb(err, ctx);
    expect(logger.error).toHaveBeenCalledWith(
      '🔐 Ошибка авторизации Telegram API:', expect.any(Object)
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  test('handles non-authorization error', async () => {
    const err = { message: 'other error', on: { method: 'doSomething' } };
    const ctx = { botInfo: { username: 'bot' }, telegram: { token: 'tok' }, update: { update_id: 2 } };
    await catchCb(err, ctx);
    expect(logger.error).toHaveBeenCalledWith(
      '❌ Ошибка Telegram API:', expect.any(Object)
    );
  });
});