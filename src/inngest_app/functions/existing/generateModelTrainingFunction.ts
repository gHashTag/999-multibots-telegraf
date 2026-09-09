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
import { logger } from '@/utils/logger'
import { sanitizeModelName } from '@/helpers/sanitizeModelName'
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

// Import inngest client
import { inngest, createInngestFailureHandler } from '@/inngest_app/client'
import { NonRetriableError } from 'inngest'
import { isSafeMode, skippedInSafeMode } from '@/inngest_app/safeMode'

export const generateModelTrainingFunction = inngest.createFunction(
  {
    // Canonical id (spec-first manifest). Legacy id was 'generate-model-training'.
    id: 'training-model-start',
    name: '🧠 Model Training - Flux LoRA',
    concurrency: [
      {
        limit: 2, // Max 2 concurrent trainings
      },
    ],
    retries: 0, // No retries for training - user can restart manually
    // Paid Replicate training → admin visibility on failure.
    onFailure: createInngestFailureHandler('training-model-start'),
  },
  // Canonical event first, legacy event kept for existing senders.
  [{ event: 'training/model.start' }, { event: 'model/training.start' }],
  async ({ event, step }) => {
    const eventData = event.data as ModelTrainingEvent['data']
    const startTime = Date.now()

    // Defense-in-depth: steps must be a positive integer. The training wizards
    // now reject a zero-cost (steps=0) training at the cost gate, but this served
    // handler is the execution choke point — any emitter of model/training.start
    // with steps<=0 (or NaN/undefined) would otherwise run a training the user
    // paid nothing for, at the owner's provider cost, with no downstream check.
    // retries:0 means this throw is terminal (no retry loop).
    if (!Number.isInteger(eventData.steps) || eventData.steps <= 0) {
      logger.error('[INNGEST TRAINING] ❌ Invalid steps — refusing training', {
        telegram_id: eventData.telegram_id,
        steps: eventData.steps,
      })
      throw new NonRetriableError(
        `Invalid training steps: ${eventData.steps}`
      )
    }

    logger.info('[INNGEST TRAINING] 🚀 Starting model training', {
      telegram_id: eventData.telegram_id,
      modelName: eventData.modelName,
    })

    // ✅ STEP 1: Validate credentials
    // 🔥 FIX: Read from process.env at runtime, return minimal data to avoid size limit
    await step.run('validate-credentials', async () => {
      const token = process.env.REPLICATE_API_TOKEN
      const username = process.env.REPLICATE_USERNAME

      if (!token || !username) {
        logger.error('[INNGEST TRAINING] ❌ Missing credentials!', {
          hasToken: !!token,
          hasUsername: !!username,
          envKeys: Object.keys(process.env)
            .filter(k => k.includes('REPLICATE'))
            .join(', '),
        })
        throw new Error('Missing REPLICATE_API_TOKEN or REPLICATE_USERNAME')
      }
      logger.info('[INNGEST TRAINING] Credentials validated')
      return { validated: true }
    })

    // ✅ STEP 2: Check for existing active training (prevent duplicates)
    const existingTraining = await step.run('check-duplicates', async () => {
      // Query the SAME user column this handler inserts (save-pending-record
      // below writes `telegram_id`), and that neuroPhoto/Haim read. It used to
      // filter `.eq('user_id', eventData.telegram_id)` — a column this handler
      // never populates — so the dedup check never matched its own PENDING /
      // starting / processing rows and the duplicate-prevention guard silently
      // did nothing.
      const { data } = await supabase
        .from('model_trainings')
        .select('id, replicate_training_id, status')
        .eq('telegram_id', eventData.telegram_id)
        .eq('model_name', eventData.modelName)
        // Include 'PENDING': this function inserts its own row as 'PENDING'
        // first (below) and only flips it to 'starting' at the last step, so a
        // second model/training.start for the same user+model arriving during
        // that multi-second window would otherwise miss the in-progress row and
        // start a DUPLICATE (expensive) Replicate training.
        .in('status', ['PENDING', 'starting', 'processing'])
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

    // ✅ STEP 3: Validate ZIP URL (no download - pass URL directly to Replicate)
    // 🔥 FIX: Removed HEAD request to avoid Inngest capturing response object
    // Replicate accepts public URLs directly!
    const zipValidation = await step.run('validate-zip-url', async () => {
      if (!eventData.zipUrl) {
        // Missing input cannot appear on retry — terminal.
        throw new NonRetriableError('ZIP URL not provided in event data')
      }

      // Just verify URL exists, don't fetch anything
      // Replicate will handle URL validation
      logger.info('[INNGEST TRAINING] ZIP URL will be validated by Replicate', {
        url: eventData.zipUrl.substring(0, 80) + '...',
      })

      return { urlValid: true }
    })

    // Safe mode: create-replicate-model / start-training call a paid provider.
    if (isSafeMode(event)) {
      const skipped = skippedInSafeMode('create-replicate-model + training')
      logger.warn('[INNGEST TRAINING] 🛡️ safe mode — training skipped', {
        telegram_id: eventData.telegram_id,
        ...skipped,
      })
      return { success: false, ...skipped }
    }

    // ✅ STEP 4: Sanitize model name and create model on Replicate
    // 🔥 FIX: Read credentials from process.env to avoid step output size limit
    const modelInfo = await step.run('create-replicate-model', async () => {
      const token = process.env.REPLICATE_API_TOKEN
      const username = process.env.REPLICATE_USERNAME

      const replicate = new Replicate({ auth: token })

      // Sanitize model name (remove spaces, special chars, make lowercase)
      const sanitizedName = sanitizeModelName(eventData.modelName)
      // Add unique timestamp to avoid conflicts
      const uniqueModelName = `${sanitizedName}-${Date.now()}`
      const destination = `${username}/${uniqueModelName}`

      logger.info('[INNGEST TRAINING] Preparing model destination...', {
        destination,
        owner: username,
        originalName: eventData.modelName,
        sanitizedName: uniqueModelName,
      })

      // Check if model exists
      let modelExists = false
      try {
        await replicate.models.get(username, uniqueModelName)
        logger.info('[INNGEST TRAINING] Model already exists', { destination })
        modelExists = true
      } catch (error: any) {
        if (error?.response?.status === 404) {
          logger.info('[INNGEST TRAINING] Model does not exist, creating...', {
            destination,
          })
          modelExists = false
        } else {
          throw error
        }
      }

      // Create model if it doesn't exist
      if (!modelExists) {
        try {
          await replicate.models.create(username, uniqueModelName, {
            description: `LoRA: ${eventData.triggerWord}`,
            visibility: 'public',
            hardware: 'gpu-l40s',
          })
          logger.info('[INNGEST TRAINING] ✅ Model created successfully', {
            destination,
          })
          // Wait for model to be fully initialized
          await new Promise(resolve => setTimeout(resolve, 5000))
        } catch (createError: any) {
          logger.error('[INNGEST TRAINING] Failed to create model', {
            error: createError?.message,
            destination,
          })
          throw new Error(
            `Failed to create Replicate model: ${createError?.message}`
          )
        }
      }

      return { destination, uniqueModelName }
    })

    // ✅ STEP 5a: Save PENDING record BEFORE starting Replicate (prevents lost trainings!)
    // 🔥 FIX: Create DB record FIRST, then start expensive Replicate training
    // This prevents the bug where training succeeds but DB save fails silently
    const pendingRecord = await step.run('save-pending-record', async () => {
      const trainingRecord = {
        telegram_id: eventData.telegram_id,
        model_name: eventData.modelName,
        trigger_word: eventData.triggerWord,
        zip_url: eventData.zipUrl,
        replicate_training_id: `pending-${Date.now()}`, // Temporary ID until training starts
        status: 'PENDING', // Will be updated to 'starting' when Replicate accepts
        bot_name: eventData.bot_name,
        steps: eventData.steps,
        is_ru: eventData.is_ru,
        created_at: new Date().toISOString(),
      }

      const { data, error } = await supabase
        .from('model_trainings')
        .insert(trainingRecord)
        .select('id')
        .single()

      if (error) {
        // 🔥 CRITICAL: THROW error - don't proceed if we can't track the training!
        logger.error('[INNGEST TRAINING] ❌ Failed to save pending record', {
          error: error.message,
          telegram_id: eventData.telegram_id,
          model_name: eventData.modelName,
        })
        throw new Error(
          `Database error: ${error.message}. Training not started to prevent lost records.`
        )
      }

      logger.info(
        '[INNGEST TRAINING] ✅ Pending record saved (training will be tracked)',
        {
          record_id: data.id,
          model_name: eventData.modelName,
        }
      )

      return { record_id: data.id }
    })

    // ✅ STEP 5b: Create training on Replicate (now safe - we have a DB record)
    // 🔥 FIX: Read credentials from process.env to avoid step output size limit
    const trainingResult = await step.run(
      'create-replicate-training',
      async () => {
        const token = process.env.REPLICATE_API_TOKEN
        const replicate = new Replicate({ auth: token })

        const destination = modelInfo.destination

        // ✅ ВАЖНО: Webhook URL для получения callback от Replicate
        // Replicate REQUIRES HTTPS! Use BASE_WEBHOOK_URL from Infisical/env
        const baseUrl = process.env.BASE_WEBHOOK_URL
        if (!baseUrl) {
          throw new Error(
            'BASE_WEBHOOK_URL is not configured! Cannot register webhook with Replicate. ' +
              'Set it in Infisical (e.g. https://999-multibots-telegraf-production.up.railway.app)'
          )
        }
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
              // 🔥 FIX: Pass URL directly instead of base64 (avoids step output size limit)
              input_images: eventData.zipUrl,
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
      }
    )

    // ✅ STEP 5c: Update record with real training_id (CRITICAL for webhook matching!)
    await step.run('update-training-record', async () => {
      const { error } = await supabase
        .from('model_trainings')
        .update({
          replicate_training_id: trainingResult.training_id,
          status: trainingResult.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pendingRecord.record_id)

      if (error) {
        // 🔥 CRITICAL: THROW error - webhook won't work without correct training_id!
        logger.error('[INNGEST TRAINING] ❌ Failed to update training record', {
          error: error.message,
          record_id: pendingRecord.record_id,
          training_id: trainingResult.training_id,
        })
        throw new Error(
          `Failed to update training record: ${error.message}. Webhook may not work!`
        )
      }

      logger.info(
        '[INNGEST TRAINING] ✅ Training record updated with Replicate ID',
        {
          record_id: pendingRecord.record_id,
          training_id: trainingResult.training_id,
        }
      )

      return { updated: true }
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
          error:
            notifyError instanceof Error
              ? notifyError.message
              : String(notifyError),
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
