import { Scenes, Markup } from 'telegraf';
import { MyContext } from '@/interfaces';
import { isRussian } from '@/helpers';
import { handleHelpCancel } from '@/handlers';
import { inngest } from '@/inngest-functions/clients';
import { logger } from '@/utils/logger';

const SCENE_ID = 'ideasGeneratorScene';

/**
 * Функция для генерации идей для различных тем
 * Использует LLM через Inngest для получения идей
 */
export const ideasGeneratorScene = new Scenes.WizardScene<MyContext>(
  SCENE_ID,
  async (ctx) => {
    const isRu = isRussian(ctx);
    
    try {
      await ctx.reply(
        isRu
          ? 'Генератор идей: введите тему, для которой нужны идеи (например, "идеи для статьи о технологиях")'
          : 'Ideas Generator: enter a topic you need ideas for (for example, "ideas for an article about technology")',
        Markup.keyboard([
          [isRu ? 'Отмена' : 'Cancel'],
        ]).resize()
      );
      
      logger.info('User entered ideas generator scene', {
        user_id: ctx.from?.id,
        username: ctx.from?.username
      });
      
      return ctx.wizard.next();
    } catch (error) {
      logger.error('Error in ideas generator scene (step 1):', error);
      await ctx.reply(
        isRu
          ? 'Произошла ошибка при запуске генератора идей. Пожалуйста, попробуйте позже.'
          : 'An error occurred while starting the ideas generator. Please try again later.'
      );
      return ctx.scene.leave();
    }
  },
  async (ctx) => {
    const isRu = isRussian(ctx);
    
    // Проверяем запрос на отмену или помощь
    const isCancel = await handleHelpCancel(ctx);
    if (isCancel) {
      return ctx.scene.leave();
    }

    // Проверяем, что есть текст сообщения
    if (!ctx.message || !('text' in ctx.message) || !ctx.message.text) {
      await ctx.reply(
        isRu
          ? 'Пожалуйста, введите текстовый запрос для генерации идей.'
          : 'Please enter a text prompt for idea generation.'
      );
      return;
    }

    const prompt = ctx.message.text;
    
    try {
      // Отправляем уведомление о том, что начали генерацию
      await ctx.reply(
        isRu
          ? '🧠 Генерирую идеи по вашему запросу... Это может занять до 30 секунд.'
          : '🧠 Generating ideas based on your request... This may take up to 30 seconds.'
      );
      
      logger.info('Generating ideas for user request', {
        user_id: ctx.from?.id,
        username: ctx.from?.username,
        prompt: prompt
      });
      
      // Отправляем запрос на генерацию идей через Inngest
      await inngest.send({
        name: 'generate.ideas.requested',
        data: {
          userId: ctx.from?.id,
          prompt: prompt,
          language: isRu ? 'ru' : 'en',
          chatId: ctx.chat?.id,
          messageId: ctx.message.message_id
        }
      });
      
      // В реальности идеи будут отправлены из Inngest функции обратно пользователю
      // Здесь мы завершаем сцену
      return ctx.scene.leave();
    } catch (error) {
      logger.error('Error in ideas generator scene (step 2):', error);
      await ctx.reply(
        isRu
          ? 'Произошла ошибка при генерации идей. Пожалуйста, попробуйте позже.'
          : 'An error occurred while generating ideas. Please try again later.'
      );
      return ctx.scene.leave();
    }
  }
);

export default ideasGeneratorScene; 