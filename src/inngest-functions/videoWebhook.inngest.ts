import { inngest } from '@/core/inngest/clients'
import { logger } from '@/utils/logger'
import { getBotByName } from '@/core/bot'
import { saveVideoToPath } from '@/utils/saveVideoToPath'
import { supabase } from '@/core/supabase'

export const videoWebhookFunction = inngest.createFunction(
  {
    id: 'video-webhook-handler',
    name: 'video/webhook',
    retries: 3,
  },
  { event: 'video/webhook' },
  async ({ event, step }) => {
    const { bot_name, telegram_id, output, status, error } = event.data

    logger.info('🎥 Получен вебхук видео:', {
      description: 'Video webhook received',
      bot_name,
      telegram_id,
      status,
    })

    if (status === 'failed') {
      logger.error('❌ Ошибка генерации видео:', {
        description: 'Video generation failed',
        error,
      })
      return { status: 'failed', error }
    }

    if (status !== 'success') {
      logger.error('❌ Неверный статус:', {
        description: 'Invalid status',
        status,
      })
      return { status: 'failed', error: `Invalid status: ${status}` }
    }

    const { bot, error: botError } = getBotByName(bot_name)
    if (botError || !bot) {
      throw new Error(`Bot ${bot_name} not found: ${botError}`)
    }

    try {
      // Сохраняем видео
      const videoPath = await step.run('save-video', () =>
        saveVideoToPath(output, `/tmp/video_${telegram_id}_${Date.now()}.mp4`)
      )

      // Отправляем видео пользователю
      await step.run('send-video', async () => {
        await bot.telegram.sendVideo(telegram_id, videoPath, {
          caption: '🎥 Ваше видео готово!',
        })
      })

      // Сохраняем информацию в БД
      await step.run('save-to-db', async () => {
        const { data, error: dbError } = await supabase
          .from('assets')
          .insert({
            type: 'video',
            trigger_word: 'video',
            telegram_id,
            public_url: output,
            text: event.data.prompt,
            model: event.data.videoModel,
          })
          .select()
          .single()

        if (dbError) {
          throw new Error(`Failed to save to database: ${dbError.message}`)
        }

        return data
      })

      return { status: 'success' }
    } catch (error) {
      logger.error('❌ Ошибка при обработке видео:', {
        description: 'Error processing video',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      throw error
    }
  }
)
