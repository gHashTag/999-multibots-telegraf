/**
 * Inngest Function: Model Training (Flux LoRA)
 *
 * Async model training with Replicate webhook callback
 * Based on: ai-server/src/inngest-functions/generateModelTraining.ts
 *
 * Flow:
 * 1. Receive event 'model/training.start'
 * 2. Start Replicate training (1-2 hours)
 * 3. Replicate sends webhook when complete
 * 4. Notify user in Telegram
 */

import Replicate from 'replicate'
// fs import removed - ZIP is now downloaded from Supabase URL, not local filesystem
import { supabase } from '@/core/supabase'
// 🔥 FIX: Removed static import - read from process.env at runtime to avoid race condition with Infisical
import { logger } from '@/utils/logger'
import { createInngestFailureHandler } from '../../client'
import type { Inngest } from 'inngest'

interface ModelTrainingEvent {
  name: 'model/training.start'
  data: {
    telegram_id: string
    bot_name: string
    modelName: string
    triggerWord: string
    zipUrl: string // 🔥 FIX: HTTP URL from Supabase Storage (not local filePath)
    steps: number
    is_ru: boolean
    gender: string
  }
}

export function createGenerateModelTrainingFunction(inngest: any) {
  return inngest.createFunction(
    {
      id: 'generate-model-training',
      name: 'Model Training - Flux LoRA',
      concurrency: [
        {
          limit: 2, // Max 2 concurrent trainings
        },
      ],
      retries: 0, // No retries for training - user can restart manually
      // 🔥 CRITICAL: Log errors to application logs (not just Inngest dashboard)
      onFailure: createInngestFailureHandler('Model Training - Flux LoRA'),
    },
    { event: 'model/training.start' },
    async ({ event, step }) => {
      const eventData = event.data as ModelTrainingEvent['data']
      const startTime = Date.now()

      logger.info('[INNGEST TRAINING] 🚀 Starting model training', {
        telegram_id: eventData.telegram_id,
        modelName: eventData.modelName,
      })

      // ✅ STEP 1: Validate credentials
      // 🔥 FIX: Read from process.env at runtime (after Infisical has loaded secrets)
      const credentials = await step.run('validate-credentials', async () => {
        const token = process.env.REPLICATE_API_TOKEN
        const username = process.env.REPLICATE_USERNAME

        if (!token || !username) {
          logger.error('[INNGEST TRAINING] ❌ Missing credentials!', {
            hasToken: !!token,
            hasUsername: !!username,
            envKeys: Object.keys(process.env).filter(k => k.includes('REPLICATE')).join(', '),
          })
          throw new Error('Missing REPLICATE_API_TOKEN or REPLICATE_USERNAME')
        }
        logger.info('[INNGEST TRAINING] Credentials validated')
        return { validated: true, token, username }
      })

      // ✅ STEP 2: Check for existing active training (prevent duplicates)
      const existingTraining = await step.run('check-duplicates', async () => {
        const { data } = await supabase
          .from('model_trainings')
          .select('id, replicate_training_id, status')
          .eq('user_id', eventData.telegram_id)
          .eq('model_name', eventData.modelName)
          .in('status', ['starting', 'processing'])
          .order('created_at', { ascending: false })
          .limit(1)

        if (data && data.length > 0) {
          logger.warn('[INNGEST TRAINING] Active training exists', {
            existing_training_id: data[0].replicate_training_id,
          })
          throw new Error('Active training already exists for this model')
        }

        return { hasDuplicate: false }
      })

      // ✅ STEP 3: Download and prepare ZIP file from Supabase URL
      const zipData = await step.run('prepare-zip', async () => {
        // 🔥 FIX: Download ZIP from Supabase URL instead of reading local file
        if (!eventData.zipUrl) {
          throw new Error('ZIP URL not provided in event data')
        }

        logger.info('[INNGEST TRAINING] Downloading ZIP from Supabase', {
          url: eventData.zipUrl.substring(0, 100) + '...',
        })

        // Download ZIP file from URL
        const response = await fetch(eventData.zipUrl)
        if (!response.ok) {
          throw new Error(`Failed to download ZIP: ${response.status} ${response.statusText}`)
        }

        const arrayBuffer = await response.arrayBuffer()
        const fileBuffer = Buffer.from(arrayBuffer)

        logger.info('[INNGEST TRAINING] ZIP file downloaded', {
          size: fileBuffer.length,
        })

        // Convert to base64 for Replicate
        const base64Data = fileBuffer.toString('base64')
        const dataUri = `data:application/zip;base64,${base64Data}`

        logger.info('[INNGEST TRAINING] Base64 conversion complete', {
          originalSize: fileBuffer.length,
          base64Length: base64Data.length,
        })

        return { dataUri, originalSize: fileBuffer.length }
      })

      // ✅ STEP 4: Create training on Replicate
      const trainingResult = await step.run('create-replicate-training', async () => {
        // 🔥 FIX: Use credentials from step 1 (loaded from process.env at runtime)
        const replicate = new Replicate({ auth: credentials.token })

        const destination = `${credentials.username}/${eventData.modelName}`

        // ✅ ВАЖНО: Webhook URL для получения callback от Replicate
        // Replicate REQUIRES HTTPS! Use BASE_WEBHOOK_URL from Infisical/env
        const baseUrl = process.env.BASE_WEBHOOK_URL || 'https://three-head-dragon.shop'
        const webhookUrl = `${baseUrl}/api/webhooks/replicate`

        logger.info('[INNGEST TRAINING] Creating Replicate training...', {
          destination,
          steps: eventData.steps,
          trigger_word: eventData.triggerWord,
          webhook: webhookUrl,
        })

        const training = await replicate.trainings.create(
          'ostris', // owner
          'flux-dev-lora-trainer', // model name
          'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497', // version
          {
            destination: destination as `${string}/${string}`,
            input: {
              input_images: zipData.dataUri,
              trigger_word: eventData.triggerWord,
              steps: eventData.steps,
              // Hardware optimization
              lora_rank: 128,
              optimizer: 'adamw8bit',
              batch_size: 1,
              resolution: '512,768,1024',
              learning_rate: 0.0001,
              wandb_project: 'flux_train_replicate',
            },
            // ✅ Webhook для callback после завершения тренировки
            webhook: webhookUrl,
            webhook_events_filter: ['completed'],
          }
        )

        logger.info('[INNGEST TRAINING] ✅ Training created successfully', {
          training_id: training.id,
          status: training.status,
          destination,
          webhook: webhookUrl,
          elapsed: `${Date.now() - startTime}ms`,
        })

        return {
          training_id: training.id,
          status: training.status,
          destination,
        }
      })

      // ✅ STEP 5: Save training record to Supabase
      await step.run('save-training-record', async () => {
        const trainingRecord = {
          user_id: eventData.telegram_id,
          model_name: eventData.modelName,
          trigger_word: eventData.triggerWord,
          zip_url: eventData.zipUrl, // 🔥 FIX: Use zipUrl from Supabase
          replicate_training_id: trainingResult.training_id,
          status: trainingResult.status,
          bot_name: eventData.bot_name,
          steps: eventData.steps,
          created_at: new Date().toISOString(),
        }

        const { error } = await supabase
          .from('model_trainings')
          .insert(trainingRecord)

        if (error) {
          logger.error('[INNGEST TRAINING] Database error (non-fatal)', {
            error: error.message,
          })
          // Don't throw - training already started
        } else {
          logger.info('[INNGEST TRAINING] Training record saved to database')
        }

        return { saved: !error }
      })

      // ✅ STEP 6: Send initial success message to user
      // NOTE: Cleanup step removed - ZIP is now stored in Supabase Storage, not locally
      await step.run('notify-user-started', async () => {
        try {
          const { getBotByName } = await import('@/core/bot')
          const { bot } = getBotByName(eventData.bot_name)

          if (bot) {
            const message = eventData.is_ru
              ? `✅ Тренировка модели запущена!\n\n📦 Модель: ${eventData.modelName}\n🆔 ID: ${trainingResult.training_id}\n⏱️ Время: ~1-2 часа\n\n🔔 Вы получите уведомление когда тренировка завершится.`
              : `✅ Model training started!\n\n📦 Model: ${eventData.modelName}\n🆔 ID: ${trainingResult.training_id}\n⏱️ Time: ~1-2 hours\n\n🔔 You'll receive notification when training completes.`

            await bot.telegram.sendMessage(eventData.telegram_id, message)

            logger.info('[INNGEST TRAINING] User notified about training start')
          }
        } catch (notifyError) {
          logger.error('[INNGEST TRAINING] Failed to notify user (non-fatal)', {
            error: notifyError instanceof Error ? notifyError.message : String(notifyError),
          })
        }

        return { notified: true }
      })

      logger.info('[INNGEST TRAINING] 🎉 Training initiated successfully', {
        training_id: trainingResult.training_id,
        total_elapsed: `${Date.now() - startTime}ms`,
      })

      return {
        success: true,
        training_id: trainingResult.training_id,
        destination: trainingResult.destination,
        telegram_id: eventData.telegram_id,
        elapsed_ms: Date.now() - startTime,
      }
    }
  )
}
