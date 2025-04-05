import { supabase } from '@/core/supabase'
import { getBotByName } from '@/core/bot'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { getUserByTelegramIdString } from '@/core/supabase'
import { getTelegramIdFromFinetune } from '@/core/bfl'
import { logger } from '@/utils/logger'
import { inngest } from '@/core/inngest/clients'

export async function notifyTrainingSuccess(
  finetuneId: string,
  status: string,
  result: string
): Promise<void> {
  try {
    logger.info({
      message: '🔔 Starting training success notification',
      finetuneId,
      status,
    })

    const telegram_id = await getTelegramIdFromFinetune(finetuneId)
    logger.info({
      message: '👤 Retrieved Telegram ID',
      finetuneId,
      telegram_id,
    })

    const data = await getUserByTelegramIdString(telegram_id)
    const bot_name = data.users.bot_name
    const language_code = data.users.language_code

    logger.info({
      message: '🤖 Bot details fetched',
      bot_name,
      language_code,
      telegram_id,
    })

    await inngest.send({
      name: 'model/training.status_update.started',
      data: { finetuneId, status },
    })

    const { error: updateError } = await supabase
      .from('model_trainings')
      .update({ status, result, api: 'bfl' })
      .eq('finetune_id', finetuneId)

    if (updateError) {
      logger.error({
        message: '❌ Failed to update training status',
        finetuneId,
        error: updateError,
      })

      await inngest.send({
        name: 'model/training.status_update.failed',
        data: {
          finetuneId,
          error: updateError.message,
        },
      })
      return
    }

    logger.info({
      message: '✅ Training status updated',
      finetuneId,
      status,
    })

    const { bot } = getBotByName(bot_name) as { bot: Telegraf<MyContext> }

    await bot.telegram.sendMessage(
      telegram_id,
      language_code === 'ru'
        ? `🎉 Ваша модель успешно натренирована!`
        : `🎉 Your model has been trained successfully!`
    )

    logger.info({
      message: '📨 Success notification sent',
      telegram_id,
      bot_name,
    })

    await inngest.send({
      name: 'model/training.completed',
      data: {
        finetuneId,
        status,
        telegram_id,
        bot_name,
      },
    })
  } catch (error) {
    logger.error({
      message: '🚨 Critical error in training notification',
      finetuneId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    await inngest.send({
      name: 'model/training.notification_failed',
      data: {
        finetuneId,
        error: error instanceof Error ? error.message : String(error),
        status,
      },
    })
  }
}
