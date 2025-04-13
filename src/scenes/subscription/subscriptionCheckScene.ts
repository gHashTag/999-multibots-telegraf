import { Scenes } from 'telegraf';
import { MyContext } from '@/interfaces';
// Для тестирования:
import * as dbModule from '@/libs/database';

const getUserSub = dbModule.getUserSub;

/**
 * Форматирует дату в читаемый вид
 * @param date Дата для форматирования
 * @returns Отформатированная дата в виде строки
 */
function formatDate(date: Date | null): string {
  if (!date) return 'Unknown';
  
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  
  return date.toLocaleDateString('en-US', options);
}

/**
 * Сцена для проверки текущей подписки пользователя
 */
export const subscriptionCheckScene = new Scenes.BaseScene<MyContext>('subscription-check');

subscriptionCheckScene.enter(async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply('Error: User not found');
      return await ctx.scene.leave();
    }

    // Получаем информацию о подписке пользователя
    const subscription = await getUserSub(userId.toString());

    // Проверяем наличие подписки и её статус
    if (!subscription) {
      // Пользователь без подписки
      if (ctx.chat) {
        await ctx.telegram.sendMessage(
          ctx.chat.id,
          `You don't have an active subscription.\n\nUse /subscribe to subscribe to our services.`,
          { parse_mode: 'Markdown' }
        );
      }
    } else if (subscription.is_active) {
      // Активная подписка
      const expiresAt = formatDate(subscription.expires_at);
      if (ctx.chat) {
        await ctx.telegram.sendMessage(
          ctx.chat.id,
          `Your subscription is active.\n\n` +
          `Plan: *${subscription.plan_id}*\n` +
          `Status: *Active*\n` +
          `Expires: *${expiresAt}*\n\n` +
          `Use /extend to extend your subscription.`,
          { parse_mode: 'Markdown' }
        );
      }
    } else {
      // Истекшая подписка
      const expiresAt = formatDate(subscription.expires_at);
      if (ctx.chat) {
        await ctx.telegram.sendMessage(
          ctx.chat.id,
          `Your subscription has expired.\n\n` +
          `Plan: *${subscription.plan_id}*\n` +
          `Status: *Expired*\n` +
          `Expired on: *${expiresAt}*\n\n` +
          `Use /subscribe to get a new subscription.`,
          { parse_mode: 'Markdown' }
        );
      }
    }

    await ctx.scene.leave();
  } catch (error) {
    console.error('Error in subscription check scene:', error);
    await ctx.reply('An error occurred while checking your subscription. Please try again later.');
    await ctx.scene.leave();
  }
});

// Позволяем пользователю выйти из сцены с помощью команды /cancel
subscriptionCheckScene.command('cancel', async (ctx) => {
  await ctx.reply('Subscription check cancelled.');
  await ctx.scene.leave();
});

// Обработчик по умолчанию для любого текста
subscriptionCheckScene.on('text', async (ctx) => {
  await ctx.reply('Use /cancel to exit subscription check.');
}); 