import { Telegraf } from 'telegraf';
import { hearsHandlers } from '../src/bot';

describe('hearsHandlers', () => {
  it('should register all expected message handlers', async () => {
    const bot = new Telegraf('TEST_TOKEN');
    hearsHandlers(bot);

    // Проверяем регистрацию обработчиков
    const handlers = bot.telegram.messageHandlers;
    expect(handlers.length).toBe(3); // Пример: /start, /help, текстовые сообщения

    // Проверяем конкретный обработчик
    const startHandler = handlers.find(h => h.regex?.pattern === /^\/start/);
    expect(startHandler).toBeDefined();
  });
});