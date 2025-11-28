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
import { supabase } from '@/core/supabase'
import { REPLICATE_API_TOKEN, REPLICATE_USERNAME } from '@/config'
import { logger } from '@/utils/logger'
import type { Inngest } from 'inngest'

interface ModelTrainingEvent {
  name: 'model/training.start'
  data: {
    telegram_id: string
    bot_name: string
    modelName: string
    triggerWord: string
    zipUrl: string // HTTP URL to ZIP file
    steps: number | string // Can be string from scene
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
    },
    { event: 'model/training.start' },
    async ({ event, step }) => {
      try {
        const eventData = event.data as ModelTrainingEvent['data']
        const startTime = Date.now()

        // ✅ Validate and normalize steps (can be string or number)
        const steps =
          typeof eventData.steps === 'string'
            ? parseInt(eventData.steps, 10)
            : eventData.steps

        if (isNaN(steps) || steps <= 0) {
          throw new Error(`Invalid steps value: ${eventData.steps}`)
        }

        logger.info('[INNGEST TRAINING] 🚀 Starting model training', {
          telegram_id: eventData.telegram_id,
          modelName: eventData.modelName,
          zipUrl: eventData.zipUrl,
          steps,
        })

        // ✅ STEP 1: Validate credentials
        await step.run('validate-credentials', async () => {
          if (!REPLICATE_API_TOKEN || !REPLICATE_USERNAME) {
            throw new Error('Missing REPLICATE_API_TOKEN or REPLICATE_USERNAME')
          }
          logger.info('[INNGEST TRAINING] Credentials validated')
          return { validated: true }
        })

        // ✅ STEP 2: Check for existing active training (prevent duplicates)
        const existingTraining = await step.run(
          'check-duplicates',
          async () => {
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
          }
        )

        // ✅ STEP 3: Download and prepare ZIP file
        const zipData = await step.run('prepare-zip', async () => {
          logger.info('[INNGEST TRAINING] Downloading ZIP file from URL', {
            zipUrl: eventData.zipUrl,
          })

          // Download ZIP file from HTTP URL
          const response = await fetch(eventData.zipUrl)
          if (!response.ok) {
            throw new Error(
              `Failed to download ZIP file: ${response.status} ${response.statusText}`
            )
          }

          const fileBuffer = Buffer.from(await response.arrayBuffer())

          logger.info('[INNGEST TRAINING] ZIP file downloaded', {
            size: fileBuffer.length,
            url: eventData.zipUrl,
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
        const trainingResult = await step.run(
          'create-replicate-training',
          async () => {
            const replicate = new Replicate({ auth: REPLICATE_API_TOKEN })

            const destination = `${REPLICATE_USERNAME}/${eventData.modelName}`

            // ✅ ВАЖНО: Webhook URL для получения callback от Replicate
            const webhookUrl = `${process.env.BASE_WEBHOOK_URL || 'https://three-head-dragon.shop'}/api/webhooks/replicate`

            // Use normalized steps
            const normalizedSteps =
              typeof eventData.steps === 'string'
                ? parseInt(eventData.steps, 10)
                : eventData.steps

            logger.info('[INNGEST TRAINING] Creating Replicate training...', {
              destination,
              steps: normalizedSteps,
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
                  steps: normalizedSteps,
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
          }
        )

        // ✅ STEP 5: Save training record to Supabase
        await step.run('save-training-record', async () => {
          const trainingRecord = {
            user_id: eventData.telegram_id,
            model_name: eventData.modelName,
            trigger_word: eventData.triggerWord,
            zip_url: eventData.zipUrl,
            replicate_training_id: trainingResult.training_id,
            status: trainingResult.status,
            bot_name: eventData.bot_name,
            steps:
              typeof eventData.steps === 'string'
                ? parseInt(eventData.steps, 10)
                : eventData.steps,
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

        // ✅ STEP 6: No cleanup needed (file is on remote server)
        await step.run('cleanup-zip', async () => {
          logger.info(
            '[INNGEST TRAINING] ZIP file cleanup skipped (remote URL)'
          )
          return { cleaned: true }
        })

        // ✅ STEP 7: Send initial success message to user
        await step.run('notify-user-started', async () => {
          try {
            const { getBotByName } = await import('@/core/bot')
            const { bot } = getBotByName(eventData.bot_name)

            if (bot) {
              const message = eventData.is_ru
                ? `✅ Тренировка модели запущена!\n\n📦 Модель: ${eventData.modelName}\n🆔 ID: ${trainingResult.training_id}\n⏱️ Время: ~1-2 часа\n\n🔔 Вы получите уведомление когда тренировка завершится.`
                : `✅ Model training started!\n\n📦 Model: ${eventData.modelName}\n🆔 ID: ${trainingResult.training_id}\n⏱️ Time: ~1-2 hours\n\n🔔 You'll receive notification when training completes.`

              await bot.telegram.sendMessage(eventData.telegram_id, message)

              logger.info(
                '[INNGEST TRAINING] User notified about training start'
              )
            }
          } catch (notifyError) {
            logger.error(
              '[INNGEST TRAINING] Failed to notify user (non-fatal)',
              {
                error:
                  notifyError instanceof Error
                    ? notifyError.message
                    : String(notifyError),
              }
            )
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
      } catch (error) {
        logger.error('[INNGEST TRAINING] ❌ Training failed', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        })

        // Return error in a serializable format
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          telegram_id: (event.data as any)?.telegram_id || 'unknown',
        }
      }
    }
  )
}
